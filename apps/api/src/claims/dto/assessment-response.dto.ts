/** Shape returned to the React client. Decoupled from the Prisma model on purpose. */
export interface AssessmentResponse {
  claim: {
    id: string;
    productName: string;
    claimText: string;
    category: string;
    market: string;
    status: string;
  };
  assessment: {
    id: string;
    justified: boolean;
    verdict: 'JUSTIFIED' | 'NOT_JUSTIFIED' | 'INSUFFICIENT_EVIDENCE';
    confidenceScore: number;
    reasoning: string;
    supportingPoints: string[];
    gaps: string[];
    criteria: Record<string, string>;
    guardrailFlags: string[];
    requiresHumanReview: boolean;
    provider: string;
    model: string;
    promptVersion: string;
    latencyMs: number;
    createdAt: string;
  };
  /** True when an identical claim+evidence was already assessed with the same prompt & model. */
  cached: boolean;
}
