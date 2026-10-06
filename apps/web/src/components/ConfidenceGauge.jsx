/**
 * How sure the AI is about its verdict (not how good the product is),
 * drawn against the human-review threshold.
 */
export default function ConfidenceGauge({ value, threshold = 0.75 }) {
  const pct = Math.round(value * 100);
  const thr = Math.round(threshold * 100);
  const below = value < threshold;

  return (
    <figure
      className="gauge"
      aria-label={`AI confidence in this verdict: ${pct} percent. Human review threshold: ${thr} percent.`}
    >
      <figcaption className="gauge__head">
        <span className="gauge__value">{pct}%</span>
        <span className="gauge__unit">AI confidence in this verdict</span>
      </figcaption>

      <div className="gauge__track" aria-hidden="true">
        <div className={`gauge__fill ${below ? 'gauge__fill--low' : ''}`} style={{ width: `${pct}%` }} />
        <div className="gauge__threshold" style={{ left: `${thr}%` }} />
      </div>

      <div className="gauge__scale" aria-hidden="true">
        <span>0</span>
        <span className="gauge__marker" style={{ left: `${thr}%` }}>
          Review line {thr}
        </span>
        <span>100</span>
      </div>

      <p className={`gauge__note ${below ? 'gauge__note--low' : ''}`}>
        {below
          ? `Below ${thr}%, so an evaluator must check this result.`
          : `Above the ${thr}% review line.`}
      </p>
    </figure>
  );
}
