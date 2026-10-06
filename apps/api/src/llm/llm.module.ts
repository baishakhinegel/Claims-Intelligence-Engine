import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLAIM_JUDGE, ClaimJudge } from './claim-judge.interface';
import { MockClaimJudge } from './mock-claim-judge';
import { OpenAiClaimJudge } from './openai-claim-judge';

/**
 * Chooses the judge implementation from configuration (Strategy pattern).
 * Consumers inject CLAIM_JUDGE and never know which provider is behind it.
 */
@Module({
  providers: [
    {
      provide: CLAIM_JUDGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ClaimJudge => {
        const logger = new Logger('LlmModule');
        const provider = (config.get<string>('LLM_PROVIDER') ?? 'openai').toLowerCase();
        const apiKey = config.get<string>('OPENAI_API_KEY')?.trim();

        if (provider === 'openai' && apiKey) {
          const rawTemp = config.get<string>('OPENAI_TEMPERATURE');
          const temperature = rawTemp === undefined || rawTemp === '' ? undefined : Number(rawTemp);
          const judge = new OpenAiClaimJudge({
            apiKey,
            model: config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
            temperature,
            timeoutMs: Number(config.get<string>('OPENAI_TIMEOUT_MS') ?? 30000),
          });
          logger.log(`Claim judge: OpenAI (${judge.model})`);
          return judge;
        }

        if (provider === 'openai') {
          logger.warn('LLM_PROVIDER=openai but OPENAI_API_KEY is empty — falling back to the offline mock judge.');
        } else {
          logger.log('Claim judge: offline mock (rule-based)');
        }
        return new MockClaimJudge();
      },
    },
  ],
  exports: [CLAIM_JUDGE],
})
export class LlmModule {}
