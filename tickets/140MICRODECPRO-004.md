# 140MICRODECPRO-004: D2 + D3 (simple contexts) — publishMicroturn + applyDecision for actionSelection / chooseOne / turnRetirement

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new `publishMicroturn`, `applyDecision`, `advanceAutoresolvable` for simple contexts
**Deps**: `archive/tickets/140MICRODECPRO-003.md`

## Problem

With the D1 type surface and decision stack now present in `GameState`, this ticket introduces the microturn publish/apply primitives for the *simple* contexts — action selection, chooseOne binding, and turn retirement. These three cover most straightforward compound-turn structures and derisk the protocol before the hardest case (nested effect-frame suspend/resume in ticket 005) lands.

Scope-limited by design: no `chooseNStep`, no `stochasticResolve`, no `outcomeGrantResolve`, no nested effect-frame resumption. Those land in ticket 005. The simulator still uses the legacy `applyMove` path until ticket 006.

## Assumption Reassessment (2026-04-20)

1. Ticket 003 has landed — `DecisionStackFrame`, `MicroturnState`-adjacent types, and the four new `GameState` fields are in place.
2. The existing legality oracle `evaluateMoveLegality` (`packages/engine/src/kernel/move-legality-predicate.ts`) is preserved per spec G5 Non-Goal — this ticket invokes it per microturn unchanged.
3. Hidden-information projection utilities exist in the kernel per F4 — this ticket reuses them for `projectedState`.
4. `ProjectedGameState` type exists in the kernel (or is trivially constructed from `GameState` + per-decider projection).

## Architecture Check

1. Thin surface, single responsibility: `publishMicroturn` reads state, emits one `MicroturnState`; `applyDecision` consumes exactly one decision and returns new state + log. No grammar fusion with the legacy move path — this ticket *adds* the microturn API alongside `applyMove`, which retires in ticket 006.
2. Engine-agnosticism (F1): all new code is game-agnostic. Simple-context handling is defined over the D1 types, not over FITL or Texas action shapes.
3. Immutability (F11): `applyDecision` returns new `GameState`; the input is never mutated. No working-state mutation is needed at this scope — simple contexts do not suspend/resume effect frames.
4. Constructibility (F18, amended): every action in the published `legalActions` is directly applicable. The simple-context cases satisfy this trivially because they either return one atomic selection (chooseOne, actionSelection) or one canonical resolution (turnRetirement).

## What to Change

### 1. Create `packages/engine/src/kernel/microturn/publish.ts`

Export:

```ts
export interface MicroturnState {
  readonly kind: DecisionContextKind;
  readonly seatId: SeatId | '__chance' | '__kernel';
  readonly decisionContext: DecisionContext;
  readonly legalActions: readonly Decision[];
  readonly projectedState: ProjectedGameState;
  readonly turnId: TurnId;
  readonly frameId: DecisionFrameId;
  readonly compoundTurnTrace: readonly CompoundTurnTraceEntry[];
}

export const publishMicroturn = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): MicroturnState;
```

Support only contexts `actionSelection`, `chooseOne`, `turnRetirement` in this ticket. For any other context kind found on the stack top, throw a developer-facing error (`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET`) — ticket 005 extends coverage.

Invariants enforced:
- `legalActions.length >= 1` for `actionSelection` and `chooseOne` (turn-retirement also canonically produces exactly one action — the retirement marker itself).
- Every action in `legalActions` has `kind === microturn.decisionContextKind`.
- `projectedState` reflects the active decider's view — per-seat hidden-info masking for player seats; full state for `__kernel`.
- `compoundTurnTrace` enumerates decisions made under the current `turnId`, reconstructed from the decision stack frames sharing that `turnId`.

### 2. Create `packages/engine/src/kernel/microturn/apply.ts`

Export:

```ts
export interface ApplyDecisionResult {
  readonly state: GameState;
  readonly log: DecisionLog;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
}

export const applyDecision = (
  def: GameDef,
  state: GameState,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyDecisionResult;
```

Handle three cases per spec 140 D3 Table:

- `actionSelection`: validate action is eligible; push an `ActionExecutionRoot` frame that begins effect execution. For actions with zero sub-decisions, execute fully and produce a single `DecisionLog` marked `turnRetired: true`. For actions with sub-decisions, suspend after opening the first sub-decision frame — this ticket handles the simple case; ticket 005 handles nested resumption.
- `chooseOne`: bind the chosen value to the `decisionKey` in the top frame's `accumulatedBindings`; pop the frame; resume the parent frame (if the parent's next effect step is terminal, complete the turn).
- `turnRetirement`: retire the current compound turn — increment `turnCount`, fire end-of-turn triggers, run terminal check, advance `activePlayer` per turn-order state, pop the retirement frame.

### 3. Create `packages/engine/src/kernel/microturn/advance.ts`

Export:

```ts
export const advanceAutoresolvable = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  runtime?: GameDefRuntime,
): { readonly state: GameState; readonly rng: Rng; readonly autoResolvedLogs: readonly DecisionLog[] };
```

In this ticket, the only auto-resolvable context is `turnRetirement` — the loop applies the canonical retirement and pushes the next seat's `ActionSelectionContext` (or surfaces terminal check). `stochasticResolve` and `outcomeGrantResolve` contexts are unsupported in this ticket; if encountered, throw `UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET` (ticket 005 extends coverage).

Bounded by `MAX_AUTO_RESOLVE_CHAIN` (from ticket 003). Documentation-grade comment explains that the bound prevents cascading retirement chains.

### 4. `DecisionLog` type

Add the `DecisionLog` type to `packages/engine/src/kernel/microturn/types.ts` (or a new `decision-log.ts` sibling). Fields per spec 140 D4 — this ticket uses it, ticket 006 adopts it as the canonical trace entry.

### 5. Wire into barrel

Extend `packages/engine/src/kernel/index.ts` with `export * from './microturn/publish.js'`, `apply.js`, `advance.js`.

## Files to Touch

- `packages/engine/src/kernel/microturn/publish.ts` (new)
- `packages/engine/src/kernel/microturn/apply.ts` (new)
- `packages/engine/src/kernel/microturn/advance.ts` (new)
- `packages/engine/src/kernel/microturn/types.ts` (modify — add `MicroturnState`, `DecisionLog`, helper types if not already present)
- `packages/engine/src/kernel/index.ts` (modify — re-export)

## Out of Scope

- `chooseNStep`, `stochasticResolve`, `outcomeGrantResolve` contexts — ticket 005.
- Effect-frame suspend/resume across nested decisions — ticket 005.
- Simulator loop rewrite to call these new primitives — ticket 006.
- Agent API change (`chooseMove` → `chooseDecision`) — ticket 007.
- Tests T1, T3, T8 — bundled in ticket 014 per spec.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — new modules compile cleanly.
2. Existing engine test suite passes unchanged — simulator still uses legacy `applyMove`, so no behavioral regression.
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. `publishMicroturn` returns a `MicroturnState` where every action has `kind === microturn.decisionContextKind` — enforced by type discipline, verified by smoke test if any inline ticket-level test is added.
2. `applyDecision` is pure: input `state` is never mutated (F11).
3. Unsupported-context errors are developer-facing only — they cannot surface during normal game play because ticket 004 is unused by the simulator until ticket 006.

## Test Plan

### New/Modified Tests

None in this ticket — T1 (publication invariant), T3 (atomic legal actions), T8 (stochastic auto-advance) are bundled in ticket 014 per spec. A developer-smoke test file at `packages/engine/test/unit/kernel/microturn-smoke.test.ts` may be added to exercise the simple contexts during development, but it is not required by spec 140 T-series.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
