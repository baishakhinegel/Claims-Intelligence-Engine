# 2. Research performed

I researched three areas before writing code: the **regulatory meaning of "justified"**, the **science of how cosmetic claims are substantiated**, and **how to make an LLM reliable enough for a regulated decision-support task**. Each finding below is tied to the design decision it produced.

## 2.1 Regulatory frame — what "justified" means

| Source | What it says (paraphrased) | Design consequence |
|---|---|---|
| **EU Regulation (EC) No 1223/2009, Art. 20** | Claims on cosmetics must not imply the product has characteristics or functions it does not have. | The judge checks the *exact wording*, not the general idea of the claim. |
| **EU Regulation (EC) No 1223/2009, Art. 11** | The Product Information File must contain proof of the effect claimed, where justified by the nature or effect of the product. | Every assessment is stored with the evidence text and an input hash — this is the start of a substantiation record. |
| **EU Regulation (EU) No 655/2013** | Six common criteria for cosmetic claims: legal compliance, truthfulness, evidential support, honesty, fairness, informed decision-making. | The system prompt anchors on *evidential support* and *truthfulness*. Legal compliance and fairness are claim-manager concerns (step 2 of the flow), so they are out of scope for this endpoint. |
| **EU Commission Technical Document on Cosmetic Claims** (guidance, with annexes on "free from" and "hypoallergenic") | Evidence should be appropriate to the claim type; methodology should be reliable and reproducible; consumer perception studies support perception claims. | `ClaimCategory` on the claim; the rubric distinguishes instrumental vs self-assessed endpoints. |
| **US FTC** | Objective claims need *competent and reliable scientific evidence*. | Same rubric works; `market` field lets the frame change per market later. |
| **US FDA (FD&C Act)** | Claims that a product changes the structure or function of the body can make it a drug rather than a cosmetic. | Example: seed claim *"Erases wrinkles permanently"* is modelled as rejected at screening — wording risk is a claim-manager decision before evidence is even considered. |

**Takeaway:** "justified" is not a yes/no on whether the product works. It is whether *this evidence* supports *this sentence* in *this market*. That is why the API returns a three-state verdict (`JUSTIFIED`, `NOT_JUSTIFIED`, `INSUFFICIENT_EVIDENCE`) and a per-criterion breakdown, while the UI still shows the simple Yes/No the brief asks for.

## 2.2 Substantiation science — how claims are proven

- **Endpoints must match the claim.** Wrinkle claims are typically measured with 3D fringe-projection imaging (e.g. PRIMOS, Antera), profilometry, or expert grading on photo scales. Hydration uses corneometry; elasticity uses cutometry. A questionnaire where "78% of women agreed their wrinkles looked reduced" supports *"looks reduced"* wording, not *"reduces wrinkles by X%"*.
- **The number must be the right number.** A claimed 20% should be the panel mean change, ideally significant versus vehicle/placebo, not the best-responder subgroup.
- **The time must be the right time.** *"In 4 weeks"* requires a measurement at or before day 28. A study with only an 8-week readout does not support it.
- **Design quality matters.** Randomisation, blinding, vehicle control (often split-face), panel size, and statistical significance determine how much weight the result can carry.

These four points became the **six rubric criteria** (`endpoint_match`, `magnitude`, `timepoint`, `study_design`, `statistics`, `population`) and also the **deterministic extractors** in `evidence-signals.ts`, which pull out the percentages, timepoints, sample size, design keywords and p-values.

## 2.3 LLM reliability — making an LLM safe for this job

| Risk | What I found | What I built |
|---|---|---|
| **Malformed output** | Free-text or "JSON mode" output can still miss fields. OpenAI **Structured Outputs** with `strict: true` constrains decoding to a JSON schema. | `JUDGE_JSON_SCHEMA` sent with `response_format: json_schema`, and a second, independent **zod** validation on our side. Invalid output triggers one retry, then a 502. |
| **Contradictory fields** | Asking for both `verdict` and `justified` invites them to disagree. | The model returns only `verdict`; `isJustified` is derived server-side. |
| **Non-determinism** | Same input can give different outputs. | `temperature: 0` by default; **idempotency cache** keyed on `sha256(claim + evidence + promptVersion + model)` so identical requests get the identical stored answer at zero cost. |
| **Poorly calibrated confidence** | Self-reported LLM confidence is known to be over-confident and is not a true probability. | I treat it as a **routing signal**, not truth: below a configurable threshold (default 0.75) the result goes to a human. Proper calibration against evaluator decisions is on the roadmap. |
| **Hallucinated numbers** | Models can invent figures that "sound right". | The prompt forbids invented data and demands quoted numbers; **deterministic guardrails** independently re-check magnitude and timepoint and flag disagreement. |
| **Prompt injection** (OWASP Top 10 for LLM Applications, LLM01) | Evidence is user-supplied text and may contain instructions. | Evidence wrapped in explicit delimiters and labelled untrusted; system prompt instructs the model to ignore embedded instructions; a regex detector flags injection-like text and forces human review. Demonstrated by the "Tampered evidence" sample. |
| **Reproducibility / audit** | Prompts change; models get upgraded or retired. | `promptVersion`, `provider`, `model`, latency and token counts stored on every assessment. |
| **Vendor lock-in** | Models and providers change fast. | `ClaimJudge` interface + DI token; OpenAI and an offline mock are two interchangeable implementations. |

## 2.4 Alternatives I evaluated

| Decision | Options considered | Chosen | Why |
|---|---|---|---|
| ORM | Prisma vs TypeORM | **Prisma 7** | Schema-first file that is easy to review in an interview, generated types end-to-end, clean migrations. TypeORM decorators would also work; the brief allows either. |
| Database | PostgreSQL vs MongoDB | **PostgreSQL** | Relational workflow (claim → many assessments), enums for status, `JSONB` for the rubric, arrays for gaps — one engine covers structured and semi-structured needs. |
| LLM output format | Free text, JSON mode, function calling, Structured Outputs | **Structured Outputs (strict)** | Strongest schema guarantee for a pure "return data" call; function calling is better when the model must choose between actions. |
| LLM call style | Synchronous request vs queue + worker | **Synchronous** for the MVP | Assessments take seconds, one user at a time. The service is already isolated so it can move behind a queue (see roadmap). |
| Retrieval (RAG) | Add vector search now vs later | **Later** | The input already contains the evidence. RAG becomes valuable when we add internal claim guidelines and past dossiers. |
| Rules only vs LLM only vs hybrid | — | **Hybrid** | Rules are cheap, explainable and deterministic but brittle on free text; the LLM understands language but can be wrong confidently. Each checks the other. |
