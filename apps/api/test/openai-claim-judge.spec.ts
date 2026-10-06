import { OpenAiClaimJudge } from '../src/llm/openai-claim-judge';
import { JudgeError } from '../src/llm/claim-judge.interface';
import { extractSignals } from '../src/claims/evidence-signals';

const input = {
  productName: 'p',
  claimText: 'Reduces wrinkles by 20% in 4 weeks',
  category: 'EFFICACY',
  market: 'EU',
  evidence: 'n=62, PRIMOS, D28 -23.4% (p<0.001)',
  signals: extractSignals('Reduces wrinkles by 20% in 4 weeks', 'n=62, PRIMOS, D28 -23.4% (p<0.001)'),
};

const good = JSON.stringify({
  verdict: 'JUSTIFIED',
  confidence: 0.88,
  reasoning: 'Effect of 23.4% at D28 exceeds the claimed 20% in 4 weeks.',
  supporting_points: ['-23.4% at D28'],
  gaps: [],
  criteria: { endpoint_match: 'MET', magnitude: 'MET', timepoint: 'MET', study_design: 'UNCLEAR', statistics: 'MET', population: 'MET' },
});

function judgeWith(create: jest.Mock) {
  const judge = new OpenAiClaimJudge({ apiKey: 'test', model: 'gpt-test', temperature: 0, timeoutMs: 1000 });
  (judge as any).client = { chat: { completions: { create } } };
  return judge;
}

const completion = (content: string | null, refusal: string | null = null) => ({
  id: 'cmpl_1',
  model: 'gpt-test',
  choices: [{ message: { content, refusal } }],
  usage: { prompt_tokens: 900, completion_tokens: 150 },
});

describe('OpenAiClaimJudge', () => {
  it('sends a strict json_schema request and maps the response', async () => {
    const create = jest.fn().mockResolvedValue(completion(good));
    const res = await judgeWith(create).assess(input);

    const req = create.mock.calls[0][0];
    expect(req.response_format.type).toBe('json_schema');
    expect(req.response_format.json_schema.strict).toBe(true);
    expect(req.temperature).toBe(0);
    expect(req.messages[1].content).toContain('<<<EVIDENCE');

    expect(res.output.verdict).toBe('JUSTIFIED');
    expect(res.promptTokens).toBe(900);
    expect(res.provider).toBe('openai');
  });

  it('retries once when the output fails validation, then succeeds', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(completion('{"verdict":"MAYBE"}'))
      .mockResolvedValueOnce(completion(good));
    const res = await judgeWith(create).assess(input);
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.output.confidence).toBe(0.88);
  });

  it('throws JudgeError after a refusal on both attempts', async () => {
    const create = jest.fn().mockResolvedValue(completion(null, 'I cannot help with that'));
    await expect(judgeWith(create).assess(input)).rejects.toBeInstanceOf(JudgeError);
  });
});
