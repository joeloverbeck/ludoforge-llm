# 169PHASCHREF-002: Phase 1 — phase identity refs (current.id, next.id, schedule.nextBoundary.id)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — policy runtime ref resolution
**Deps**: `archive/tickets/169PHASCHREF-001.md`

## Problem

Spec 169 §4.2 defines three identity refs at the top of the `phase.*` and `schedule.*` surface: `phase.current.id`, `phase.next.id`, and `schedule.nextBoundary.id`. With Phase 0's types and validation in place (169PHASCHREF-001), agent profiles can reference these refs at compile time, but the runtime resolver does not yet return values. This ticket implements the resolver paths — pure state-local reads, no schedule distance computation yet, no WASM yet (deferred to 005).

These three refs unblock the simplest timing-aware considerations (e.g., "when the next boundary is `coupEntry`, prefer X") and serve as the canary for the ref-family registration end-to-end before card-draw distance machinery lands in 003.

## Assumption Reassessment (2026-05-13)

1. **`turn.phaseId` intrinsic exists**: confirmed in `packages/engine/src/agents/policy-runtime.ts:138,141` (`turnIntrinsic` dispatch). `phase.current.id` is a grammar-symmetric alias for the same underlying datum — same resolver source, new ref-AST node.
2. **`turnStructure.phases` exposes deterministic sequence**: confirmed in `kernel/types-core.ts:193-196`. `phase.next.id` reads the successor in declaration order from the current phase; interrupts are handled per ticket §4.1.
3. **`phaseBoundaries[]` available on compiled GameDef**: per 169PHASCHREF-001, the boundary declarations are part of the compiled artifact, indexed by id.
4. **No existing `nextBoundary` computation**: confirmed by grep — `schedule.nextBoundary.id` requires logic added in this ticket. For Phase 1, "nearest boundary" semantics use a coarse identity check (the first boundary in declaration order whose phaseId target lies at or after the current phase in the sequence). Card-draw-distance-aware ranking lands in 003.
5. **`scheduleFallback` AST field**: present on the ref AST per 169PHASCHREF-001 but unenforced. Identity refs in this ticket are always `ready` (never `unavailable`), so fallback is not exercised by these tests.

## Architecture Check

1. **Foundation #5 (One protocol)**: identity refs route through the same `policy-runtime.ts` resolver dispatcher used by every client (agents, simulator, runner). No bypass paths.
2. **Foundation #8 (Determinism)**: resolvers are pure functions of `(GameState, observerView)`. `phase.current.id` and `phase.next.id` depend only on `turnStructure.phases` order + current phase position. `schedule.nextBoundary.id` depends on the compiled boundary index (immutable) + current phase position.
3. **Foundation #10 (Bounded)**: each ref resolves in O(boundaries) at worst (linear scan of the declared boundary list per resolution). For typical games, boundary count is <10; cost is negligible.
4. **No backwards-compatibility shim**: `phase.current.id` is registered as a new ref alongside the existing `turn.phaseId` intrinsic; both remain valid grammar. Per spec §4.2 this duplication is intentional ("grammar symmetry"), not a deprecation alias.

### 4.1 Interrupt-phase handling

When the current phase is an interrupt-state with no determinate next phase in the main `turnStructure.phases` sequence:

- `phase.next.id` returns `unavailable` status.
- `schedule.nextBoundary.id` continues to resolve against the declared boundary index (boundaries can be scheduled across interrupts).

Per spec §11 Open Question 5, interrupt-phase behavior is part of this ticket's acceptance — covered by a dedicated test.

## What to Change

### 1. Add resolver branches in `policy-runtime.ts`

Locate the existing ref-kind dispatcher (search for `candidateParam` resolution at lines ~2200 onward in 166's pattern; exact location may differ post-spec-166). Add two new branches:

- `case 'phaseIntrinsic':` — dispatch by `name`:
  - `'current.id'` → `state.turnState.currentPhaseId` (or the kernel's canonical accessor for the current phase). Status `ready`, value = PhaseId.
  - `'next.id'` → compute via `turnStructure.phases` successor lookup; `ready` with value if determinate, `unavailable` if interrupt-state without determinate successor.
- `case 'scheduleDistance':` — for identity (no `unit`, just `nextBoundary.id`):
  - Iterate the compiled `phaseBoundaries[]` in declaration order; for each boundary of `kind: phaseEntry | phaseExit`, check whether its target phase is at-or-after the current phase in `turnStructure.phases` order. Return the first match. If none, status `unavailable`.

The `schedule.nextBoundary.id` ref is encoded as a `scheduleDistance` AST node with a special-cased target form (e.g., `target: { kind: 'nextBoundary' }`). Confirm the AST shape from 001's type additions and adjust the resolver dispatch accordingly.

### 2. Compile-time scope validation

`phase.current.id`, `phase.next.id`, `schedule.nextBoundary.id` are state-local, instantaneous reads. Compile-time scope acceptance: `move`, `microturn`, and any preview-inner scope (state snapshot reads through the same resolver). 001 ticket already accepts these scopes for the `phaseIntrinsic` and `scheduleDistance` ref-kinds — confirm before resolving.

### 3. Trace surface

Resolution metadata is emitted into the consideration trace row per spec §4.7. For Phase 1 identity refs, the trace fields are:

```json
{
  "consideration": "<name>",
  "inputRefs": {
    "phase.current.id": { "status": "ready", "value": "<phaseId>" }
  }
}
```

For `unavailable` status (interrupt path on `phase.next.id`), include `"reason": "interruptStateNoSuccessor"`.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify) — add `phaseIntrinsic` and `scheduleDistance`-identity resolver branches.
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — route compiled `phaseIntrinsic` and identity-only `scheduleDistance` refs through the new runtime resolver.
- `packages/engine/test/unit/agents/phase-identity-refs.test.ts` (new) — golden tests for each ref at multiple game positions.
- `packages/engine/test/determinism/phase-identity-refs-determinism.test.ts` (new) — replay determinism test asserting identical ref readouts across a 20-turn trace.

## Out of Scope

- `schedule.distance.toBoundary.<X>.<unit>` — distance refs are 003's responsibility.
- Card-draw schedule index in `GameDefRuntime` — 003.
- WASM opcode integration — 005.
- FITL `phaseBoundaries` authoring — 006. This ticket's golden tests use a minimal synthetic fixture with 1-2 boundaries.
- `scheduleFallback` runtime enforcement — identity refs in Phase 1 are always `ready` (never `unavailable`), so fallback is not exercised. The 003 ticket exercises fallback discipline against distance refs.

## Acceptance Criteria

### Tests That Must Pass

1. `phase-identity-refs.test.ts` — at three distinct game positions: (a) start of game, current=first phase, next=second phase; (b) mid-game, current=mid phase, next=next sequence phase; (c) interrupt-state mid-turn, current=interrupt phase, next=`unavailable`. `schedule.nextBoundary.id` returns the correct boundary id at each position given a fixture with 2 declared boundaries targeting different phases.
2. `phase-identity-refs-determinism.test.ts` — same GameDef + seed run twice produces byte-identical ref readouts at every microturn across a 20-turn trace.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit` passes — no regression.

### Invariants

1. `phase.current.id` value always equals `state.turnState.currentPhaseId` (or canonical equivalent). No drift.
2. `phase.next.id` and `schedule.nextBoundary.id` resolutions are pure functions of `(GameState, compiled boundary index)`. No PRNG consumption, no wall-clock dependency.
3. Trace status reasons are stable strings (`"interruptStateNoSuccessor"` etc.) — Phase 2 onward extends, never renames.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/phase-identity-refs.test.ts` (new) — `@test-class: architectural-invariant`; golden tests + interrupt-path coverage.
2. `packages/engine/test/determinism/phase-identity-refs-determinism.test.ts` (new) — `@test-class: architectural-invariant`; replay-identity over 20-turn trace.

### Commands

1. `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/phase-identity-refs.test.js dist/test/determinism/phase-identity-refs-determinism.test.js` — runs the new compiled Node tests in isolation. The earlier `--test-name-pattern` form was a stale Jest-style flag and is not valid for this repo's Node test runner.
2. `pnpm turbo test --filter=@ludoforge/engine` — full engine test gate.
3. `pnpm turbo typecheck` — cross-package typecheck.

## Outcome

Completion date: 2026-05-13

Implemented the Phase 1 TypeScript resolver slice:

- Added policy-runtime resolver support for `phase.current.id`, `phase.next.id`, and identity-only `schedule.nextBoundary.id`.
- Routed `phaseIntrinsic` and `scheduleDistance` compiled refs through `PolicyEvaluationContext` instead of returning `undefined`.
- Added `phase-identity-refs.test.ts` coverage for first-phase, mid-sequence, and interrupt-state readouts. The interrupt case proves `phase.next.id` returns the stable unavailable reason `interruptStateNoSuccessor` while `schedule.nextBoundary.id` still resolves from declared boundary metadata.
- Post-review cleanup added direct assertions for the remaining implementation-introduced schedule-resolution branches: `noBoundaryReachable` and `unsupportedScheduleDistance`.
- Added `phase-identity-refs-determinism.test.ts` coverage asserting byte-identical resolver readouts across a 20-step state-local trace for the same `GameDef` and seed.

Live-surface corrections from the draft:

- `policy-evaluation-core.ts` is owned routing fallout because the runtime provider alone is not reachable from compiled policy evaluation.
- The live policy metadata model does not emit a generic per-consideration `inputRefs` object for ready state-local refs. Evidence source: `packages/engine/src/agents/policy-evaluation-core.ts` and `packages/engine/src/agents/policy-agent.ts` record the existing unknown-ref metadata maps (`unknownPreviewRefs`, `unknownLookupRefs`, `unknownCandidateParamRefs`) rather than a generic ready-ref `inputRefs` row. This ticket proves ready values through scoring/readout witnesses and preserves the unavailable reason at the resolver boundary; broad trace-row redesign and schedule fallback trace detail remain out of scope for later schedule/fallback tickets.
- The focused acceptance command uses the repo's compiled Node-test shape instead of the stale `--test-name-pattern` flag.

Generated/schema fallout: none expected; no schema or serialized trace shape changed.

Deferred sibling scope:

- Outcome amended: 2026-05-13 — Updated the Phase 2 owner reference to its archived path after 169PHASCHREF-003 archival.
- `archive/tickets/169PHASCHREF-003.md` owns card-distance schedule computation and `scheduleFallback` enforcement.
- `tickets/169PHASCHREF-005.md` owns WASM opcode/runtime integration.
- `tickets/169PHASCHREF-006.md` owns FITL `phaseBoundaries` authoring.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine/src/agents/policy-runtime.ts` | 579 | 662 | No | +83 | Resolver helpers are small and local to the provider that owns state-local policy reads. The file crossed the near-cap checkpoint threshold but stayed below the 800-line cap; extracting these helpers now would obscure the ticket seam. | None |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 1938 | 1943 | No — preexisting oversized | +5 | The evaluator change is a surgical dispatch from the compiled ref switch into the new provider. Extraction is not meaningful for a five-line routing update in an established evaluator hub. | None |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/phase-identity-refs.test.js dist/test/determinism/phase-identity-refs-determinism.test.js` — passed, 5 tests after post-review branch coverage.
- `pnpm -F @ludoforge/engine test:unit` — passed, 5697 tests after post-review branch coverage.
- `pnpm turbo test --filter=@ludoforge/engine` — passed; fresh engine build, schema artifact check, and default engine test lane.
- `pnpm turbo typecheck` — passed.
- Post-review focused rerun after rebuilding compiled output: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/phase-identity-refs.test.js dist/test/determinism/phase-identity-refs-determinism.test.js` — passed, 5 tests.
- `pnpm run check:ticket-deps` — passed for 5 active tickets and 2323 archived tickets.

Late-edit proof validity: after spotting that the terminal main-sequence phase shared the interrupt unavailable reason, I added a failing unit assertion for the distinct `phaseSequenceExhausted` reason, fixed the resolver, and reran the affected proof lanes. Post-review then added branch-only test coverage for `noBoundaryReachable` and `unsupportedScheduleDistance`, with no production-code change; the focused compiled lane and full unit lane were rerun after that cleanup.
