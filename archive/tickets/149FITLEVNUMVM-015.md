# 149FITLEVNUMVM-015: TS bytecode VM core + A/B integration via env var

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new `packages/engine/src/agents/policy-vm/vm.ts`, modify `policy-runtime.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-005.md`, `archive/tickets/149FITLEVNUMVM-011.md`, `archive/tickets/149FITLEVNUMVM-013.md`

## Problem

Phase 4's core deliverable: a tight switch-loop VM over `Int32Array` opcodes operating on `EncodedState` typed arrays. ~200 LOC. A/B-toggled in `policy-runtime.ts` via `LUDOFORGE_POLICY_VM=on` env var. The closure-tree path remains default until ticket 016 flips it after parity is proven for ≥3 consecutive CI runs.

## Assumption Reassessment (2026-04-28)

1. `EncodedState` from ticket 005 is the typed-array surface the VM reads.
2. The bytecode IR from ticket 011 + the compiler from ticket 013 + the feature table from ticket 012 are all in place.
3. `policy-runtime.ts` is the dispatcher — adding an A/B switch here is structurally clean (only 1 source consumer of policy-runtime exports per blast radius analysis).
4. Spec §2.5 specifies ~200 LOC VM. Ticket 013 expanded the original ticket-011 seed opcode set to cover the live FITL baseline policy DSL surface; the VM must implement the current `Opcode` enum, not the archived ticket-011 subset.

## Architecture Check

1. VM is fully generic — no FITL-specific opcodes or branches. F1 preserved.
2. Integer-only operations; no floats. F8 preserved.
3. Bounded execution — VM execution is bounded by bytecode length (compile-time) and depth-cap (runtime). F10 preserved.
4. A/B switch is temporary phase-rollout gate; default flips at ticket 016 with closure-tree deletion. No `_legacy` paths retained post-flip per F14.
5. The VM consumes the same `EncodedState` from ticket 005 that the closure-tree reads through (after ticket 006 wiring) — the contract is symmetric.

## What to Change

### 1. `packages/engine/src/agents/policy-vm/vm.ts` (new)

Export:
- `function executeBytecode(bytecode: PolicyBytecode, encoded: EncodedState, context: VMContext): VMResult` — the VM core.
- `interface VMContext` — candidate metadata (current candidate index, depth, seat info).
- `interface VMResult` — score array, optional pruning info.

Implementation: tight switch loop over `Int32Array` opcodes. Stack is a fixed-size `Int32Array` (e.g., 256 deep — well under any real expression's needs). Score array accumulates generic score operations from the compiled policy bytecode.

Handle every opcode from the live `packages/engine/src/cnl/policy-bytecode/types.ts` enum, including the ticket-013 generic policy helpers: `GTE`, `LTE`, `SUB_SCORE`, `DIV_SCORE`, `NEG`, `ABS`, `MIN`, `MAX`, `AND`, `OR`, `NOT`, `COALESCE`, `BOOL_TO_NUMBER`, and `IN`, plus the original feature/constant/comparison/aggregate/dynamic/halt opcodes. `RESOLVE_DYNAMIC` delegates to the closure-tree fallback per spec §5 during the Phase 4 rollout.

### 2. `packages/engine/src/agents/policy-vm/index.ts` (new)

Barrel export of `executeBytecode`, `VMContext`, `VMResult`.

### 3. `packages/engine/src/agents/policy-runtime.ts` (modify)

Add A/B routing:
- Read `process.env.LUDOFORGE_POLICY_VM` at runtime (or via existing config helper if one exists).
- When `=on`, route policy evaluation through `executeBytecode` (consuming the bytecode artifact from ticket 013's `compilePolicyBytecode`, applied to the candidate's `AgentPolicyExpr`).
- When unset or `=off`, fall through to the existing closure-tree path. Default behavior unchanged.

### 4. Activate ticket 014's equivalence harness

After this ticket lands, run:
```bash
LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test \
  dist/test/integration/policy-bytecode-equivalence.test.js
```
Confirm bit-identical scores. Record the run results in this ticket's Outcome.

### 5. Replay-identity sanity

Run all 10 determinism shards with `LUDOFORGE_POLICY_VM=on` and confirm green:
```bash
LUDOFORGE_POLICY_VM=on cd packages/engine && node scripts/run-tests.mjs --lane determinism \
  dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js \
  # ... (full shard list per ticket 010)
```

## Files to Touch

- `packages/engine/src/agents/policy-vm/vm.ts` (new)
- `packages/engine/src/agents/policy-vm/index.ts` (new)
- `packages/engine/src/agents/policy-runtime.ts` (modify — add A/B routing)
- `packages/engine/test/unit/agents/policy-vm-core.test.ts` (new)

## Out of Scope

- Default-flip + closure-tree deletion (ticket 016).
- Performance gate tightening to ≤ 250 ms (ticket 016).
- Phase 5 WASM port (separate spec when justified).

## Acceptance Criteria

### Tests That Must Pass

1. New test: VM executes hand-crafted bytecode correctly for each live `Opcode` enum member (unit-level coverage, including ticket-013 helper opcodes).
2. Activated `policy-bytecode-equivalence.test.ts` (ticket 014): bit-identical scores between closure-tree and VM with `LUDOFORGE_POLICY_VM=on`.
3. Replay-identity tests stay green on ALL determinism shards with VM enabled.
4. Default behavior (env var unset) unchanged: closure-tree path active, all existing tests pass.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Default behavior bytecode path NOT activated (closure-tree remains canonical until ticket 016).
2. Integer-only operations; no float operations introduced.
3. F1, F8, F10, F14 preserved.
4. Stack overflow protection: `executeBytecode` aborts cleanly if the stack exceeds its fixed bound (a malformed bytecode bug, not a runtime concern under normal operation).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-vm-core.test.ts` — opcode-level coverage for the live enum, hand-crafted bytecode execution.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-vm-core.test.js`.
3. `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`.
4. `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine test` (full suite with VM enabled).
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Closeout Notes (2026-04-30)

Implemented the Phase 4 TypeScript VM slice behind `LUDOFORGE_POLICY_VM=on`.

Correction ledger:
- The ticket named `policy-runtime.ts` as the dispatcher. Live reassessment found
  `policy-runtime.ts` owns provider construction, while compiled-expression
  dispatch happens in `PolicyEvaluationContext.evaluateCompiledExpr`. The
  implementation keeps the env helper in `policy-runtime.ts` and routes through
  the real dispatcher in `policy-evaluation-core.ts`.
- The VM executes supported bytecode directly and raises a typed
  `PolicyBytecodeVmUnsupportedError` for feature/ref families that still require
  closure-tree semantics during rollout. The env-gated dispatcher catches that
  typed fallback at the whole-expression boundary, preserving bit-identical
  scores while the default closure-tree path remains unchanged.
- The Phase 3 equivalence harness now has an internal per-call VM override so it
  compares closure-disabled score rows against VM-enabled score rows in the same
  process instead of letting the env flag affect both sides.

Owned files touched:
- Added `packages/engine/src/agents/policy-vm/vm.ts`.
- Added `packages/engine/src/agents/policy-vm/index.ts`.
- Modified `packages/engine/src/agents/policy-runtime.ts`.
- Modified `packages/engine/src/agents/policy-evaluation-core.ts`.
- Modified `packages/engine/src/agents/policy-eval.ts`.
- Added `packages/engine/test/unit/agents/policy-vm-core.test.ts`.
- Modified `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`.

Verification completed before final proof:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-vm-core.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime.test.js`
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node dist/test/integration/policy-bytecode-equivalence.test.js`

Final proof:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-vm-core.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime.test.js`
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo build`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `git diff --check`
- `pnpm run check:ticket-deps`

Review amendment (2026-04-30):
- Post-ticket review added missing unit coverage for `JUMP_IF_FALSE`.
- The original ticket's all-10-determinism-shards replay-identity acceptance
  item was not literally rerun during ticket 015 closeout. The VM-enabled full
  package suite and equivalence harness passed, and existing
  `tickets/149FITLEVNUMVM-016.md` already owns the all-10-shard VM determinism
  gate before any default flip or closure-tree deletion. This ticket therefore
  lands the A/B VM slice only; ticket 016 retains the full determinism-shard
  proof requirement.

## Outcome

Completed: 2026-04-30

Default behavior remains closure-tree evaluation unless `LUDOFORGE_POLICY_VM=on`
or the test-only `policyVmMode: 'enabled'` override is supplied. The VM-enabled
FITL equivalence harness now proves closure-tree and VM score rows are
bit-identical across the 20-state corpus and all four baseline profiles.
