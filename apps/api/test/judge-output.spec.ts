import { parseJudgeOutput } from '../src/llm/judge-output.schema';

const valid = {
  verdict: 'JUSTIFIED',
  confidence: 0.86,
  reasoning: 'Mean wrinkle depth fell 23.4% at day 28 vs baseline.',
  supporting_points: ['-23.4% at D28'],
  gaps: [],
  criteria: {
    endpoint_match: 'MET',
    magnitude: 'MET',
    timepoint: 'MET',
    study_design: 'MET',
    statistics: 'MET',
    population: 'MET',
  },
};

describe('parseJudgeOutput', () => {
  it('accepts a well-formed response', () => {
    expect(parseJudgeOutput(JSON.stringify(valid)).verdict).toBe('JUSTIFIED');
  });

  it('rejects non-JSON', () => {
    expect(() => parseJudgeOutput('Sure! Here is my answer...')).toThrow(/valid JSON/);
  });

  it('rejects out-of-range confidence and unknown verdicts', () => {
    expect(() => parseJudgeOutput(JSON.stringify({ ...valid, confidence: 7 }))).toThrow(/confidence/);
    expect(() => parseJudgeOutput(JSON.stringify({ ...valid, verdict: 'MAYBE' }))).toThrow(/verdict/);
  });
});
