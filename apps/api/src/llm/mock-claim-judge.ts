import { PROMPT_VERSION } from './assessment.prompt';
import { ClaimJudge, JudgeInput, JudgeResult } from './claim-judge.interface';
import { CriterionResult, JudgeOutput } from './judge-output.schema';

/**
 * Offline, deterministic stand-in for the LLM.
 *
 * Used when LLM_PROVIDER=mock or no OPENAI_API_KEY is configured, so the
 * whole stack (DB, API, UI) can be demoed and tested without network access
 * or cost. It reasons only from the regex signals, so it is NOT a substitute
 * for the real judge — it exists to make the pipeline runnable end-to-end.
 */
export class MockClaimJudge implements ClaimJudge {
  readonly provider = 'mock';
  readonly model = 'rule-based-v1';

  async assess(input: JudgeInput): Promise<JudgeResult> {
    const started = Date.now();
    const { claim, evidence } = input.signals;
    const gaps: string[] = [];
    const support: string[] = [];

    // --- magnitude
    let magnitude: CriterionResult = 'UNCLEAR';
    if (claim.percent == null) {
      magnitude = 'MET';
    } else if (evidence.percents.length) {
      const best = Math.max(...evidence.percents);
      if (best >= claim.percent) {
        magnitude = 'MET';
        support.push(`Evidence reports an effect of ${best}%, meeting the claimed ${claim.percent}%.`);
      } else {
        magnitude = 'NOT_MET';
        gaps.push(`Largest reported effect is ${best}%, below the claimed ${claim.percent}%.`);
      }
    } else {
      gaps.push('No quantified result found in the evidence.');
    }

    // --- timepoint
    let timepoint: CriterionResult = 'UNCLEAR';
    if (claim.days == null) {
      timepoint = 'MET';
    } else if (evidence.days.length) {
      const earliest = Math.min(...evidence.days);
      if (earliest <= claim.days) {
        timepoint = 'MET';
        support.push(`Measurements exist at day ${earliest}, within the claimed ${claim.days} days.`);
      } else {
        timepoint = 'NOT_MET';
        gaps.push(`Earliest measurement is day ${earliest}; the claim promises results by day ${claim.days}.`);
      }
    } else {
      gaps.push('Study duration / timepoints not stated.');
    }

    // --- endpoint / measurement
    const endpoint: CriterionResult =
      evidence.measurement === 'instrumental' || evidence.measurement === 'both'
        ? 'MET'
        : evidence.measurement === 'self-assessment'
          ? 'PARTIAL'
          : 'UNCLEAR';
    if (endpoint === 'PARTIAL') gaps.push('Only self-assessment data; objective claim wording needs instrumental measurement.');
    if (endpoint === 'MET') support.push('Instrumental / expert-graded measurement used.');

    // --- design, stats, population
    const designScore = [evidence.controlled, evidence.randomized, evidence.blinded].filter(Boolean).length;
    const studyDesign: CriterionResult = designScore >= 2 ? 'MET' : designScore === 1 ? 'PARTIAL' : 'UNCLEAR';
    if (!evidence.controlled) gaps.push('No control / placebo / vehicle arm mentioned.');

    const statistics: CriterionResult =
      evidence.pValue == null ? 'UNCLEAR' : evidence.pValue <= 0.05 ? 'MET' : 'NOT_MET';
    if (statistics === 'MET') support.push(`Statistically significant (p ≤ ${evidence.pValue}).`);
    if (statistics === 'NOT_MET') gaps.push(`Result not statistically significant (p = ${evidence.pValue}).`);

    const population: CriterionResult =
      evidence.sampleSize == null ? 'UNCLEAR' : evidence.sampleSize >= 30 ? 'MET' : 'PARTIAL';
    if (evidence.sampleSize != null && evidence.sampleSize < 30) gaps.push(`Small panel (n=${evidence.sampleSize}).`);

    if (evidence.injectionSuspected) gaps.push('Evidence contains instruction-like text aimed at the AI.');

    const criteria = {
      endpoint_match: endpoint,
      magnitude,
      timepoint,
      study_design: studyDesign,
      statistics,
      population,
    };
    const values = Object.values(criteria);

    let verdict: JudgeOutput['verdict'];
    if (values.includes('NOT_MET')) verdict = 'NOT_JUSTIFIED';
    else if (magnitude === 'MET' && timepoint === 'MET' && endpoint === 'MET') verdict = 'JUSTIFIED';
    else verdict = 'INSUFFICIENT_EVIDENCE';

    const metCount = values.filter((v) => v === 'MET').length;
    let confidence = verdict === 'INSUFFICIENT_EVIDENCE' ? 0.5 : 0.55 + metCount * 0.06;
    if (evidence.injectionSuspected) confidence -= 0.2;
    confidence = Math.round(Math.min(0.95, Math.max(0.1, confidence)) * 100) / 100;

    const reasoning =
      verdict === 'JUSTIFIED'
        ? `The evidence meets the claim's magnitude and timepoint with an appropriate measurement method (${metCount}/6 criteria met). [Offline rule-based judge — configure OPENAI_API_KEY for an LLM assessment.]`
        : verdict === 'NOT_JUSTIFIED'
          ? `The evidence falls short of the claim as worded: ${gaps[0] ?? 'see gaps'} [Offline rule-based judge — configure OPENAI_API_KEY for an LLM assessment.]`
          : `The evidence does not contain enough detail to confirm or reject the claim. [Offline rule-based judge — configure OPENAI_API_KEY for an LLM assessment.]`;

    return {
      output: { verdict, confidence, reasoning, supporting_points: support, gaps, criteria },
      provider: this.provider,
      model: this.model,
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - started,
    };
  }
}
