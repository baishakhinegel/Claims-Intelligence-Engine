import { EvidenceSignals } from '../claims/evidence-signals';
import { JudgeOutput } from './judge-output.schema';

/**
 * Everything the judge needs to decide. Kept provider-agnostic so the service
 * layer never imports OpenAI types — swapping to Azure OpenAI, Anthropic or a
 * self-hosted model is a new class, not a refactor.
 */
export interface JudgeInput {
  productName: string;
  claimText: string;
  category: string;
  market: string;
  evidence: string;
  /** Deterministic pre-extraction, passed to the model as hints. */
  signals: EvidenceSignals;
}

export interface JudgeResult {
  output: JudgeOutput;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  raw?: unknown;
}

export interface ClaimJudge {
  readonly provider: string;
  readonly model: string;
  assess(input: JudgeInput): Promise<JudgeResult>;
}

/** DI token — inject the interface, not a concrete provider. */
export const CLAIM_JUDGE = Symbol('CLAIM_JUDGE');

/** Thrown when the upstream model fails or returns something unusable. */
export class JudgeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'JudgeError';
  }
}
