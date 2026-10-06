import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaimsService } from '../src/claims/claims.service';
import { ClaimJudge, JudgeError, JudgeInput, JudgeResult } from '../src/llm/claim-judge.interface';
import { MockClaimJudge } from '../src/llm/mock-claim-judge';
import { JudgeOutput } from '../src/llm/judge-output.schema';
import { PrismaService } from '../src/prisma/prisma.service';

const STRONG_EVIDENCE =
  'Randomised, double-blind, vehicle-controlled study on n=62 women aged 40-65. ' +
  'Crow’s-feet wrinkle depth measured by PRIMOS 3D imaging. At D28 mean wrinkle depth decreased ' +
  'by 23.4% vs baseline (p<0.001); vehicle -6.1%.';

/** Minimal in-memory Prisma double — enough to exercise the service logic. */
function fakePrisma() {
  const claims: any[] = [];
  const assessments: any[] = [];
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const client: any = {
    claim: {
      findUnique: jest.fn(async ({ where }) => claims.find((c) => c.id === where.id) ?? null),
      create: jest.fn(async ({ data }) => {
        const c = { id: id(), createdAt: new Date(), updatedAt: new Date(), ...data };
        claims.push(c);
        return c;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(claims.find((c) => c.id === where.id), data)),
    },
    assessment: {
      findFirst: jest.fn(async ({ where }) => {
        const a = assessments.find((x) => x.inputHash === where.inputHash);
        return a ? { ...a, claim: claims.find((c) => c.id === a.claimId) } : null;
      }),
      create: jest.fn(async ({ data }) => {
        const a = { id: id(), createdAt: new Date(), ...data };
        assessments.push(a);
        return a;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: any) => any) => fn(client)),
    _claims: claims,
    _assessments: assessments,
  };
  return client;
}

class StubJudge implements ClaimJudge {
  provider = 'stub';
  model = 'stub-1';
  calls: JudgeInput[] = [];
  constructor(private readonly out: Partial<JudgeOutput> | Error) {}
  async assess(input: JudgeInput): Promise<JudgeResult> {
    this.calls.push(input);
    if (this.out instanceof Error) throw this.out;
    return {
      output: {
        verdict: 'JUSTIFIED',
        confidence: 0.9,
        reasoning: 'ok',
        supporting_points: [],
        gaps: [],
        criteria: {
          endpoint_match: 'MET',
          magnitude: 'MET',
          timepoint: 'MET',
          study_design: 'MET',
          statistics: 'MET',
          population: 'MET',
        },
        ...this.out,
      },
      provider: this.provider,
      model: this.model,
      promptVersion: 'test',
      latencyMs: 5,
    };
  }
}

const config = new ConfigService({ REVIEW_CONFIDENCE_THRESHOLD: '0.75' });
const build = (prisma: any, judge: ClaimJudge) =>
  new ClaimsService(prisma as PrismaService, judge, config);

describe('ClaimsService.assess', () => {
  it('creates the claim, persists the assessment and returns the verdict', async () => {
    const prisma = fakePrisma();
    const svc = build(prisma, new StubJudge({}));

    const res = await svc.assess({
      claimText: 'Reduces wrinkles by 20% in 4 weeks',
      productName: 'Night Serum',
      evidence: STRONG_EVIDENCE,
    });

    expect(res.assessment.justified).toBe(true);
    expect(res.assessment.confidenceScore).toBe(0.9);
    expect(res.assessment.requiresHumanReview).toBe(false);
    expect(res.claim.status).toBe('ASSESSED');
    expect(prisma._assessments).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('routes low-confidence results to human review', async () => {
    const svc = build(fakePrisma(), new StubJudge({ confidence: 0.55 }));
    const res = await svc.assess({ claimText: 'Reduces wrinkles by 20% in 4 weeks', evidence: STRONG_EVIDENCE });
    expect(res.assessment.requiresHumanReview).toBe(true);
  });

  it('raises a guardrail flag when the LLM says JUSTIFIED but the numbers disagree', async () => {
    const svc = build(fakePrisma(), new StubJudge({ verdict: 'JUSTIFIED', confidence: 0.95 }));
    const res = await svc.assess({
      claimText: 'Reduces wrinkles by 20% in 4 weeks',
      evidence: 'Open-label study, n=24. Profilometry at week 8 showed a 12% reduction in wrinkle depth.',
    });
    expect(res.assessment.guardrailFlags.length).toBeGreaterThan(0);
    expect(res.assessment.requiresHumanReview).toBe(true);
  });

  it('returns the cached verdict for identical input without calling the LLM again', async () => {
    const prisma = fakePrisma();
    const judge = new StubJudge({});
    const svc = build(prisma, judge);
    const dto = { claimText: 'Reduces wrinkles by 20% in 4 weeks', evidence: STRONG_EVIDENCE };

    await svc.assess(dto);
    const second = await svc.assess(dto);

    expect(second.cached).toBe(true);
    expect(judge.calls).toHaveLength(1);
  });

  it('404s for an unknown claimId before spending an LLM call', async () => {
    const judge = new StubJudge({});
    const svc = build(fakePrisma(), judge);
    await expect(
      svc.assess({ claimId: '00000000-0000-4000-8000-999999999999', evidence: STRONG_EVIDENCE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(judge.calls).toHaveLength(0);
  });

  it('refuses to assess a claim rejected at screening', async () => {
    const prisma = fakePrisma();
    const rejected = await prisma.claim.create({
      data: { productName: 'p', claimText: 'Erases wrinkles permanently', category: 'EFFICACY', market: 'EU', status: 'REJECTED' },
    });
    await expect(
      build(prisma, new StubJudge({})).assess({ claimId: rejected.id, evidence: STRONG_EVIDENCE }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps LLM failures to 502 and writes nothing', async () => {
    const prisma = fakePrisma();
    const svc = build(prisma, new StubJudge(new JudgeError('timeout')));
    await expect(
      svc.assess({ claimText: 'Reduces wrinkles by 20% in 4 weeks', evidence: STRONG_EVIDENCE }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma._claims).toHaveLength(0);
    expect(prisma._assessments).toHaveLength(0);
  });
});

describe('MockClaimJudge (offline mode)', () => {
  it('rejects evidence that misses the claimed magnitude and timepoint', async () => {
    const svc = build(fakePrisma(), new MockClaimJudge());
    const res = await svc.assess({
      claimText: 'Reduces wrinkles by 20% in 4 weeks',
      evidence: 'Open-label study, n=24. Profilometry at week 8 showed a 12% reduction in wrinkle depth (p=0.04).',
    });
    expect(res.assessment.verdict).toBe('NOT_JUSTIFIED');
    expect(res.assessment.justified).toBe(false);
  });

  it('accepts a strong, matching study', async () => {
    const svc = build(fakePrisma(), new MockClaimJudge());
    const res = await svc.assess({ claimText: 'Reduces wrinkles by 20% in 4 weeks', evidence: STRONG_EVIDENCE });
    expect(res.assessment.verdict).toBe('JUSTIFIED');
  });
});
