import { useState } from 'react';
import { claimsApi } from '../api/claimsApi.js';
import { CATEGORIES, SAMPLES } from '../samples.js';
import VerdictPanel from './VerdictPanel.jsx';

const EMPTY = { productName: '', claimText: '', category: 'EFFICACY', market: 'EU', evidence: '' };
const MIN_CLAIM = 5;
const MIN_EVIDENCE = 20;

const SAMPLE_HINTS = {
  strong: 'meets the claim',
  weak: 'falls short',
  tampered: 'tries to fool the AI',
};

/**
 * The component the brief asks for: collect claim + evidence, call
 * POST /api/claims/assess, and show Justified (Yes/No), confidence and reasoning.
 *
 * State machine kept deliberately explicit: idle -> loading -> (done | error).
 */
export default function ClaimAssessor({ reviewThreshold, onAssessed }) {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dirtySinceResult, setDirtySinceResult] = useState(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (result) setDirtySinceResult(true);
  };

  const reset = (fields) => {
    setForm(fields);
    setResult(null);
    setError('');
    setStatus('idle');
    setDirtySinceResult(false);
  };

  const loadSample = ({ key, label, ...fields }) => reset(fields);

  const claimLen = form.claimText.trim().length;
  const evidenceLen = form.evidence.trim().length;
  const blockedReason =
    claimLen < MIN_CLAIM
      ? 'Enter the claim exactly as it will appear on pack.'
      : evidenceLen < MIN_EVIDENCE
        ? `Add at least ${MIN_EVIDENCE} characters of study evidence (${MIN_EVIDENCE - evidenceLen} more).`
        : '';
  const canSubmit = status !== 'loading' && !blockedReason;

  async function handleAssess(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('loading');
    setError('');
    try {
      const data = await claimsApi.assess({
        claimText: form.claimText,
        productName: form.productName || undefined,
        category: form.category,
        market: form.market,
        evidence: form.evidence,
      });
      setResult(data);
      setStatus('done');
      setDirtySinceResult(false);
      onAssessed?.(data);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="assessor">
      <form className="assessor__form" onSubmit={handleAssess} aria-describedby="form-hint">
        <div className="samples">
          <span className="samples__label">Try an example</span>
          <div className="samples__list">
            {SAMPLES.map((s) => (
              <button key={s.key} type="button" className="sample" onClick={() => loadSample(s)}>
                <span className="sample__name">{s.label}</span>
                <span className="sample__hint">{SAMPLE_HINTS[s.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Claim, exactly as it will appear on pack</span>
          <input
            className="field__input field__input--claim"
            value={form.claimText}
            onChange={update('claimText')}
            placeholder="e.g. Reduces wrinkles by 20% in 4 weeks"
            maxLength={500}
            required
          />
          <span className="field__help">
            Numbers, timeframes and wording all matter: the study is checked against this exact sentence.
          </span>
        </label>

        <label className="field">
          <span className="field__label">
            Product <span className="field__optional">optional</span>
          </span>
          <input
            className="field__input"
            value={form.productName}
            onChange={update('productName')}
            placeholder="Product name or formula reference"
            maxLength={200}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field__label">Claim type</span>
            <select className="field__input" value={form.category} onChange={update('category')}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Market</span>
            <select className="field__input" value={form.market} onChange={update('market')}>
              <option value="EU">EU</option>
              <option value="US">US</option>
              <option value="UK">UK</option>
              <option value="CN">China</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field__label">Study evidence</span>
          <textarea
            className="field__input field__input--evidence"
            value={form.evidence}
            onChange={update('evidence')}
            placeholder={'Paste the study summary. Include:\n• design (controlled, randomised, blinded)\n• panel size and who took part\n• measurement method\n• timepoints\n• results and p-values'}
            rows={9}
            maxLength={20000}
            required
          />
          <span className="field__count">{form.evidence.length.toLocaleString()} / 20,000</span>
        </label>

        <div className="actions">
          <button className="primary" type="submit" disabled={!canSubmit}>
            {status === 'loading' ? 'Assessing…' : 'Assess claim'}
          </button>
          {(form.claimText || form.evidence || result) && status !== 'loading' && (
            <button type="button" className="link-button" onClick={() => reset(EMPTY)}>
              Clear
            </button>
          )}
        </div>
        {blockedReason && status !== 'loading' ? (
          <p className="hint" role="status">
            {blockedReason}
          </p>
        ) : (
          <p id="form-hint" className="hint">
            The evidence is sent to the AI judge and stored with its verdict for audit.
          </p>
        )}
      </form>

      <section className="assessor__result" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'idle' && !result && (
          <div className="empty">
            <p className="empty__title">No assessment yet</p>
            <p>Pick an example above, or enter your own claim and study, then select Assess claim.</p>
            <ol className="empty__steps">
              <li>Type the claim exactly as it will be printed.</li>
              <li>Paste the study summary that is meant to support it.</li>
              <li>Get a verdict, a confidence score and the reasons behind it.</li>
            </ol>
          </div>
        )}

        {status === 'loading' && (
          <div className="empty">
            <p className="empty__title">Reading the study against the claim</p>
            <p>Checking the measurement, effect size, timepoint, design, statistics and panel.</p>
            <div className="progress" aria-hidden="true" />
          </div>
        )}

        {status === 'error' && (
          <div className="error" role="alert">
            <p className="error__title">The assessment did not run</p>
            <p>{error}</p>
            <button type="button" className="link-button" onClick={handleAssess}>
              Try again
            </button>
          </div>
        )}

        {status === 'done' && result && (
          <>
            {dirtySinceResult && (
              <p className="stale-note" role="status">
                You have changed the form since this result. Select Assess claim to update it.
              </p>
            )}
            <VerdictPanel result={result} reviewThreshold={reviewThreshold} />
          </>
        )}
      </section>
    </div>
  );
}
