# 198GAMECONFCORP-003: Observer-safety invariant proofs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Possibly — if the harness surfaces engine bugs whose fix is small and local, fix in scope. Larger engine gaps (new primitives) are deferred per spec §6/§11.
**Deps**: `archive/tickets/198GAMECONFCORP-001.md`

## Problem

Foundation #4 (Authoritative State and Observer Views) and Foundation #20 (Preview Signal Integrity) currently rely on author discipline at every selector site, preview ref site, posture evaluator, and trace field — there is no architectural-invariant test asserting hidden information stays hidden across all these surfaces uniformly. Spec 170 introduced the partial-visibility observer policy machinery; this ticket operationalizes its enforcement by automated proof rather than assumed-by-authors.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/test/architecture/observer-safety-invariants.test.ts` does NOT exist (verified).
2. All six selector source kinds verified in `packages/engine/src/kernel/types-core.ts`: `collection`, `product`, `routePairs`, `subset`, `candidateParams`, `microturnOptions`.
3. The preview-status enum is concrete and richer than Foundation #20's abstract vocabulary: `PolicyWasmPreviewStatus` in `packages/engine/src/agents/policy-wasm-preview-drive.ts:32` and the schema enum in `packages/engine/src/kernel/schemas-core.ts:2908` use values like `gated`, `depthCap`, `postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `noPreviewDecision`. A separate `TurnShapePreviewStatus` in `packages/engine/src/agents/turn-shape-eval.ts:10` uses `'ready' | 'partial' | 'unavailable'`. The architectural-invariant test asserts the *semantic property* (typed status field, non-`ready` paths carry a declared fallback or runtime advisory) — not a literal subset of names.
4. Zone-visibility primitive exists in `packages/engine/src/kernel/observation.ts` (`resolveEffectiveZoneVisibility`, zone owner assignment, observer-profile zone-entry grants). Synthesizing a hidden-info fixture variant of the new perfect-info game by marking some zone contents hidden is supported by the existing primitive (verified during the reassessment — no new engine primitive expected for the synthesis itself).
5. After ticket 001 lands, the new perfect-info game is available as the substrate for the synthesized hidden-info fixture variant — cleaner than authoring against FITL's full hidden-info surface.

## Architecture Check

1. The test asserts semantic invariants, not literal enum membership — Foundation #20's abstract status vocabulary is illustrative; the implementation uses richer concrete names. The test must check the property ("status field is typed; non-`ready` carries a declared fallback or runtime advisory") so it survives future enum extensions.
2. The synthesized hidden-info fixture variant is a *minimal* perturbation of ticket 001's public game — small, focused test bed (Foundation #15 architectural completeness via small witnesses rather than sprawling fixtures).
3. Positive-negative pairs (spec §8) ensure each invariant has discriminating power: a positive test confirms the invariant holds on a correctly-authored hidden-info state; a paired negative test synthesizes a state that violates the invariant and asserts the test fails closed.
4. No game-specific branching — the test addresses observer scope generically; per-game state setup is fixture data, not test code.

## What to Change

### 1. Add the new test file

Author `packages/engine/test/architecture/observer-safety-invariants.test.ts` with `// @test-class: architectural-invariant` as the file-top class marker.

### 2. Selector source observer scope

For each of the six selector source kinds (`collection`, `product`, `routePairs`, `subset`, `candidateParams`, `microturnOptions`), evaluating against a hidden-info state returns only observer-visible items at the agent's declared scope. Hidden items are absent from the evaluated set; their absence does not leak (the agent cannot distinguish "no item exists" from "item exists but is hidden"). Positive-negative pairs per spec §8.

### 3. Preview ref provenance (Foundation #20)

Assert the semantic property: every preview ref consulted by the proposer/controller carries a typed status field, and any non-`ready` status either carries an explicitly-declared fallback path or emits the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` runtime advisory. No preview ref silently coerces unavailable status into a scalar contribution. Per spec §4.3 clarification — the test does not pin the literal enum members (since the implementation enum is richer than Foundation #20's abstract vocabulary).

### 4. Posture evaluator observer scope

Posture evaluators consult only observer-safe state. Posture deltas on hidden information are absent from the evaluated posture, rather than guessed from inference.

### 5. Trace field observer scope

Plan trace fields that surface evidence (active doctrines, role bindings, rejected alternatives, guardrail effects) do not leak hidden information to the receiving observer.

### 6. Synthesized hidden-info fixture variant of the ticket-001 game

Author a minimal perturbation of ticket 001's public perfect-info game where some zone contents are marked hidden, using the existing zone-visibility primitive in `kernel/observation.ts`. The synthesized variant is the primary test bed for §§2–5; Texas Hold'em is the secondary test bed (the real-game witness).

### 7. Engine bugs surfaced by witnesses

If a witness surfaces an engine bug:

- If the fix is **small and local** (data-spec correction, single-function selector/preview/posture fix), fix in scope.
- If the fix requires **new engine primitives** (a missing observer-scope mechanism, a new selector kind), defer to a follow-on spec named in spec §11.

Document which witnesses are addressed in scope vs. deferred in the ticket Outcome at archival time.

## Files to Touch

- `packages/engine/test/architecture/observer-safety-invariants.test.ts` (new)
- Likely surface: `packages/engine/test/architecture/observer-safety/` directory with synthesized hidden-info fixture variant and helpers (new — exact paths confirmed at implementation start against existing fixture conventions)
- Likely surface: engine fixes in `packages/engine/src/agents/` or `packages/engine/src/kernel/observation.ts` if and only if witnesses surface small-and-local bugs (per §7 above)

## Out of Scope

- Authoring-error negatives (ticket 004).
- Cross-family conformance tests (ticket 002).
- Per-observer-scope test matrices (spec §10 deferred — current scope is a single representative observer per fixture).
- Engine bugs requiring new primitives — those are promoted to follow-on specs (spec §11), not absorbed into this ticket.
- Re-authoring Texas Hold'em — spec §2 explicitly defers Texas Hold'em authoring gaps surfaced by P3 to follow-on items named in §11.
- Stochastic-axis-pure game data spec (spec §10 deferred).

## Acceptance Criteria

### Tests That Must Pass

1. `observer-safety-invariants.test.ts` exercises selector/preview/posture/trace observer scope on Texas Hold'em + synthesized hidden-info fixture variant of the ticket-001 game.
2. Positive-negative pairs for each invariant — the negative test synthesizes a state that violates the invariant and asserts the invariant fails closed (proving discriminating power).
3. Existing suite: `pnpm turbo test` — full regression check.

### Invariants

1. Hidden information never leaks via any selector source, preview ref, posture evaluator, or trace field at the agent's declared observer scope (Foundation #4).
2. Every preview ref carries a typed status; non-`ready` paths carry a declared fallback path or runtime advisory (Foundation #20 semantic property — not literal enum membership).
3. The test contains no game-specific branching — invariants are generic; per-game state is fixture data (Foundation #1).
4. Engine bugs surfaced by witnesses are either fixed in scope (small + local) or named for follow-on (require new primitives). Outcome records which bucket each surfaced bug fell into.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/observer-safety-invariants.test.ts` — primary deliverable.
2. Synthesized hidden-info fixture variant of the ticket-001 game (path TBD against existing fixture convention).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/observer-safety-invariants.test.js` — targeted run.
2. `pnpm turbo test` — full suite regression.
3. `pnpm turbo lint && pnpm turbo typecheck` — pre-completion verification.

## Outcome (2026-05-26)

Implemented the observer-safety invariant proof surface in `packages/engine/test/architecture/observer-safety-invariants.test.ts` with positive and negative invariant checks over a synthesized hidden-info fixture plus a Texas Hold'em production witness. The test exercises all six selector source kinds (`collection`, `product`, `routePairs`, `subset`, `candidateParams`, `microturnOptions`), preview-ref provenance, posture fallback behavior, and plan-proposal trace evidence at an observer scope.

The witness surfaced one small local engine bug in selector materialization: generic `tokens` collections, `candidateParams`, and `microturnOptions` could expose hidden token identifiers when evaluated with an observer. Fixed in scope in `packages/engine/src/agents/policy-selector-eval.ts` by reusing the existing observer projection to filter hidden token IDs. No new engine primitive, Texas Hold'em re-authoring, or follow-up spec was required.

Deviation from the original file-layout expectation: the synthesized hidden-info fixture and helpers live inside the new architectural test file rather than a separate `observer-safety/` helper directory. The fixture is test-local and not reused elsewhere, so a separate helper surface would add indirection without reducing duplication.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test dist/test/architecture/observer-safety-invariants.test.js` from `packages/engine` — passed, 7 tests / 3 suites.
3. `pnpm turbo lint` — passed.
4. `pnpm turbo typecheck` — passed.
5. `pnpm turbo test` — passed, 5 turbo tasks successful; engine runner reported 175/175 files passed.

Source-size ledger: `packages/engine/src/agents/policy-selector-eval.ts` is 428 lines after a +53/-6 tracked diff; `packages/engine/test/architecture/observer-safety-invariants.test.ts` is 351 lines. No file-size cap crossing.

Generated artifact provenance: no generated artifacts are checked in. Build output under `dist/` was produced only for proof commands.
