# Implementation Order — FITL Agent Competence, Third Iteration

**Date**: 2026-06-03
**Source**: `reports/fitl-ai-encoding-second-iteration.md` (ChatGPT-Pro adversarial audit at `10aa5f0bd`), reassessed against the codebase, the spec/ticket landscape (Specs 196–208 all COMPLETED/archived), and `docs/FOUNDATIONS.md`.

## Reassessment Verdict

The trigger report's central diagnosis is **accepted with corrections**. Verification confirmed a real proof gap — **0 of 114 `policy-profile-quality` tests execute a turn and assert a board-outcome delta** — which is a FOUNDATIONS #16 ("testing as proof") concern, not an engine-capability gap. No generic architecture change is warranted (matches the prior `fitl-ai-encoding-first-iteration.md` verdict). Corrections applied across the specs:

- Reframed "competence theater" → "executed-outcome proof missing" (Specs 201–205 landed genuine selected-proposal/role-target witnesses).
- The proposed 9-category witness taxonomy is **rejected** in favor of a lightweight `@proof-tier` sub-annotation inside the existing 3-class `@test-class` system (DRY / FOUNDATIONS #15).
- The outcome-delta helper is **generic** (named features / token counts / margins); FITL specificity lives in fixtures (FOUNDATIONS #1).
- Fixture scope trimmed from ~24 to **P0-only (~16)**; YAML feature additions folded into fixture work and gated on failing fixtures (4 of 8 proposed `candidateFeatures` already exist).

## Order

| Order | Spec | Title | Depends on | Rationale |
|---|---|---|---|---|
| 1 | **209** (`archive/specs/209-game-agnostic-executed-turn-competence-harness.md`) | Game-agnostic executed-turn competence harness | — | Completed and archived on 2026-06-03. Enabling test infrastructure only; no engine change. |
| 2 | **210** | FITL behavioral competence fixture corpus (P0) | **209 (hard)** | Builds every fixture on the Spec 209 harness; proves the four-faction doctrine authored by Specs 201–205 at executed-outcome tier. |

**209 → 210 is a hard dependency** (210 fixtures import the 209 harness helpers and the `@proof-tier` convention). Both specs are independent of any other in-flight work (none exists; Specs 196–208 are all archived). Neither requires kernel, compiler, or runtime changes.

## Deferred (not specced)

- **P1 fixtures** (Patrol/Advise, Air Lift, Sweep/Raid, Bombard, Rally/Base network, base-threat-from-Infiltrate, event direct-swing) — revisit after P0 lands and the harness is proven.
- **Event-decision annotation taxonomy** — only if a (future) event fixture proves the current active-card annotation surface cannot express direct-swing vs trap. Must be game-agnostic if pursued.
- **Derived readiness metrics / preview reachability diagnostics** — only if a fixture proves the current features/bounded preview cannot distinguish a required competent choice.
