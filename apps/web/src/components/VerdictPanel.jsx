import ConfidenceGauge from './ConfidenceGauge.jsx';

const VERDICT_COPY = {
  JUSTIFIED: {
    title: 'Justified',
    tone: 'yes',
    answer: 'Yes',
    summary: 'The study supports this claim as worded.',
  },
  NOT_JUSTIFIED: {
    title: 'Not justified',
    tone: 'no',
    answer: 'No',
    summary: 'The study does not support this claim as worded.',
  },
  INSUFFICIENT_EVIDENCE: {
    title: 'Not enough evidence',
    tone: 'unsure',
    answer: 'No',
    summary: 'The study does not give enough detail to decide either way.',
  },
};

const CRITERIA = [
  ['endpoint_match', 'Measures what the claim says'],
  ['magnitude', 'Effect size reaches the claim'],
  ['timepoint', 'Shown within the claimed time'],
  ['study_design', 'Controlled, randomised, blinded'],
  ['statistics', 'Statistically significant'],
  ['population', 'Panel size and relevance'],
];

// Symbol + word, so the result never depends on colour alone.
const CRITERION_COPY = {
  MET: { label: 'Met', mark: '✓' },
  PARTIAL: { label: 'Partly met', mark: '◐' },
  NOT_MET: { label: 'Not met', mark: '✕' },
  UNCLEAR: { label: 'Unclear', mark: '?' },
};

function ListSection({ title, items, tone }) {
  if (!items.length) return null;
  return (
    <section className={`verdict__section list-section list-section--${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function VerdictPanel({ result, reviewThreshold }) {
  const { assessment: a, claim, cached } = result;
  const copy = VERDICT_COPY[a.verdict];
  const metCount = CRITERIA.filter(([key]) => a.criteria?.[key] === 'MET').length;

  const gaps = <ListSection key="gaps" title="What is missing" items={a.gaps} tone="gap" />;
  const support = (
    <ListSection key="support" title="What supports it" items={a.supportingPoints} tone="support" />
  );

  return (
    <article className={`verdict verdict--${copy.tone}`} aria-label={`Verdict: ${copy.title}`}>
      <header className="verdict__header">
        <p className="verdict__claim">“{claim.claimText}”</p>
        <h2 className="verdict__title">{copy.title}</h2>
        <p className="verdict__summary">{copy.summary}</p>
      </header>

      <dl className="facts">
        <div className="facts__item">
          <dt>Justified</dt>
          <dd className="facts__value facts__value--tone">{copy.answer}</dd>
        </div>
        <div className="facts__item">
          <dt>Criteria met</dt>
          <dd className="facts__value">
            {metCount} <span className="facts__of">of {CRITERIA.length}</span>
          </dd>
        </div>
        <div className="facts__item">
          <dt>Next step</dt>
          <dd className={`facts__step ${a.requiresHumanReview ? 'facts__step--review' : ''}`}>
            {a.requiresHumanReview ? 'Evaluator review required' : 'Ready for evaluator sign-off'}
          </dd>
        </div>
      </dl>

      <ConfidenceGauge value={a.confidenceScore} threshold={reviewThreshold} />

      {a.guardrailFlags.length > 0 && (
        <div className="review-note" role="status">
          <p className="review-note__title">Our rule checks disagree with the AI</p>
          <ul>
            {a.guardrailFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="verdict__section">
        <h3>Why</h3>
        <p className="verdict__reasoning">{a.reasoning}</p>
      </section>

      <section className="verdict__section">
        <h3>Against each criterion</h3>
        <ul className="criteria">
          {CRITERIA.map(([key, label]) => {
            const value = a.criteria?.[key] ?? 'UNCLEAR';
            const c = CRITERION_COPY[value] ?? CRITERION_COPY.UNCLEAR;
            return (
              <li key={key} className={`criteria__row criteria__row--${value.toLowerCase()}`}>
                <span className="criteria__mark" aria-hidden="true">
                  {c.mark}
                </span>
                <span className="criteria__label">{label}</span>
                <span className="criteria__value">{c.label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Lead with what matters for this verdict: gaps first when the claim fails. */}
      {(a.gaps.length > 0 || a.supportingPoints.length > 0) && (
        <div className="verdict__lists">
          {a.verdict === 'JUSTIFIED' ? [support, gaps] : [gaps, support]}
        </div>
      )}

      <footer className="verdict__meta">
        <span>
          Judged by {a.provider} / {a.model}
        </span>
        <span>Prompt {a.promptVersion}</span>
        <span>{(a.latencyMs / 1000).toFixed(1)} s</span>
        <span>Record {a.id.slice(0, 8)}</span>
        {cached && <span>Reused an identical earlier assessment</span>}
      </footer>
    </article>
  );
}
