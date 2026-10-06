import { z } from 'zod';

/**
 * Contract for what the LLM must return.
 *
 * Two layers of defence:
 *  1. JUDGE_JSON_SCHEMA is sent to OpenAI as a Structured Output (strict mode),
 *     so the model is constrained at decode time.
 *  2. JudgeOutputSchema (zod) re-validates on our side — never trust an
 *     external system's output just because it was asked nicely.
 *
 * Note: we deliberately do NOT ask the model for a separate `justified`
 * boolean. It is derived from `verdict` server-side, so the two can never
 * disagree.
 */

export const CRITERION_RESULTS = ['MET', 'PARTIAL', 'NOT_MET', 'UNCLEAR'] as const;
export const VERDICTS = ['JUSTIFIED', 'NOT_JUSTIFIED', 'INSUFFICIENT_EVIDENCE'] as const;

export const CRITERIA_KEYS = [
  'endpoint_match',
  'magnitude',
  'timepoint',
  'study_design',
  'statistics',
  'population',
] as const;

const criterion = z.enum(CRITERION_RESULTS);

export const JudgeOutputSchema = z.object({
  verdict: z.enum(VERDICTS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(4000),
  supporting_points: z.array(z.string().max(500)).max(10),
  gaps: z.array(z.string().max(500)).max(10),
  criteria: z.object({
    endpoint_match: criterion,
    magnitude: criterion,
    timepoint: criterion,
    study_design: criterion,
    statistics: criterion,
    population: criterion,
  }),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;
export type Verdict = (typeof VERDICTS)[number];
export type CriterionResult = (typeof CRITERION_RESULTS)[number];

const criterionJson = { type: 'string', enum: [...CRITERION_RESULTS] };

/** JSON Schema handed to OpenAI Structured Outputs (strict: every key required, no extras). */
export const JUDGE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'reasoning', 'supporting_points', 'gaps', 'criteria'],
  properties: {
    verdict: { type: 'string', enum: [...VERDICTS] },
    confidence: {
      type: 'number',
      description:
        'Probability 0.0-1.0 that a qualified claims evaluator would agree with the verdict.',
    },
    reasoning: {
      type: 'string',
      description:
        '3-6 sentences an evaluator can read in 30 seconds. Cite numbers from the evidence.',
    },
    supporting_points: { type: 'array', items: { type: 'string' } },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete shortfalls between the evidence and the exact wording of the claim.',
    },
    criteria: {
      type: 'object',
      additionalProperties: false,
      required: [...CRITERIA_KEYS],
      properties: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criterionJson])),
    },
  },
};

/** Parse raw model text into a validated JudgeOutput, or throw with a readable message. */
export function parseJudgeOutput(raw: string): JudgeOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Model did not return valid JSON');
  }
  const result = JudgeOutputSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Model output failed schema validation — ${issues}`);
  }
  return result.data;
}
