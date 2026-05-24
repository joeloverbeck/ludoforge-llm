# 193POLVMDISPRES-001: Typed-verdict refactor — replace VMResult + delete PolicyBytecodeVmUnsupportedError; migrate 4 test files

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-vm/vm.ts` (return shape + opcode unsupported conversion), `packages/engine/src/agents/policy-evaluation-core.ts` (catcher → tag branch, fallback resolver throw → sentinel return, class deletion). Four engine test files migrated atomically.
**Deps**: `archive/specs/193-policy-vm-unsupported-feature-dispatch-restructure.md`

## Problem

`PolicyBytecodeVmUnsupportedError` constructor self-time is 14.3–36.2% of CPU across all six measured FITL workloads per the Spec 192 baseline (`reports/fitl-perf-baseline-2026-05-24.md` §Findings, row 1; raw evidence in `reports/perf-baseline/parity-drive-8203b4d023.json` showing two stack-attributed entries totalling ~28s on a 157s median, plus `resolveVmFallbackFeature` adding 5.0s + 3.8s self-time). The cost is dominated by `Error` constructor stack capture at high call rates, not by the dispatch logic itself.

This ticket implements Spec 193 §4.1–4.4: replace the legacy `VMResult` interface with a `VmEvalResult` discriminated union, convert the VM-core sentinel-to-throw conversion sites to typed early returns, rewrite `resolveVmFallbackFeature` to return the `UNSUPPORTED_FEATURE` sentinel instead of throwing, delete the `PolicyBytecodeVmUnsupportedError` class, and migrate every consumer (1 source caller + 4 test files / ~13 sites) atomically per Foundation 14.

## Assumption Reassessment (2026-05-24)

1. `PolicyBytecodeVmUnsupportedError` is declared at `packages/engine/src/agents/policy-vm/vm.ts:35-40`; thrown at `vm.ts:384` (LOAD_FEATURE) and `vm.ts:498` (RESOLVE_REF); thrown again inside `resolveVmFallbackFeature` at `policy-evaluation-core.ts:1388, 1390-1391, 1394`. Verified via direct grep during `/reassess-spec` on 2026-05-24.
2. Caught at `policy-evaluation-core.ts:1183-1184` inside `evaluateCompiledExprWithVm`; sole runtime catcher in source. Test catchers exist at `policy-bytecode-equivalence.test.ts:475, 540` and `policy-bytecode-fallback-completeness.test.ts:356`. Verified via direct grep.
3. `VMResult` (at `vm.ts:57-62`) has four fields: `scores: readonly number[]`, `value?: PolicyValue`, `pruned?: boolean`, `usedDynamicFallback: boolean`. `value`, `scores`, `usedDynamicFallback` are load-bearing for downstream consumers; `pruned` is declared but unread (out-of-scope cleanup; do not delete here).
4. The VM core already uses an internal `UNSUPPORTED_FEATURE = Symbol(...)` sentinel protocol at `vm.ts:33` — opcode handlers invoke callbacks via this sentinel; the throw at `vm.ts:384` is the conversion point, not the source. This ticket retains the internal sentinel protocol and changes only the public-boundary conversion.
5. `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` is already `@test-class: architectural-invariant` and already enumerates `KINDS_PRODUCED_BY_EMITTER = [...FEATURE_REF_KINDS]` to assert the Spec 154 paired-contract dispatch-completeness invariant. Shape-adapt it; do NOT author a new architecture-test file.
6. The Spec 192 trajectory-identity test at `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` covers all six perf workloads and serves as the Foundation 8 proof gate for this refactor.

## Architecture Check

1. **Foundation 14 atomic cut, mechanically uniform**: The class deletion + caller migration + ~13 test-site migrations must land in one change to avoid a transitional state where source and tests disagree (per Spec 193 §4.2). The test-site migration is mechanically uniform: `result.value` → `result.status === 'ok' ? result.value : ...`; `instanceof PolicyBytecodeVmUnsupportedError` → `result.status === 'unsupported'`; `throw new PolicyBytecodeVmUnsupportedError(...)` (fixture) → return `UNSUPPORTED_FEATURE` sentinel (matches the new callback contract). The Large effort rating is justified by the atomic-cut requirement; mechanical uniformity makes the large diff still reviewable.
2. **Foundation 15 strengthened, not weakened**: Spec 154's paired-contract invariant (every emitter-producible feature kind either VM-supported or fallback-handled, never silently defaulted) is preserved AND strengthened — TypeScript exhaustiveness on the `VmEvalResult` discriminant is a stronger compile-time guarantee than the prior dynamic `try`/`catch`. Removing the `'unsupported'` branch becomes a compile error; the existing `policy-bytecode-fallback-completeness.test.ts` (shape-adapted) covers the runtime architectural invariant.
3. **Foundation 8 preserved**: Same TS-evaluator fallback runs on the same predicates with the same encoded state; observable evaluation results are byte-identical. The Spec 192 trajectory-identity test is the proof gate. No game-specific code introduced (Foundation 1).
4. **Foundation 14 — no compat shims**: `PolicyBytecodeVmUnsupportedError` is deleted in this ticket; test fixtures that currently throw/catch it migrate in the same change. The class is NOT retained as a re-export, deprecated wrapper, or any other compat surface. Per Spec 193 §4.2.
5. **Foundation 20 (preview signal integrity)** unaffected: the unsupported verdict's information content (`feature`, `reason`) is identical to the prior thrown-error message; preview-ref status mapping is unchanged. Re-validation via `policy-preview-parity-arvn-1008` perf witness in ticket 002 covers any preview-status-boundary regression risk empirically.

## What to Change

### 1. Define `VmEvalResult` and remove `VMResult` in `vm.ts`

Add to `packages/engine/src/agents/policy-vm/vm.ts`:

```ts
export type VmEvalResult =
  | { readonly status: 'ok'; readonly value: PolicyValue | undefined; readonly scores: readonly number[]; readonly usedDynamicFallback: boolean }
  | { readonly status: 'unsupported'; readonly feature: FeatureRef; readonly reason: string };
```

Delete the existing `VMResult` interface at `vm.ts:57-62`. Update `executeBytecode`'s return type annotation accordingly.

### 2. Convert opcode throws to typed early returns in `vm.ts`

At `vm.ts:384` (LOAD_FEATURE) and `vm.ts:498` (RESOLVE_REF), replace `throw new PolicyBytecodeVmUnsupportedError(...)` with typed early returns from `executeBytecode`, building the `{ status: 'unsupported', feature, reason }` variant. The internal `UNSUPPORTED_FEATURE` sentinel protocol (`vm.ts:33`) is unchanged — opcode handlers still receive the sentinel from callbacks; only the conversion at lines 384 and 498 changes.

Per Spec 193 §4.1(a): if any opcode commits side effects to the per-call stack before reaching the unsupported conversion point, reset the stack before the early return. The per-call stack is a local fixed-size array; resetting it is `stack.fill(undefined, 0, stackTop)` or equivalent.

### 3. Delete `PolicyBytecodeVmUnsupportedError` class

Remove the class declaration at `vm.ts:35-40`. Remove its export from `packages/engine/src/agents/policy-vm/index.ts` if present. Remove the import in `policy-evaluation-core.ts:62` (drop the `PolicyBytecodeVmUnsupportedError` symbol from the import list; retain `executeBytecode` and `VMContext`).

### 4. Rewrite `resolveVmFallbackFeature` to return sentinel in `policy-evaluation-core.ts`

At `policy-evaluation-core.ts:1349`, change `resolveVmFallbackFeature`'s return type from `PolicyValue` to `PolicyValue | typeof UNSUPPORTED_FEATURE`. Replace the three throw sites at lines 1388, 1390-1391, 1394 with `return UNSUPPORTED_FEATURE`. Import `UNSUPPORTED_FEATURE` from `policy-vm/index.js` (export it if not already exported — verify during implementation).

This eliminates the per-call throw cost attributed to `resolveVmFallbackFeature` (~5.6% combined on `parity-drive`) at its source.

### 5. Replace `try`/`catch` in `evaluateCompiledExprWithVm` with tag branch

At `policy-evaluation-core.ts:1179-1188` (the try/catch block containing `executeBytecode`), replace with:

```ts
const result = executeBytecode(bytecode, this.encodedState, vmContext);
if (result.status === 'ok') return result.value;
// 'unsupported' — typed exhaustive branch
return this.evaluateCompiledExprDirect(expr, candidate);
```

TypeScript exhaustiveness on the discriminant forces this caller (and any future consumer of `executeBytecode`) to handle `'unsupported'` — type-checking fails otherwise. This is the strengthened Spec 154 guarantee.

### 6. Migrate `test/integration/policy-bytecode-equivalence.test.ts` (~5 sites)

- Line 9: import — drop `PolicyBytecodeVmUnsupportedError` from the imported names; retain `executeBytecode`.
- Line 78: drop the `PolicyBytecodeVmUnsupportedError?: new (...args: never[]) => Error` field from the `Vm` interface declaration.
- Line 79 + later usage (lines 413, 429, 461, 526): update the `executeBytecode` shape in the `Vm` interface and consumer call-sites — consumers now switch on `result.status === 'ok'` before reading `result.scores` / `result.value` / `result.usedDynamicFallback` (lines 436, 469, 473, 534, 538). Where consumers need the raw fields, destructure after the tag check.
- Lines 475, 540: replace `if (error instanceof PolicyBytecodeVmUnsupportedError)` catch blocks with `if (result.status === 'unsupported')` branches following the `executeBytecode` call.
- Line 438: `vm.PolicyBytecodeVmUnsupportedError` field access — drop (the field no longer exists on the interface per the line-78 change).

### 7. Migrate + shape-adapt `test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (~4 sites + shape adaptation)

Per Spec 154 paired-contract preservation (Spec 193 §4.4): this test is already `@test-class: architectural-invariant` and already enumerates `KINDS_PRODUCED_BY_EMITTER`. Adapt the assertion shape, not the test's existence.

- Line 6: drop `PolicyBytecodeVmUnsupportedError` from import.
- Lines 310, 312: the test fixture's `throw new PolicyBytecodeVmUnsupportedError(...)` constructs are part of fixture setup that simulates unsupported features. Rewrite to `return UNSUPPORTED_FEATURE` (the new callback contract).
- Line 343: the `executeBytecode` consumer now switches on `result.status`. Replace assertion logic accordingly.
- Line 356: replace `if (error instanceof PolicyBytecodeVmUnsupportedError && fixture.allowUnsupported === true)` catch with `if (result.status === 'unsupported' && fixture.allowUnsupported === true)` branch.

The architectural invariant the test asserts (every emitter-producible feature kind is VM-supported OR routed to TS fallback) is preserved verbatim — only the assertion mechanism changes from throw-catch to tag-discrimination.

### 8. Migrate `test/unit/agents/policy-vm-core.test.ts` (~3 opcode-level sites)

- Line 5: import — verify `executeBytecode` import is intact (no `PolicyBytecodeVmUnsupportedError` import here per the grep result).
- Lines 107, 155, 165 (and the `branch` helper at line 165 area): `executeBytecode` callers now return `VmEvalResult`. Update assertions to switch on `result.status` first, then read `result.value` / `result.scores` after the `'ok'` branch.

### 9. Migrate `test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts` (1 site)

- Line 135: `const vm = executeBytecode(...)` — update destructuring to switch on the tag before reading fields.

## Files to Touch

- `packages/engine/src/agents/policy-vm/vm.ts` (modify — define `VmEvalResult`, delete `VMResult` and `PolicyBytecodeVmUnsupportedError`, convert opcode throws at lines 384 and 498 to typed returns; update `executeBytecode` return type)
- `packages/engine/src/agents/policy-vm/index.ts` (modify — drop the `PolicyBytecodeVmUnsupportedError` export; ensure `UNSUPPORTED_FEATURE` is exported)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — line 62 import, line 1183-1184 catcher → tag branch, line 1349 `resolveVmFallbackFeature` return type + lines 1388/1390-1391/1394 throw → sentinel return)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify — ~5 sites per change item 6)
- `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (modify — shape-adapt + ~4 sites per change item 7; Spec 154 paired-contract preserved)
- `packages/engine/test/unit/agents/policy-vm-core.test.ts` (modify — ~3 sites per change item 8)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts` (modify — 1 site per change item 9)

## Out of Scope

- No expansion of the bytecode VM's supported feature set (`Bytecode-VM expansion` category in Spec 192 §4.4 — separate spec if Spec 193 §4.5 escalation trigger fires after ticket 002's measurement).
- No removal of the TS-evaluator fallback (Spec 154's paired-contract relies on its complete coverage).
- No change to bytecode emitter output (`stablePayloadCode`, `stableStringCode`, opcode set unchanged).
- No change to caller-visible policy evaluation results (same TS fallback on same predicates → byte-identical output).
- No change to preview-ref status semantics (Foundation #20 unchanged; verified empirically in ticket 002 via `policy-preview-parity-arvn-1008`).
- No negative cache (P2 — `archive/tickets/193POLVMDISPRES-003.md`; gated on ticket 002 measurement).
- No perf witness re-capture (P3 — `archive/tickets/193POLVMDISPRES-002.md`).
- WASM throw-contract is out-of-scope per Spec 192 §4.4 `WASM expansion`; `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` is NOT touched.
- Cleanup of `VMResult.pruned` (declared but unread) is out of scope here — separate ticket if warranted; this ticket migrates `pruned`-consuming sites only if any exist (none found at audit time).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` — 100% pass (all migrated tests green; no regression in non-touched tests).
2. `pnpm turbo typecheck` — 100% pass (TypeScript exhaustiveness on `VmEvalResult` forces caller handling of `'unsupported'`; type-check failure indicates a missed consumer).
3. Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) green across all six workloads (Foundation 8 proof).
4. Shape-adapted `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (Spec 154 paired-contract architectural-invariant) passes against the typed-verdict shape, with `KINDS_PRODUCED_BY_EMITTER` enumeration preserved.
5. `pnpm -F @ludoforge/engine test:e2e` (if available; engine test:e2e covers integration paths) green.
6. `pnpm run check:ticket-deps` green (dependency integrity, per `tickets/README.md` §Dependency Integrity).

### Invariants

1. No `PolicyBytecodeVmUnsupportedError` references in source or test: `grep -rn 'PolicyBytecodeVmUnsupportedError' packages/engine/` returns zero results (Foundation 14 — no compat shim).
2. No `VMResult` interface declaration: `grep -nE 'interface VMResult\b' packages/engine/src/` returns zero results (the type is fully replaced by `VmEvalResult`).
3. Spec 154 paired-contract: every emitter-producible feature kind, when evaluated by `executeBytecode`, returns either `{ status: 'ok' }` OR `{ status: 'unsupported' }` AND the `'unsupported'` branch is routed to the TS fallback (`evaluateCompiledExprDirect`) by `evaluateCompiledExprWithVm`. Asserted by the shape-adapted `policy-bytecode-fallback-completeness.test.ts`.
4. Foundation 8 byte-identical state-hash determinism preserved: trajectory-identity test green across all six workloads.
5. Foundation 11 immutability preserved: VM-internal stack remains per-call (not shared); typed verdict tuples are read-only; no mutation introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (modify — shape-adapt assertions per change item 7; preserve `@test-class: architectural-invariant` marker and `KINDS_PRODUCED_BY_EMITTER` enumeration; Spec 154 paired-contract invariant unchanged in semantics, only assertion mechanism changes).
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify — migrate per change item 6).
3. `packages/engine/test/unit/agents/policy-vm-core.test.ts` (modify — migrate per change item 8).
4. `packages/engine/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts` (modify — migrate per change item 9).
5. No new test files authored — Spec 154 paired-contract coverage already exists via item 1; per Spec 193 §4.4, the existing test is shape-adapted, not duplicated.

### Commands

1. `pnpm turbo build` (engine build prerequisite for `node --test` against `dist/`).
2. `pnpm -F @ludoforge/engine test` (full engine suite — must be 100% pass).
3. `pnpm turbo typecheck` (TypeScript exhaustiveness gate).
4. `pnpm turbo lint` (clean baseline).
5. `node --test packages/engine/dist/test/integration/perf-baseline-trajectory-identity.test.js` (trajectory-identity standalone sanity).
6. `node --test packages/engine/dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js` (Spec 154 paired-contract architectural invariant standalone sanity).
7. `pnpm run check:ticket-deps` (ticket integrity gate).

## Outcome

Completed: 2026-05-24

What changed:
- Replaced the public `VMResult` interface with the `VmEvalResult` discriminated union in `packages/engine/src/agents/policy-vm/vm.ts`; the `ok` branch carries `value`, `scores`, and `usedDynamicFallback`, while unsupported VM paths now return a typed verdict instead of constructing `PolicyBytecodeVmUnsupportedError`.
- Deleted `PolicyBytecodeVmUnsupportedError`; `UNSUPPORTED_FEATURE` is exported for the internal sentinel callback contract.
- Converted the VM unsupported conversion points for `LOAD_FEATURE`, `RESOLVE_REF`, and `RESOLVE_DYNAMIC` to typed early returns. `RESOLVE_REF` records `refId` because no `FeatureRef` exists at that opcode boundary.
- Replaced `evaluateCompiledExprWithVm`'s `try/catch` with a `result.status` branch that routes unsupported verdicts to `evaluateCompiledExprDirect`.
- Rewrote `resolveVmFallbackFeature` to return `UNSUPPORTED_FEATURE` for unsupported/default cases instead of throwing.
- Migrated the four named test files to branch on `result.status`, preserving the existing paired-contract architectural invariant coverage.

Deviations:
- No new architecture test file was added; the existing `policy-bytecode-fallback-completeness.test.ts` was shape-adapted as planned.
- No negative cache, perf recapture, WASM throw-contract change, or bytecode feature expansion landed; those remain owned by tickets 002/003 or out of scope.
- The full engine test lane produced untracked perf smoke byproducts under `reports/perf-baseline/`; they were not staged because this ticket does not own checked-in perf witness artifacts.

Verification:
- `pnpm turbo build` — passed.
- `node --test packages/engine/dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js` — passed (1 test).
- `node --test packages/engine/dist/test/unit/agents/policy-vm-core.test.js` — passed (5 tests).
- `node --test packages/engine/dist/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.js` — passed (4 tests).
- `node --test packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js` — passed (9 tests).
- `pnpm -F @ludoforge/engine test` — passed (169/169 files; includes `perf-baseline-trajectory-identity.test.js` across all six workloads).
- `pnpm turbo typecheck` — passed.
- `pnpm turbo lint` — passed.
- `pnpm -F @ludoforge/engine test:e2e` — passed (6 tests).
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2501 archived tickets.
- `rg -n "PolicyBytecodeVmUnsupportedError|interface VMResult\\b" packages/engine` — no hits.

Source-size ledger:

| Path | Before lines | After lines | Active growth | Crossed cap? | Ledger status |
|---|---:|---:|---:|---|---|
| `packages/engine/src/agents/policy-vm/vm.ts` | 563 | 580 | +17 | no | below cap; no extraction needed |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2878 | 2872 | -6 | no | preexisting over guidance, active change shrank file; no extraction needed |
