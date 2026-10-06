# 5. Presentation guide (for the interview)

## Before the call

1. `npm run db:up` and confirm the container is healthy.
2. `npm run dev` — API on :3000, UI on :5173.
3. Open the UI, check the footer shows the judge (`openai / …` if a key is set, otherwise `mock`).
4. Optional: `npm run db:seed` for a populated claim register.
5. Have these files open in the editor: `schema.prisma`, `claims.service.ts`, `assessment.prompt.ts`, `evidence-signals.ts`, `ClaimAssessor.jsx`.
6. If the network or API key fails during the call, set `LLM_PROVIDER=mock` and restart — the demo still works end to end.

## 10-minute talk track

**1. The problem (1 min)**
"A claim like *reduces wrinkles by 20% in 4 weeks* is a legal promise. Every part of the sentence needs evidence: the right measurement, the right number, the right timepoint. Today that check is manual. I built a tool that gives the evaluator a structured first pass and records it for audit — it supports their decision, it doesn't replace it."

**2. Business flow (1 min)** — show the workflow rail and `docs/01-business-process.md`.
"Five steps, four roles. I modelled them as a claim status so the backend enforces the flow — for example, a claim rejected at screening can't be assessed."

**3. Live demo (3 min)**
- *Strong study* → Justified, high confidence, all criteria met.
- *Weak study* → Not justified: 12% at week 8 versus 20% in 4 weeks; self-assessment doesn't support objective wording. Routed to review.
- *Tampered evidence* → the study contains an instruction to the AI. It's detected, flagged and sent to a human.
- Re-run the strong study → `cached: true`, no second LLM call.
- Scroll to the claim register → everything is persisted.

**4. Design walkthrough (3 min)**
- **Data:** claim has many assessments, append-only; provenance on every row.
- **Backend:** the five steps in `ClaimsService.assess` — validate, cache, signals, judge, guardrails, atomic write. LLM call outside the transaction.
- **LLM:** strict JSON schema + zod; verdict only, boolean derived; versioned prompt; provider behind an interface.
- **Frontend:** explicit idle/loading/done/error states; verdict, confidence with the review line, reasoning, criteria.

**5. Roadmap and close (2 min)**
"The next most valuable thing is capturing the evaluator's accept/override decision — that becomes the test set that tells us how good the AI really is, and lets us calibrate confidence. After that: PDF ingestion, async processing, roles, and eventually a wording assistant that suggests the strongest claim the evidence supports."

## Likely questions and short answers

**Why not let the LLM decide on its own?**
It can be confidently wrong, and this is a regulated decision. The model proposes, deterministic rules cross-check, and a human decides whenever confidence is low or the two disagree.

**How reliable is the confidence score?**
Not very, out of the box — LLM self-reported confidence is usually over-confident. I use it only to route work to humans. With evaluator decisions collected, I'd calibrate it against observed agreement.

**How do you stop prompt injection?**
Layered: the evidence is delimited and labelled untrusted, the system prompt says to ignore instructions in it, the output is schema-constrained so it can only return a verdict, and a detector flags suspicious text and forces human review. No single layer is enough on its own.

**Why Prisma over TypeORM?**
The schema file is a single readable contract, types flow end to end, and migrations are clean. TypeORM would be fine too — the important decisions are the model shape (append-only assessments, provenance), not the ORM.

**What happens when OpenAI is down or slow?**
SDK retries for 429/5xx with backoff, a timeout, one retry for invalid output, then a 502 with nothing written. At scale I'd move assessment to a queue with workers, and a second provider can be added behind the same interface.

**How would this scale to thousands of claims?**
The API is stateless and scales horizontally; the database load is small. The real limit is LLM throughput and rate limits, so: queue, worker pool sized to the rate limit, results pushed to the UI, and the cache for duplicates.

**How do you know the AI is correct?**
Today: unit tests on the pipeline and the guardrails, plus the review routing. Properly: a golden dataset of past evaluator decisions, run on every prompt or model change in CI, tracking agreement and override rates.

**What about confidential study data?**
Keys and calls stay server-side. For production I'd use a zero-retention enterprise endpoint or an EU-hosted model, which is a configuration change because of the `ClaimJudge` interface.

**Why a three-state verdict when the brief says Yes/No?**
"The study doesn't say enough" and "the study contradicts the claim" lead to different actions — commission more testing versus change the wording. The UI still shows Yes/No; the extra state lives in the data.

**What would you do differently?**
Start capturing evaluator decisions from day one, support PDFs early since that's how studies really arrive, and add authentication before any pilot.
