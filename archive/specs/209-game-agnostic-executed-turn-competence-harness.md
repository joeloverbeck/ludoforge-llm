# Spec 209 — Game-Agnostic Executed-Turn Competence Test Harness

**Status**: COMPLETED
**Priority**: High — this is the enabling step. Verification of the current FITL agent suite (2026-06-03) found that **0 of 114 `policy-profile-quality` test files execute a turn and assert a board-outcome delta**. ~81% (92 of 114) are `architectural-invariant` binding checks, ~19% (22 of 114) are `convergence-witness` (mostly proposal-level), and the only 8 full-game tests assert termination/determinism, not competence. The faction witnesses prove that named structures exist, bind, and score a *synthetic* candidate — not that the live agent selects a competent legal move from the real frontier and improves the intended strategic property. This is a genuine proof gap under FOUNDATIONS #16 (Testing as Proof). The harness is the precondition for closing it without engine churn.
**Complexity**: M — new game-agnostic test infrastructure under `packages/engine/test/helpers/` (+ a small `testing.md` amendment). No kernel, compiler, or runtime change. Building blocks already exist (`runGame()` accepts `PolicyAgent`; `cross-family-conformance.test.ts` already publishes a real frontier and applies decisions); what is missing is the assertion layer that bundles live-frontier execution with plan-trace-chain, outcome-delta, adversarial-alternative, preview-status, and replay assertions.
**Date**: 2026-06-03
**Dependencies**:
- **Soft**: `archive/specs/200-plan-proposal-trace-completeness.md` (COMPLETED) — the plan trace chain (doctrine → template → role binding → microturn decision) this harness asserts against.
- **Soft**: `archive/specs/190-plan-primary-root-selection.md` and `policy-agent-plan-root.ts` (landed) — the "selected root must be present in the published frontier" contract the live-frontier runner relies on.
- **Soft**: `.claude/rules/testing.md` — amended here with a proof-tier convention.

**Trigger report**: `reports/fitl-ai-encoding-second-iteration.md` (ChatGPT-Pro second iteration, audit at `10aa5f0bd`). See §8 (Reassessment) for what was kept, corrected, and rejected.

**Ticket namespace**: `209COMPHARNESS`

---

## 1. Goal

Provide a **game-agnostic** test harness that proves agent competence at the *executed-outcome* level, and a lightweight proof-tier convention so that structural witnesses can no longer be mistaken for behavioral proof. Concretely, the harness must let a fixture:

1. Build a real game state and advance it to a target decision point.
2. Obtain the kernel's published legal `actionSelection` frontier (not a synthetic root list).
3. Invoke the policy agent normally so it selects a root from that frontier.
4. Drive the plan through microturns via the existing plan controller.
5. Execute the turn and assert the resulting board-state delta over **generic** state queries.
6. Assert the plan trace chain, preview-ref provenance, and deterministic replay.

The harness contains **no game-specific knowledge**. Any FITL-specific quantity (Support, Patronage, Trail, Opposition) is expressed by the *fixture* in terms of generic queries (victory margins, named features, token counts by type/status, zone properties), never by a FITL-aware helper. This is required by FOUNDATIONS #1 (Engine Agnosticism) and #9 (generic events/state queries).

## 2. Non-Goals

- **No engine, kernel, compiler, or runtime changes.** Verification confirmed the architecture already expresses every layer the next proof round needs.
- **No new preview depth/cap classes.** Deferred until a fixture proves the current bounded preview cannot distinguish a required competent choice (FOUNDATIONS #10, #20).
- **No FITL competence-corpus fixtures.** Those are Spec 210. This spec ships only the harness + a reference fixture per generic capability. (The harness's own `__reference__/` fixture does legitimately use FITL to exercise the plan-template-dependent helpers — §3.2/§3.4 — since FITL is the only corpus game configuring plan templates; that reference fixture is distinct from the deferred FITL competence corpus owned by Spec 210.)
- **No adoption of the trigger report's 9-category witness taxonomy** (rejected — see §3.7 and §8).
- **No game-specific helper logic.** The outcome-delta helper computes over generic queries only.

## 3. Harness Modules

All under `packages/engine/test/helpers/competence/` unless noted.

### 3.1 Live-frontier runner
A helper that, given a `GameDef`, seed, agent set, and a "advance until" predicate, runs the kernel forward to the target `actionSelection` microturn, exposes the published frontier, lets the supplied `PolicyAgent` choose, drives the plan controller through subsequent microturns, and executes through the end of the human-visible turn (grouped by `turnId`). Built on the existing `runGame()` / `publishMicroturn()` / `applyPublishedDecision()` surface; no new engine entry points.

### 3.2 Plan-trace-chain assertion helper
Asserts the ordered chain for the turn under test: doctrine active → template eligible → root candidate present in frontier → **selected** root → compound-availability status (`ready`/`provisional`/`unavailable`) → role binding → microturn resolution (`match`: exact/reselected/fallback, with `fallbackReason` distinguishing `primitiveConsiderationPolicyFallback`/`stableFrontierTieBreakFallback`, per `plan-controller.ts`) → executed outcome. The helper consumes the existing trace records (Spec 200); it does not add new trace fields.

### 3.3 Generic outcome-delta helper
Computes before/after deltas over **generic** queries only:
- victory margins and ranks (per the compiled victory formula);
- any named `stateFeature` / aggregate value;
- token counts filtered by type and status;
- zone-property values and control aggregates.
The helper accepts a list of `(query, expected-direction-or-bound)` assertions. It has no FITL identifiers. Support/Patronage/Trail assertions are written by the fixture as named-feature or token-count queries.

### 3.4 Adversarial bad-but-legal-alternative helper
Asserts that at least one explicitly-named bad-but-legal alternative root was present in the published frontier and that the agent did **not** select it. Fixtures fail if the trap alternative is absent (so the test can never pass vacuously) or if the agent chose it.

### 3.5 Preview-status assertion helper
For every preview-derived ref that is decisive to the asserted outcome, requires its status to be `ready` or an explicitly-traced non-`ready` outcome — any non-`ready` status emitted in preview trace (`stochastic`/`random`/`hidden`/`unresolved`/`failed`/`depthCap`/`postGrantCap`/`freeOperationCap`/`grantFlowPartial`/`noPreviewDecision`/`gated`/`partial`), tracking the FOUNDATIONS #20 taxonomy. No silent numeric certainty. Directly enforces FOUNDATIONS #20.

### 3.6 Deterministic-replay wrapper
Runs a fixture twice and asserts identical selected stable move keys, microturn decisions, trace statuses, and outcome deltas. Enforces FOUNDATIONS #8/#16.

### 3.7 Proof-tier convention (testing.md amendment)
Add a **proof-tier annotation that lives inside the existing 3-class `@test-class` taxonomy** — it does not replace it. New optional file-top marker for `policy-profile-quality` tests:

```ts
// @proof-tier: structural | proposal-level | selected-root | executed-outcome | adversarial
```

- `structural` / `proposal-level` tiers map to the existing `architectural-invariant` / `convergence-witness` classes and remain valid regression guards.
- `selected-root`, `executed-outcome`, and `adversarial` tiers are reserved for harness-backed witnesses.
- A competence claim is only "proven" at `executed-outcome` (or `adversarial`) tier.

The trigger report's parallel 9-category marker system is **rejected**: it would collide with the existing `@test-class` convention and violate DRY / FOUNDATIONS #15. `testing.md` is amended to document the proof-tier sub-annotation and to state explicitly that structural/proposal-level witnesses MUST NOT be counted as behavioral competence proof.

## 4. Acceptance Criteria

1. Harness compiles, lints, and typechecks; engine `test:all` stays green.
2. A reference fixture under `packages/engine/test/helpers/competence/__reference__/` exercises **every** helper in §3 (live-frontier run, trace-chain assertion, generic outcome delta, adversarial alternative, preview-status, replay).
3. **Cross-game agnosticism proof**: the family-agnostic execution helpers (§3.1 live-frontier run, §3.3 generic outcome-delta, §3.4 adversarial alternative, §3.5 preview-status, §3.6 replay) run against at least two materially different game families (FITL + one other in the conformance corpus — Texas Hold'em or generic-control) with the same helper code, proving no FITL specialization leaked. The §3.2 plan-trace-chain helper is exercised on FITL only, because FITL is the sole corpus game configuring plan templates (`planControllerFrontierAuthority: 'applies'`; Texas Hold'em and generic-control are `not_configured`) and authoring plan templates into another corpus game is excluded by Acceptance Criterion #6; its agnosticism is guaranteed structurally by the absence of any FITL identifier in the helper code.
4. Deterministic replay identity proven for the reference fixture.
5. `.claude/rules/testing.md` amended with the §3.7 proof-tier convention and the explicit "structural ≠ competence proof" statement.
6. No new engine/kernel/compiler/runtime files; diff is confined to `packages/engine/test/` and `.claude/rules/testing.md`.

## 5. Risks

- **Vacuous adversarial tests.** Mitigated by §3.4 failing when the trap alternative is absent from the frontier.
- **Brittle cosmetic-identity assertions.** The trace-chain and outcome-delta helpers assert strategic properties and adversarial dominance, not a single arbitrary stable key when several moves are strategically equivalent (the trigger report's "brittle overfitting" risk).
- **Preview coercion.** §3.5 forbids treating non-`ready` refs as confidence; mirrors the Spec 207/208 cautions.

## 6. Non-Goals Restated (FOUNDATIONS guardrails)

No engine logic, no per-game schema, no new cap classes, no compatibility shims. The harness is test infrastructure (FOUNDATIONS #16), agnostic (FOUNDATIONS #1), consuming generic events/queries (FOUNDATIONS #9).

## 7. Verification Notes (2026-06-03)

- `plan-proposal.ts`, `policy-agent-plan-root.ts` (throws if root absent from frontier), `plan-controller.ts` (`match` ladder exact→reselected→fallback, with `primitiveConsiderationPolicyFallback`/`stableFrontierTieBreakFallback` fallback reasons), `plan-proposal-compound-availability.ts`, `compile-agent-plan-templates.ts` all exist and behave as the trigger report describes.
- `runGame()`/`runGames()` accept arbitrary `Agent[]` including `PolicyAgent`; `cross-family-conformance.test.ts` already builds real state, calls `publishMicroturn()`, and applies decisions — so the harness reuses existing surface and needs no engine entry point.
- No existing spec or landed work provides an executed-outcome competence harness or a proof-tier convention; this spec is not duplicating archived Specs 196–208.

## 8. Reassessment of `reports/fitl-ai-encoding-second-iteration.md`

**Kept (verified correct):**
- The central diagnosis: the `policy-profile-quality` suite proves binding/proposal-level facts, not executed-outcome competence (confirmed: 0/114 assert a board-outcome delta; synthetic-root helpers confirmed in `us-plan-witness-helpers.ts` / `arvn-plan-witness-helpers.ts`).
- The proof-ladder framing as a conceptual tool.
- "No generic engine architecture change is warranted now" (matches `fitl-ai-encoding-first-iteration.md`).
- The harness being game-agnostic test infrastructure, not runtime architecture.
- Adversarial bad-but-legal alternatives, preview-status assertions, and deterministic replay as required fixture properties.

**Corrected:**
- "Competence theater / do not declare competent" overstates the case. Specs 201–205 landed genuine selected-proposal + role-target witnesses (`arvn-train-govern-separation`, `arvn-govern-active-support-priority` reach ladder 4–5). The accurate framing is "proof stops at proposal/selection level; executed-outcome proof is missing," not "all theater."
- The outcome-delta helper must be generic (compute over named features / token counts / margins), with FITL specificity in the fixture — the report's helper sketch implied FITL-aware deltas, which would violate FOUNDATIONS #1.

**Rejected:**
- The 9-category witness taxonomy (`structural-encoding-invariant`, `profile-binding-invariant`, … `weak-non-proving-witness`) as a standalone marker system: it duplicates and collides with the existing 3-class `@test-class` taxonomy (DRY / FOUNDATIONS #15). Replaced by the lightweight `@proof-tier` sub-annotation in §3.7.
- Scope inflation (24 fixtures + full reclassification) is deferred; this spec ships only the enabling harness. Fixtures are scoped in Spec 210 (P0 only).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-06-03:

- [`archive/tickets/209COMPHARNESS-001.md`](../archive/tickets/209COMPHARNESS-001.md) — Live-frontier competence runner + `competence/` module scaffolding (covers §3.1)
- [`archive/tickets/209COMPHARNESS-002.md`](../archive/tickets/209COMPHARNESS-002.md) — Plan-trace-chain assertion helper (covers §3.2)
- [`archive/tickets/209COMPHARNESS-003.md`](../archive/tickets/209COMPHARNESS-003.md) — Generic outcome-delta assertion helper (covers §3.3)
- [`archive/tickets/209COMPHARNESS-004.md`](../archive/tickets/209COMPHARNESS-004.md) — Adversarial-alternative + preview-status assertion helpers (covers §3.4, §3.5)
- [`archive/tickets/209COMPHARNESS-005.md`](../archive/tickets/209COMPHARNESS-005.md) — Deterministic-replay wrapper (covers §3.6)
- [`archive/tickets/209COMPHARNESS-006.md`](../archive/tickets/209COMPHARNESS-006.md) — Proof-tier convention — `testing.md` amendment (covers §3.7, AC#5)
- [`archive/tickets/209COMPHARNESS-007.md`](../archive/tickets/209COMPHARNESS-007.md) — Reference fixture: cross-game agnosticism + replay-identity proof (covers §4 AC#2/#3/#4)

## Completion

Completed on 2026-06-03. All seven owned tickets are archived under `archive/tickets/209COMPHARNESS-*.md`.

Final proof:
- `pnpm -F @ludoforge/engine build` passed.
- `node --test "dist/test/architecture/competence-harness-reference.test.js"` passed: 2 tests, 0 failures.
- `pnpm -F @ludoforge/engine test:all` passed: 1001 tests, 0 failures.
- `pnpm turbo build` passed; runner emitted the existing non-failing Vite chunk-size warning.
- `pnpm turbo lint` passed.
- `pnpm turbo typecheck` passed.
- `pnpm run check:ticket-deps` passed with 0 active tickets and 2597 archived tickets.
