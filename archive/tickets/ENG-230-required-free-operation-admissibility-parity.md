# ENG-230: Restore required free-operation admissibility parity across publication, probe, legality, and apply

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel microturn publication, legality/admissibility classification, and apply-time required-grant enforcement
**Deps**: `tickets/README.md`, `archive/tickets/FREEOP-OUTCOME-001-filter-no-op-completions.md`, `archive/tickets/141RUNCACHE-004.md`

## Problem

The current kernel exposes an architecturally-invalid split for required free-operation moves.

On the live codebase as of `2026-04-23`, FITL seed `1006` reproduces this exact contradiction:

1. `publishMicroturn(...)` publishes an NVA `chooseNStep` `confirm` decision inside a required free `march` chain.
2. `PolicyAgent.chooseDecision(...)` selects that published frontier decision without synthesizing anything off-frontier.
3. `probeMoveViability(...)` classifies the resulting completed move as `viable: true`, `complete: true`.
4. `evaluateMoveLegality(...)` returns `{ kind: "legal" }` for that same completed move.
5. `applyMove(...)` rejects the same move with:
   - `ILLEGAL_MOVE`
   - `reason=moveNotLegalInCurrentState`
   - `detail=active seat has unresolved required free-operation grants`

That violates `docs/FOUNDATIONS.md` in multiple ways:

- Foundation #5 / #18: publication and execution are not using one authoritative legality contract
- Foundation #19: a published atomic decision is not actually executable at its microturn scope
- Foundation #16: the repo lacks proof that publication/probe/legality/apply remain equivalent for required free-operation completions

This is worse than a `noLegalMoves` stop. The kernel is positively publishing and rating a decision as legal, then rejecting it only at execution time.

## Assumption Reassessment (2026-04-23)

1. The failure is not an agent bug. The live seed-1006 trace shows the failing `confirm` exists in `microturn.legalActions`, and the selected decision matches a published frontier entry exactly.
2. The failure is not FITL-specific authored data drift. The contradiction is between generic kernel layers: `publishMicroturn`, `probeMoveViability`, `evaluateMoveLegality`, and `applyMove`.
3. `archive/tickets/FREEOP-OUTCOME-001-filter-no-op-completions.md` already fixed one earlier parity gap for `mustChangeGameplayState`, but the current bug is a different seam: unresolved required pending free-operation grants still are not modeled consistently in the shared legality oracle.
4. `archive/tickets/141RUNCACHE-004.md` established that helper paths claiming authoritative behavior need observable-semantic parity with the canonical run path. The same principle applies here inside the kernel: frontier publication, probe, and apply must agree on the admissibility of a completed move.
5. Live evidence from seed `1006`:
   - the partial move with Tay Ninh selected and empty guerrilla selection is accepted by `probeMoveViability`, which auto-completes the troop selection to `[]`
   - the completed move is still reported `legal` by `evaluateMoveLegality`
   - `applyMove` then rejects that same completed move because required free-operation grants remain unresolved
6. Scope correction: the root issue is not “march chooseN confirm logic” in isolation. The real gap is that the authoritative legality/admissibility oracle does not encode the same required-grant completion contract that `applyMove` enforces.

## Architecture Check

1. The correct fix is a shared engine-agnostic admissibility boundary for required free-operation moves. It must be consumed by microturn publication, move viability probing, legality classification, and apply-time validation. Agent-local filtering or FITL-specific guards would violate Foundations #1 and #5.
2. Required pending free-operation grant satisfaction is part of constructibility, not a later execution-only concern. If a completed move would still leave the active seat with unresolved required grants, that move is not client-legal and must not be published or reported viable.
3. The fix should reduce duplicate legality reasoning, not add another parallel check. Today the same move can pass `probeMoveViability` / `evaluateMoveLegality` and still fail `applyMove`; the architecture needs one reusable classifier/helper for this boundary.
4. No backwards-compatibility shims or legacy side paths. Old helper-specific interpretations of required grants should be deleted or converged onto the same shared contract.

## What to Change

### 1. Define one authoritative required-free-operation admissibility seam

Extract or introduce a shared kernel helper that answers the real contract question for a completed or partially-completed move:

- does this move satisfy the active seat's required pending free-operation grant contract in the current state?
- if incomplete, does there exist at least one completion that satisfies that contract?
- if complete, can this move be executed without leaving unresolved required grants behind?

This helper must be reusable from all client-facing legality surfaces.

Recommendation: extend the existing shared legality/admissibility path rather than layering more one-off checks into `probeMoveViabilityRaw(...)` or `microturn/publish.ts`.

### 2. Make `evaluateMoveLegality(...)` and admissibility classification reflect required-grant completion semantics

`evaluateMoveLegality(...)` currently returns `legal` for the completed seed-1006 move that `applyMove(...)` rejects. That must be impossible.

Update the shared legality/admissibility layer so that:

- completed free-operation moves that leave required pending grants unresolved are illegal before execution
- incomplete free-operation templates are only admissible if at least one completion satisfies the same required-grant contract
- the result maps cleanly into `classifyMoveAdmissibility(...)` and `probeMoveViability(...)`

This is the core architectural repair.

### 3. Gate microturn publication on the same shared admissibility oracle

`publishMicroturn(...)` / `toChooseNStepDecisions(...)` must not publish `confirm` steps whose resulting move would be rejected by the authoritative admissibility contract.

Do not preserve a private publication-only heuristic. The publication path should consume the same shared legality/admissibility result used by probe and apply.

### 4. Keep `applyMove(...)` authoritative while removing disagreement

`applyMove(...)` remains the final enforcement point, but it must no longer be the first place where this class of illegality is discovered for already-published decisions.

If implementation shows the cleanest design is to move the required-grant admissibility computation into a shared helper used by `validateMove(...)` and by preflight/publication, do that. The goal is parity, not duplication.

### 5. Add comprehensive proof coverage, including edge cases

This ticket must land with thorough tests that cover more than the exact seed witness:

- the exact seed-1006 regression
- completed required free-operation moves with zero-length follow-on chooseN bindings
- partial templates that are still admissible because some future completion remains legal
- normal non-free-operation zero-cardinality choices that are still valid and must not regress
- publication/probe/apply parity on the same move shape
- simulator/policy path proof that published decisions no longer lead to execution-time `ILLEGAL_MOVE` at this seam

## Files to Touch

- `packages/engine/src/kernel/move-legality-predicate.ts` (modify) — fold required pending free-operation grant satisfaction into the authoritative legality oracle
- `packages/engine/src/kernel/move-admissibility.ts` (modify) — reflect the same required-grant contract in admissibility classification
- `packages/engine/src/kernel/apply-move.ts` (modify) — reuse the shared helper instead of keeping execution-only semantics isolated here
- `packages/engine/src/kernel/microturn/publish.ts` (modify) — gate published action/chooseN continuations on the shared admissibility result
- `packages/engine/src/kernel/turn-flow-eligibility.ts` and/or a new shared helper module under `packages/engine/src/kernel/` (modify/add) — host the canonical required-grant admissibility logic if that is the cleanest ownership
- `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/microturn-publication.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` and/or `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-march-free-operation.test.ts` and/or `packages/engine/test/integration/agents-never-throw-microturn.test.ts` (modify/add)
- `packages/engine/test/integration/sim/simulator.test.ts` (modify/add if needed for end-to-end witness)

## Out of Scope

- FITL-specific rule-data rewrites for the affected march/event
- campaign-script workarounds in `campaigns/fitl-arvn-agent-evolution/*`
- agent-only filtering that leaves kernel publication/probe/apply disagreement intact
- changing generic `chooseN min: 0` semantics for non-free-operation actions

## Acceptance Criteria

### Tests That Must Pass

1. The seed-1006 witness no longer produces a published decision that later fails at `applyMove(...)` because of unresolved required free-operation grants.
2. For the completed seed-1006 move shape, `probeMoveViability(...)`, `evaluateMoveLegality(...)`, and `applyMove(...)` agree on the verdict.
3. `publishMicroturn(...)` does not expose `chooseNStep` / `confirm` decisions whose resulting move is inadmissible under the shared required-grant contract.
4. Required free-operation templates remain publishable when at least one legal completion still exists; the fix must not collapse valid deferred templates into false negatives.
5. Existing suite: `pnpm -F @ludoforge/engine test:all`

### Invariants

1. Any decision published in a microturn frontier is executable under the same legality contract used by `applyMove(...)` at that boundary.
2. `probeMoveViability(...)`, `evaluateMoveLegality(...)`, `classifyMoveAdmissibility(...)`, and `applyMove(...)` must agree on required free-operation admissibility for the same `(def, state, move)`.
3. The contract remains game-agnostic and generic to free-operation/turn-flow semantics, not FITL-specific.
4. Valid deferred free-operation templates remain supported; only truly inadmissible completions are removed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts`
   Add a regression proving that the completed seed-1006 move shape is illegal before execution, not only during `applyMove(...)`.
2. `packages/engine/test/unit/kernel/microturn-publication.test.ts`
   Add a frontier-publication regression proving the failing `confirm` is not published once its resulting move is inadmissible.
3. `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` and/or `packages/engine/test/unit/kernel/apply-move.test.ts`
   Add parity coverage so probe/apply cannot disagree on required pending grant enforcement again.
4. `packages/engine/test/integration/fitl-march-free-operation.test.ts`
   Add the exact FITL required-march regression, including the empty-guerrilla / empty-troop edge case.
5. `packages/engine/test/integration/agents-never-throw-microturn.test.ts` or `packages/engine/test/integration/sim/simulator.test.ts`
   Add an end-to-end proof that the simulator/policy path no longer publishes a decision that execution rejects at this seam.
6. Add at least one non-FITL or engine-generic edge-case regression if a reusable fixture can express it cleanly:
   demonstrate that a normal non-free-operation zero-cardinality chooseN path still behaves correctly.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/evaluate-move-legality.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-march-free-operation.test.js`
6. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/agents-never-throw-microturn.test.js`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm -F @ludoforge/engine typecheck`
9. `pnpm -F @ludoforge/engine test:all`

## Outcome (2026-04-24)

- Live reassessment showed the owned kernel fix and regression coverage were already present on `HEAD`; this turn was `verification + truthful closeout`, not fresh implementation.
- Required pending free-operation grant admissibility is now enforced through the shared legality path used by publication, probe/admissibility, legality classification, and apply-time validation.
- The seed-1006 FITL March witness is covered by focused regression proof: the empty required free-operation `chooseNStep` confirm is no longer published, and the simulator/agent path stays executable through the former failure seam.
- Ticket-named engine/test paths were `verified-no-edit` during closeout because the implementation had already landed in the live codebase.
- `ticket corrections applied`: `Status: PENDING -> Status: COMPLETED after live proof confirmed ENG-230 was already implemented on HEAD`
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/evaluate-move-legality.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-march-free-operation.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/integration/agents-never-throw-microturn.test.js`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine typecheck`; `pnpm -F @ludoforge/engine test:all`
- `schema/artifact fallout`: none beyond rebuilt `packages/engine/dist`
- `proof gaps`: none
