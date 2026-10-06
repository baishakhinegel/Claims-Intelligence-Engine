import { useEffect, useState } from 'react';
import { claimsApi } from './api/claimsApi.js';
import ClaimAssessor from './components/ClaimAssessor.jsx';
import RecentAssessments from './components/RecentAssessments.jsx';
import WorkflowRail from './components/WorkflowRail.jsx';

export default function App() {
  const [health, setHealth] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    claimsApi.health().then(setHealth).catch(() => setHealth({ status: 'down' }));
  }, []);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="masthead__org">L’Oréal R&amp;I</p>
          <h1 className="masthead__title">Claims Intelligence Engine</h1>
          <p className="masthead__lede">
            Check whether a clinical study actually supports the claim printed on pack, before it reaches
            regulatory review.
          </p>
        </div>
        <WorkflowRail />
      </header>

      <main>
        <ClaimAssessor
          reviewThreshold={health?.reviewThreshold ?? 0.75}
          onAssessed={() => setRefreshKey((k) => k + 1)}
        />

        <section className="register-section">
          <h2>Claim register</h2>
          <RecentAssessments refreshKey={refreshKey} />
        </section>
      </main>

      <footer className="site-footer">
        {health?.status === 'down' && 'API unreachable. Start it with npm run dev:api.'}
        {health?.judge &&
          `AI judge: ${health.judge.provider} / ${health.judge.model}. Database ${health.database}. ` +
            'AI output supports evaluators; it does not replace their sign-off.'}
      </footer>
    </div>
  );
}
