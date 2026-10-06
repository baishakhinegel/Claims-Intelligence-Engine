/**
 * Deterministic, regex-based extraction of the few facts that decide most
 * claim/evidence mismatches: the number, the timepoint, and the study design.
 *
 * Why have this at all when we have an LLM?
 *  - It is cheap, instant and explainable.
 *  - It gives the LLM structured hints (better grounding).
 *  - It acts as an independent second opinion: if the LLM says "JUSTIFIED"
 *    but the evidence never mentions an effect as large as the claim, we
 *    don't silently trust either side — we flag it for a human.
 *
 * It is intentionally conservative: it only raises flags, it never changes
 * the verdict. "LLM proposes, rules cross-check, humans decide."
 */

export type MeasurementType = 'instrumental' | 'self-assessment' | 'both' | 'unknown';

export interface EvidenceSignals {
  claim: {
    percent: number | null;
    days: number | null;
  };
  evidence: {
    percents: number[];
    days: number[];
    sampleSize: number | null;
    controlled: boolean;
    randomized: boolean;
    blinded: boolean;
    pValue: number | null;
    measurement: MeasurementType;
    injectionSuspected: boolean;
  };
}

const UNIT_TO_DAYS: Record<string, number> = { hour: 1 / 24, day: 1, week: 7, month: 30 };

// "4 weeks", "28 days", "1 month", "24 hours", "D28" / "day 28"
const DURATION_RE = /\b(\d{1,3})\s*-?\s*(hour|day|week|month)s?\b/gi;
const DAY_N_RE = /\b(?:d|day)\s?(\d{1,3})\b/gi;
// "week 8" / "W8"
const WEEK_N_RE = /\b(?:w|wk|week)\s?(\d{1,2})\b/gi;

// A percentage that is NOT obviously about confidence intervals or "% of subjects".
const PERCENT_RE = /(\d{1,3}(?:[.,]\d+)?)\s*%(?!\s*(?:ci|confidence|of (?:the )?(?:subjects|participants|panelists|panellists|volunteers|women|men|users)))/gi;

const SAMPLE_RE = [
  /\bn\s*=\s*(\d{1,5})\b/i,
  /\b(\d{1,5})\s+(?:healthy\s+)?(?:subjects|participants|volunteers|panelists|panellists|women|men|females|males)\b/i,
];

const P_VALUE_RE = /\bp\s*[<=≤]\s*(0?\.\d+)/i;

const INSTRUMENTAL_RE =
  /profilometr|corneometer|cutometer|visia|antera|primos|fringe projection|3d imaging|image analysis|chromameter|tewameter|sebumeter|clinical grading|dermatologist[- ]graded|expert grading/i;
const SELF_ASSESSMENT_RE =
  /self[- ]?(?:assess|perceiv|evaluat|report)|questionnaire|consumer (?:test|panel|perception)|agreed that|% of (?:women|users|participants) (?:said|felt|agreed)/i;

const INJECTION_RE =
  /ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:the )?(?:above|previous)|you are now|system prompt|mark (?:this|the claim) as (?:justified|approved)|return (?:verdict|"?justified"?)/i;

function toNumber(s: string): number {
  return Number(s.replace(',', '.'));
}

function extractDays(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(DURATION_RE)) {
    out.add(Math.round(Number(m[1]) * UNIT_TO_DAYS[m[2].toLowerCase()] * 100) / 100);
  }
  for (const m of text.matchAll(DAY_N_RE)) {
    out.add(Number(m[1]));
  }
  for (const m of text.matchAll(WEEK_N_RE)) {
    out.add(Number(m[1]) * 7);
  }
  return [...out].filter((d) => d > 0).sort((a, b) => a - b);
}

function extractPercents(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(PERCENT_RE)) {
    const n = toNumber(m[1]);
    if (n > 0 && n <= 100) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function extractSignals(claimText: string, evidence: string): EvidenceSignals {
  const claimPercents = extractPercents(claimText);
  const claimDays = extractDays(claimText);

  let sampleSize: number | null = null;
  for (const re of SAMPLE_RE) {
    const m = evidence.match(re);
    if (m) {
      sampleSize = Number(m[1]);
      break;
    }
  }

  const pMatch = evidence.match(P_VALUE_RE);
  const instrumental = INSTRUMENTAL_RE.test(evidence);
  const selfAssessed = SELF_ASSESSMENT_RE.test(evidence);

  return {
    claim: {
      // A claim normally carries one headline number and one timepoint.
      percent: claimPercents.length ? Math.max(...claimPercents) : null,
      days: claimDays.length ? Math.max(...claimDays) : null,
    },
    evidence: {
      percents: extractPercents(evidence),
      days: extractDays(evidence),
      sampleSize,
      controlled: /placebo|vehicle|control(?:led)? (?:group|arm|site)|untreated (?:side|area|control)/i.test(evidence),
      randomized: /randomi[sz]ed|randomi[sz]ation/i.test(evidence),
      blinded: /blind(?:ed)?/i.test(evidence),
      pValue: pMatch ? Number(pMatch[1]) : null,
      measurement:
        instrumental && selfAssessed
          ? 'both'
          : instrumental
            ? 'instrumental'
            : selfAssessed
              ? 'self-assessment'
              : 'unknown',
      injectionSuspected: INJECTION_RE.test(evidence),
    },
  };
}

/**
 * Cross-check an LLM "JUSTIFIED" verdict against hard facts.
 * Returns human-readable flags; empty array means no disagreement found.
 */
export function guardrailFlags(signals: EvidenceSignals, verdict: string): string[] {
  const flags: string[] = [];
  const { claim, evidence } = signals;

  if (evidence.injectionSuspected) {
    flags.push('Evidence contains text that looks like instructions to the AI (possible prompt injection).');
  }

  if (verdict !== 'JUSTIFIED') return flags;

  if (claim.percent != null && evidence.percents.length > 0) {
    const best = Math.max(...evidence.percents);
    if (best < claim.percent) {
      flags.push(
        `Claim states ${claim.percent}% but the largest effect found in the evidence is ${best}%.`,
      );
    }
  }
  if (claim.percent != null && evidence.percents.length === 0) {
    flags.push(`Claim states ${claim.percent}% but no percentage result was found in the evidence.`);
  }

  if (claim.days != null && evidence.days.length > 0) {
    const earliest = Math.min(...evidence.days);
    if (earliest > claim.days) {
      flags.push(
        `Claim promises results in ${claim.days} days but the earliest timepoint in the evidence is day ${earliest}.`,
      );
    }
  }

  if (evidence.measurement === 'self-assessment') {
    flags.push('Evidence appears to be self-assessment only; objective efficacy wording usually needs instrumental data.');
  }

  if (evidence.sampleSize != null && evidence.sampleSize < 20) {
    flags.push(`Small panel (n=${evidence.sampleSize}).`);
  }

  return flags;
}
