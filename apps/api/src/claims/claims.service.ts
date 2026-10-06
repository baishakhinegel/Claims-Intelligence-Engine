import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Assessment, Claim } from '../generated/prisma/client';
import { PROMPT_VERSION } from '../llm/assessment.prompt';
import { CLAIM_JUDGE, ClaimJudge, JudgeError } from '../llm/claim-judge.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AssessClaimDto, ClaimCategoryDto } from './dto/assess-claim.dto';
import { AssessmentResponse } from './dto/assessment-response.dto';
import { extractSignals, guardrailFlags } from './evidence-signals';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);
  private readonly reviewThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLAIM_JUDGE) private readonly judge: ClaimJudge,
    config: ConfigService,
  ) {
    this.reviewThreshold = Number(config.get('REVIEW_CONFIDENCE_THRESHOLD') ?? 0.75);
  }

  /**
   * The core use case:
   *   claim + evidence  ->  LLM judgement  ->  guardrails  ->  persist  ->  respond
   *
   * Ordering matters:
   *  - validate & load the claim first (fail fast, no wasted LLM spend),
   *  - check the idempotency cache (same input = same answer, zero cost),
   *  - call the LLM OUTSIDE any DB transaction (never hold a connection for
   *    a multi-second network call),
   *  - then write claim status + assessment atomically.
   */
  async assess(dto: AssessClaimDto): Promise<AssessmentResponse> {
    // 1. Resolve the claim — existing (workflow) or inline (ad-hoc assessment)
    let existing: Claim | null = null;
    if (dto.claimId) {
      existing = await this.prisma.claim.findUnique({ where: { id: dto.claimId } });
      if (!existing) throw new NotFoundException(`Claim ${dto.claimId} not found`);
      if (existing.status === 'REJECTED') {
        throw new ConflictException('This claim was rejected at screening and cannot be assessed.');
      }
    }

    const claimText = existing?.claimText ?? dto.claimText!;
    const productName = existing?.productName ?? dto.productName ?? 'Unspecified product';
    const category = (existing?.category ?? dto.category ?? 'EFFICACY') as ClaimCategoryDto;
    const market = existing?.market ?? dto.market?.toUpperCase() ?? 'EU';
    const evidence = dto.evidence;

    // 2. Idempotency: identical claim + evidence + prompt + model → reuse the stored verdict
    const inputHash = this.hashInput(claimText, evidence);
    const cached = await this.prisma.assessment.findFirst({
      where: { inputHash, ...(existing ? { claimId: existing.id } : {}) },
      include: { claim: true },
      orderBy: { createdAt: 'desc' },
    });
    if (cached) {
      this.logger.log(`Cache hit for input ${inputHash.slice(0, 12)}…`);
      return this.toResponse(cached.claim, cached, true);
    }

    // 3. Deterministic signals + LLM judgement
    const signals = extractSignals(claimText, evidence);
    let result;
    try {
      result = await this.judge.assess({ productName, claimText, category, market, evidence, signals });
    } catch (err) {
      if (err instanceof JudgeError) {
        this.logger.error(err.message);
        throw new BadGatewayException('The AI assessment service is unavailable. Please try again.');
      }
      throw err;
    }
    const { output } = result;

    // 4. Governance: cross-check the model and decide whether a human must look
    const flags = guardrailFlags(signals, output.verdict);
    const requiresHumanReview =
      output.confidence < this.reviewThreshold ||
      output.verdict === 'INSUFFICIENT_EVIDENCE' ||
      flags.length > 0;

    // 5. Persist claim status + assessment atomically
    const { claim, assessment } = await this.prisma.$transaction(async (tx) => {
      const claim = existing
        ? await tx.claim.update({ where: { id: existing.id }, data: { status: 'ASSESSED' } })
        : await tx.claim.create({
            data: { productName, claimText, category, market, status: 'ASSESSED' },
          });

      const assessment = await tx.assessment.create({
        data: {
          claimId: claim.id,
          evidenceText: evidence,
          inputHash,
          verdict: output.verdict,
          isJustified: output.verdict === 'JUSTIFIED',
          confidenceScore: output.confidence,
          reasoning: output.reasoning,
          supportingPoints: output.supporting_points,
          gaps: output.gaps,
          criteria: output.criteria,
          guardrailFlags: flags,
          requiresHumanReview,
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens ?? null,
          completionTokens: result.completionTokens ?? null,
          rawResponse: (result.raw as object | undefined) ?? undefined,
        },
      });
      return { claim, assessment };
    });

    this.logger.log(
      `Assessed claim ${claim.id}: ${assessment.verdict} @ ${assessment.confidenceScore} ` +
        `(${result.provider}/${result.model}, ${result.latencyMs} ms, review=${requiresHumanReview})`,
    );
    return this.toResponse(claim, assessment, false);
  }

  /** Recent claims with their latest assessment — feeds the history panel. */
  async findRecent(limit = 10) {
    const claims = await this.prisma.claim.findMany({
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      include: { assessments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return claims.map(({ assessments, ...claim }) => ({
      ...claim,
      latestAssessment: assessments[0] ? this.toResponse(claim, assessments[0], false).assessment : null,
    }));
  }

  /** One claim with its full assessment history (audit trail). */
  async findOne(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: { assessments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    const { assessments, ...rest } = claim;
    return {
      ...rest,
      assessments: assessments.map((a) => ({
        ...this.toResponse(rest, a, false).assessment,
        evidenceText: a.evidenceText,
      })),
    };
  }

  private hashInput(claimText: string, evidence: string): string {
    return createHash('sha256')
      .update([claimText, evidence, PROMPT_VERSION, this.judge.provider, this.judge.model].join('\u0000'))
      .digest('hex');
  }

  private toResponse(claim: Claim, a: Assessment, cached: boolean): AssessmentResponse {
    return {
      claim: {
        id: claim.id,
        productName: claim.productName,
        claimText: claim.claimText,
        category: claim.category,
        market: claim.market,
        status: claim.status,
      },
      assessment: {
        id: a.id,
        justified: a.isJustified,
        verdict: a.verdict,
        confidenceScore: a.confidenceScore,
        reasoning: a.reasoning,
        supportingPoints: a.supportingPoints,
        gaps: a.gaps,
        criteria: (a.criteria ?? {}) as Record<string, string>,
        guardrailFlags: a.guardrailFlags,
        requiresHumanReview: a.requiresHumanReview,
        provider: a.provider,
        model: a.model,
        promptVersion: a.promptVersion,
        latencyMs: a.latencyMs,
        createdAt: a.createdAt.toISOString(),
      },
      cached,
    };
  }
}
