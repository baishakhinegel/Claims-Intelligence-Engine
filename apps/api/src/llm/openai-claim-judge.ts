import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './assessment.prompt';
import { ClaimJudge, JudgeError, JudgeInput, JudgeResult } from './claim-judge.interface';
import { JUDGE_JSON_SCHEMA, parseJudgeOutput } from './judge-output.schema';

export interface OpenAiJudgeOptions {
  apiKey: string;
  model: string;
  /** undefined = don't send (some reasoning models reject the parameter). */
  temperature?: number;
  timeoutMs: number;
}

/**
 * Calls OpenAI Chat Completions with a strict JSON-schema response format.
 *
 * Reliability choices:
 *  - SDK-level retries (maxRetries) cover 429/5xx/network blips with backoff.
 *  - One extra application-level retry if the model returns a refusal or an
 *    output that fails our own validation.
 *  - temperature 0 by default → as repeatable as the model allows.
 */
export class OpenAiClaimJudge implements ClaimJudge {
  readonly provider = 'openai';
  readonly model: string;
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAiClaimJudge.name);

  constructor(private readonly opts: OpenAiJudgeOptions) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs,
      maxRetries: 2,
    });
  }

  async assess(input: JudgeInput): Promise<JudgeResult> {
    const started = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          ...(this.opts.temperature !== undefined ? { temperature: this.opts.temperature } : {}),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'claim_assessment',
              strict: true,
              schema: JUDGE_JSON_SCHEMA,
            },
          },
        });

        const message = completion.choices[0]?.message;
        if (!message) throw new Error('Empty response from model');
        if (message.refusal) throw new Error(`Model refused: ${message.refusal}`);
        if (!message.content) throw new Error('Model returned no content');

        const output = parseJudgeOutput(message.content);

        return {
          output,
          provider: this.provider,
          model: completion.model ?? this.model,
          promptVersion: PROMPT_VERSION,
          latencyMs: Date.now() - started,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          raw: { id: completion.id, content: message.content },
        };
      } catch (err) {
        lastError = err;
        // Auth / bad-request errors won't fix themselves on retry.
        if (err instanceof OpenAI.APIError && err.status && err.status < 500 && err.status !== 429) {
          break;
        }
        this.logger.warn(`OpenAI attempt ${attempt} failed: ${(err as Error).message}`);
      }
    }

    throw new JudgeError(
      `LLM assessment failed: ${(lastError as Error)?.message ?? 'unknown error'}`,
      lastError,
    );
  }
}
