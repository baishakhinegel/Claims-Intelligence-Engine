# Claims Intelligence Engine

LLM-assisted substantiation of cosmetic product claims. A scientist or evaluator submits a claim (for example *"Reduces wrinkles by 20% in 4 weeks"*) together with the clinical study that is meant to support it. The system asks an LLM whether the study actually justifies the claim as worded, cross-checks the answer with deterministic rules, saves the result to PostgreSQL, and shows it in a React UI.

**Stack:** NestJS 11 · Prisma 7 · PostgreSQL 16 · OpenAI (Structured Outputs) · React 19 + Vite

![Assessment result](docs/images/assessment-not-justified.png)

## Assessment deliverables

| Brief asks for | Where |
|---|---|
| Prisma schema for Claim and Assessment | [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) |
| NestJS `POST /api/claims/assess` (claim + evidence → OpenAI → DB → client) | [`claims.controller.ts`](apps/api/src/claims/claims.controller.ts), [`claims.service.ts`](apps/api/src/claims/claims.service.ts), [`openai-claim-judge.ts`](apps/api/src/llm/openai-claim-judge.ts) |
| React component showing Justified Yes/No, confidence, reasoning | [`ClaimAssessor.jsx`](apps/web/src/components/ClaimAssessor.jsx), [`VerdictPanel.jsx`](apps/web/src/components/VerdictPanel.jsx) |
| Business process understanding | [`docs/01-business-process.md`](docs/01-business-process.md) |
| Research performed | [`docs/02-research.md`](docs/02-research.md) |
| Technical architecture justification | [`docs/03-architecture.md`](docs/03-architecture.md) |
| Product roadmap | [`docs/04-roadmap.md`](docs/04-roadmap.md) |
| Interview walkthrough and Q&A | [`docs/05-presentation-guide.md`](docs/05-presentation-guide.md) |

## What it does beyond the minimum

- **Three-state verdict** (justified / not justified / insufficient evidence), shown as a simple Yes/No in the UI.
- **Six-criterion rubric** per assessment: endpoint, magnitude, timepoint, study design, statistics, population.
- **Deterministic guardrails** that re-check the claimed percentage and timepoint against the evidence and flag disagreement with the LLM.
- **Human-review routing** for low confidence, insufficient evidence, guardrail flags, or suspected prompt injection.
- **Append-only audit trail** with model, prompt version, latency and token usage on every assessment.
- **Idempotency cache**: identical claim + evidence returns the stored verdict without another LLM call.
- **Offline mock judge** so the full stack runs without an API key.

## Quick start

Prerequisites: Node.js 20.19+ (22 recommended), Docker Desktop, and optionally an OpenAI API key.

```bash
# 1. Install (also generates the Prisma client)
npm install

# 2. Configure the API
cp apps/api/.env.example apps/api/.env          # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
#    then set OPENAI_API_KEY in apps/api/.env (leave empty to use the offline mock judge)

# 3. Database: start Postgres (host port 5433) and create the tables
npm run db:up
npm run db:migrate          # first run creates prisma/migrations/<timestamp>_init — commit it
npm run db:seed             # optional: demo claims at each workflow stage

# 4. Run API (:3000) and UI (:5173) together
npm run dev
```

Open http://localhost:5173 and use **Try an example: Strong study / Weak study / Tampered evidence**.

### Configuration (`apps/api/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://claims:claims@localhost:5433/claims_engine` | Matches `docker-compose.yml` |
| `LLM_PROVIDER` | `openai` | `openai` or `mock`. Falls back to `mock` if no key is set |
| `OPENAI_API_KEY` | — | Server-side only, never sent to the browser |
| `OPENAI_MODEL` | `gpt-4o-mini` | Any chat model that supports Structured Outputs |
| `OPENAI_TEMPERATURE` | `0` | Leave empty for reasoning models that reject the parameter |
| `REVIEW_CONFIDENCE_THRESHOLD` | `0.75` | Below this, results go to human review |

## API

```bash
curl -X POST http://localhost:3000/api/claims/assess \
  -H "Content-Type: application/json" \
  -d '{
    "claimText": "Reduces wrinkles by 20% in 4 weeks",
    "productName": "Night Renewal Serum (RX-204)",
    "evidence": "Randomised, double-blind, vehicle-controlled study, n=62 women. Wrinkle depth by PRIMOS 3D imaging. At D28 mean wrinkle depth decreased by 23.4% vs baseline (p<0.001); vehicle -6.1%."
  }'
```

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/claims/assess` | Assess evidence against a new (`claimText`) or existing (`claimId`) claim |
| GET | `/api/claims?limit=10` | Recent claims with their latest assessment |
| GET | `/api/claims/:id` | One claim with its full assessment history |
| GET | `/api/health` | Database status and active judge |

Full contract and error codes: [`docs/03-architecture.md`](docs/03-architecture.md#33-api-contract).

## Tests and CI

```bash
npm test          # 22 unit tests — no database or API key required
npm run typecheck
npm run build
```

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs install → Prisma generate → typecheck → tests → build → dependency audit on every push and pull request.

## Project structure

```
apps/
  api/                          NestJS backend
    prisma/schema.prisma        Claim + Assessment data model
    prisma/seed.ts              Demo claims across the workflow
    src/claims/                 Controller, service, DTOs, deterministic guardrails
    src/llm/                    ClaimJudge interface, OpenAI + mock judges, prompt, output schema
    src/prisma/                 Prisma 7 client (pg adapter)
    test/                       Unit tests
  web/                          React (JSX) + Vite frontend
    src/components/             ClaimAssessor, VerdictPanel, ConfidenceGauge, WorkflowRail, RecentAssessments
docs/                           Business process, research, architecture, roadmap, presentation guide
docker-compose.yml              PostgreSQL 16 on host port 5433
```

## Troubleshooting

- **Port 5433 in use:** change the host port in `docker-compose.yml` and `DATABASE_URL`.
- **`prisma migrate` cannot reach the database:** check `docker ps` shows `claims-engine-db` as healthy.
- **UI shows "API unreachable":** the API isn't running on :3000; run `npm run dev:api` and read its log.
- **502 from `/assess`:** the OpenAI call failed (key, model name, quota). Check the API log, or set `LLM_PROVIDER=mock`.

Product names in the samples are fictional.
