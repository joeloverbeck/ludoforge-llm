# Implementation Order — Advisory Turn-Plan Architecture

**Status**: COMPLETED

This series replaces the agent's primary decision paradigm: from **scoring independent atomic microturns** to **enumerating and holistically scoring composed candidate turns (`AdvisoryTurnPlan`), executed atomically across the kernel's published microturn frontier**. It is the reassessed, de-duplicated, Foundations-aligned form of the ChatGPT-Pro "DPSA" proposal (`reports/ai-agent-policy-overhaul-first-iteration.md`), evaluated against the competence target `reports/fitl-competent-agent-ai.md`.

## Prerequisite (already landed)

- **Spec 185 — Grant-Flow Preview Integrity** (`archive/specs/185`, COMPLETED 2026-05-20). Made grant-flow / free-operation preview honest and effect-complete. This was the *actual* blocker behind the stuck ARVN campaign (not "weight soup"). Spec 187's posture evaluation depends on it. No further engine-preview work is required before this series.

## Order

1. **Spec 186 — Advisory Turn-Plan Architecture (Core)** — ✅ COMPLETED 2026-05-20 (`archive/specs/186-advisory-turn-plan-architecture-core.md`).
   Plan-template IR (`schemaVersion: 3`), role selectors (extends Spec 181), `PlanExecutionState` across microturns, bounded plan proposer, microturn execution controller + fallback ladder, plan trace, compiler validation. Demotes flat considerations to leaf scorers. Proof slice: **ARVN Train+Govern**. Landed across tickets `186ADVTURNPLAN-001`…`-007` (all archived). The plan object and its atomic-execution contract now exist and the proof slice passes; Specs 187/188 may proceed.

2. **Spec 187 — Whole-Turn Posture Evaluation + Ally-as-Rival Metadata** — ✅ COMPLETED 2026-05-21 (`archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md`).
   Fills Spec 186's `postureHook`: scores expected resulting board state over Spec 185's honest preview, and adds conditional ally-as-rival relationship weighting (competence report §5/§6.5). Required before faction authoring, because every competent FITL personality depends on posture + relationship scoring.

3. **Spec 188 — FITL Four-Faction Plan Migration + Sequencing Library** — ✅ COMPLETED 2026-05-22 (`archive/specs/188-fitl-four-faction-plan-migration-and-sequencing.md`).
   Tier-1 YAML authoring only (no engine changes). Encodes the four competence-report personalities and their sequencing combos as plan structures; migrates ARVN to full fidelity first, then US/NVA/VC skeletons; retires the `arvn-evolved` flat-consideration primary path.

## Deferred (not in this series)

- **Spec 183 — Evolution Loop Overhaul** (`archive/specs/183`, REJECTED 2026-05-20). Structure-first mutation, plausibility gates, MAP-Elites archive. Deferred until the turn-plan architecture is proven by authored competence (186–188). Reassess only after the architecture exists and an authored baseline is in place — evolution then *tunes* authored structure rather than *discovering* personalities from weight soup.

## Why this order, not the proposal's "replace everything at once"

- The composed-turn **unit** (186) is the load-bearing change; posture (187) and authoring (188) are meaningless without it.
- Posture (187) must precede authoring (188) because the competence personalities are expressed largely as posture + relationship terms.
- Authoring (188) precedes any evolution work because the competence report *describes the competence requirements* for each personality — they should be authored directly to satisfy those requirements, not rediscovered by a multi-hour campaign whose usual outcome was surfacing an architectural gap. (The report describes *what* competent play must prioritize; it does not mandate the plan-template architecture — that is 186–188's own Foundations-aligned implementation choice.)
- Each spec is independently mergeable and independently testable, preserving determinism/replay proofs (Foundations #8/#16) at every step.

## Outcome

Completed 2026-05-22.

The advisory turn-plan architecture series is finished and archived:

- Spec 186 landed the core composed-turn plan architecture and ARVN Train+Govern proof slice.
- Spec 187 landed whole-turn posture evaluation and ally-as-rival relationship metadata.
- Spec 188 landed the FITL four-faction authored plan migration and sequencing library.

No implementation-order work remains in this file. The active planning artifact was archived as dated history so a future batch can create a fresh `specs/IMPLEMENTATION-ORDER.md` if needed.

Verification:

- `pnpm run check:ticket-deps` after the final Spec 188 archive passed for 0 active tickets and 2487 archived tickets.
- Final Spec 188 proof included `pnpm -F @ludoforge/engine test:all` passing 958/958 tests.
