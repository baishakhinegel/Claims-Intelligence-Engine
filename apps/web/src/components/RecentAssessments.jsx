import { useCallback, useEffect, useState } from 'react';
import { claimsApi } from '../api/claimsApi.js';

const VERDICT_SHORT = { JUSTIFIED: 'Justified', NOT_JUSTIFIED: 'Not justified', INSUFFICIENT_EVIDENCE: 'Not enough evidence' };
const STATUS_COPY = {
  PROPOSED: 'Proposed',
  SCREENED: 'Screened',
  REJECTED: 'Rejected at screening',
  FORMULATED: 'Formula tested',
  EVIDENCE_SUBMITTED: 'Study attached',
  ASSESSED: 'Assessed',
};

const RETRY_MS = 5000;

/** Claims from the database, newest first — proves the result was persisted. */
export default function RecentAssessments({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | unavailable

  const load = useCallback(async () => {
    try {
      const data = await claimsApi.recent(8);
      setRows(data);
      setState('ready');
    } catch (err) {
      // Keep raw HTTP errors out of the UI; the details belong in the console / API log.
      console.warn('Claim register unavailable:', err.message);
      setState('unavailable');
    }
  }, []);

  // Load on mount and after every new assessment.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // While the register is unavailable, quietly retry in the background.
  useEffect(() => {
    if (state !== 'unavailable') return undefined;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [state, load]);

  if (state === 'loading') return <p className="hint">Loading the claim register…</p>;

  if (state === 'unavailable') {
    return (
      <p className="hint">
        The claim register will appear here as soon as the service is available.{' '}
        <button type="button" className="link-button" onClick={load}>
          Refresh
        </button>
      </p>
    );
  }

  if (!rows.length) {
    return <p className="hint">No claims yet. Run an assessment above and it will be listed here.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="register">
        <thead>
          <tr>
            <th scope="col">Claim</th>
            <th scope="col">Stage</th>
            <th scope="col">Latest verdict</th>
            <th scope="col" className="num">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const a = c.latestAssessment;
            return (
              <tr key={c.id}>
                <td>
                  <span className="register__claim">{c.claimText}</span>
                  <span className="register__product">{c.productName}</span>
                </td>
                <td>{STATUS_COPY[c.status] ?? c.status}</td>
                <td>
                  {a ? (
                    <span className={`dot dot--${a.verdict.toLowerCase()}`}>
                      {VERDICT_SHORT[a.verdict]}
                      {a.requiresHumanReview ? ', needs review' : ''}
                    </span>
                  ) : (
                    <span className="muted">Not assessed</span>
                  )}
                </td>
                <td className="num">{a ? `${Math.round(a.confidenceScore * 100)}%` : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}