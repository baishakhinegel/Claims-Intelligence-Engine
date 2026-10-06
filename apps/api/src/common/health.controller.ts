import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLAIM_JUDGE, ClaimJudge } from '../llm/claim-judge.interface';
import { PROMPT_VERSION } from '../llm/assessment.prompt';
import { PrismaService } from '../prisma/prisma.service';

/** GET /api/health — liveness + which judge is active (shown in the UI footer). */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLAIM_JUDGE) private readonly judge: ClaimJudge,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async health() {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      judge: { provider: this.judge.provider, model: this.judge.model, promptVersion: PROMPT_VERSION },
      reviewThreshold: Number(this.config.get('REVIEW_CONFIDENCE_THRESHOLD') ?? 0.75),
    };
  }
}
