/**
 * The business flow from the brief. It is a genuine sequence, so it is
 * numbered; this tool owns the last two steps.
 */
const STEPS = [
  { title: 'Business proposes', who: 'Marketing' },
  { title: 'Screened for feasibility', who: 'Claim manager' },
  { title: 'Formula tested', who: 'Scientist' },
  { title: 'Study attached', who: 'Evaluator' },
  { title: 'Evidence judged', who: 'This tool + evaluator' },
];

export default function WorkflowRail() {
  return (
    <ol className="rail" aria-label="Claim workflow">
      {STEPS.map((s, i) => (
        <li key={s.title} className={`rail__step ${i >= 3 ? 'rail__step--here' : ''}`}>
          <span className="rail__num">{i + 1}</span>
          <span className="rail__title">{s.title}</span>
          <span className="rail__who">{s.who}</span>
        </li>
      ))}
    </ol>
  );
}
