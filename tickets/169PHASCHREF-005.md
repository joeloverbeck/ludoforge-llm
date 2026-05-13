# 169PHASCHREF-005: Phase 4 — WASM opcode integration for phase.* and schedule.* refs

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — Rust WASM policy VM, TS opcode mapping, equivalence test fixture
**Deps**: `tickets/169PHASCHREF-004.md`

## Problem

Phases 1-3 (tickets 002-004) ship `phase.*` and `schedule.*` ref families on the TypeScript resolver path only. The production preview-drive batch in `policy-eval.ts` routes through WASM (Spec 167 made WASM the default scoring path; `wasmScoreRowRouteCount` is non-trivial in production traces). Until the new ref kinds have opcode slots in `packages/engine-wasm/policy-vm/src/lib.rs` and Rust resolver handlers, agents using these refs would either (a) silently fall back to the TS interpreter — defeating Spec 167's perf work — or (b) emit `unsupported` route counts that pollute trace diagnostics.

This ticket adds:

- Opcode slots + feature constants in `lib.rs` ABI for the two new ref kinds (`phaseIntrinsic` + `scheduleDistance`).
- Rust handlers that resolve refs from the encoded input rows (the WASM equivalents of 002/003/004's TS resolver paths).
- `REF_KIND_TO_OPCODE` (or its current canonical mapping name) extension in `policy-wasm-runtime.ts`.
- ABI version bump per the project's ABI versioning discipline.
- Extension of `policy-bytecode-equivalence.test.ts` to cover the new refs across both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths.

## Assumption Reassessment (2026-05-13)

1. **WASM is the default scoring path post-167**: confirmed via `archive/specs/167-arvn-evolution-harness-performance.md` (Phase 0 — `initializePolicyWasmRuntimeSync()` called at tournament startup). WASM is loaded for production runs.
2. **`policy-bytecode-equivalence.test.ts` is the canonical equivalence harness**: confirmed at `packages/engine/test/integration/policy-bytecode-equivalence.test.ts:15,470,533,602` (referenced in Spec 167 §2.2). It tests WASM-vs-TS scoring identity over fixture profiles.
3. **`lib.rs` has existing opcode/feature constant patterns**: confirmed (lib.rs lines 32-78 per the Explore agent's verification during spec authoring) — OP_LOAD_FEATURE, OP_RESOLVE_REF, FEATURE_CANDIDATE_PARAM, FEATURE_CANDIDATE_TAG, etc. New constants follow the same shape.
4. **`preview_drive.rs` exists and is 379 lines**: confirmed via grep. The preview-drive path may need similar ref-resolution updates if the new refs are read inside preview frames — but per Spec 169 §3 Non-goals, `phase.*` and `schedule.*` are NOT preview-derived. The preview-drive read path uses the same state snapshot mechanism; confirm during implementation that snapshot reads work through the same opcodes.
5. **ABI versioning convention**: lib.rs exports `ludoforge_policy_vm_abi_version()` (line 107 area per Spec 167's reference). Adding opcodes bumps the version.

## Architecture Check

1. **Foundation #5 (One protocol)**: WASM resolver semantics MUST equal TS resolver semantics for every new ref. The equivalence test enforces this — if WASM diverges, the test fails.
2. **Foundation #8 (Determinism)**: WASM resolution is deterministic; no FFI nondeterminism, no thread-local state in handlers.
3. **Foundation #10 (Bounded)**: opcode dispatch is O(1) per ref; resolution itself remains O(1) per the underlying schedule index (003) or phase-sequence lookup (002).
4. **No backwards compatibility**: ABI version bump is the canonical signal. Existing fixtures and profile bytecode are recompiled at load time; no shim layer.
5. **Trace-route parity**: WASM-routed refs must emit identical `inputRefs[]` shape to TS-routed refs (status, value, reason, fallback). The equivalence test asserts byte-identical trace JSON across both paths.

## What to Change

### 1. Opcode + feature constants in `lib.rs`

In `packages/engine-wasm/policy-vm/src/lib.rs`:

- Add `FEATURE_PHASE_INTRINSIC = <next-slot>` and `FEATURE_SCHEDULE_DISTANCE = <next-slot>` to the feature constant block (lines ~63-78).
- Add opcode constants if needed (`OP_RESOLVE_PHASE_INTRINSIC`, `OP_RESOLVE_SCHEDULE_DISTANCE`) — or extend the existing `OP_RESOLVE_REF` dispatcher to handle the new feature ids. Pick the path that aligns with how `candidateParam` was added in Spec 166.
- Bump `ludoforge_policy_vm_abi_version()` return value.

### 2. Rust resolver handlers

Add `resolve_phase_intrinsic` and `resolve_schedule_distance` functions in `lib.rs` (or split into `phase_refs.rs` if the file size warrants extraction):

- `resolve_phase_intrinsic`: dispatches on the intrinsic name (`current.id`, `next.id`, `nextBoundary.id`); reads from the encoded input row's phase fields (which the TS encoder populates per the new feature ids).
- `resolve_schedule_distance`: dispatches on target kind + unit; reads from encoded schedule-index data passed through the input row. The schedule index itself is computed TS-side per 003 (the kernel runtime owns it); WASM reads the encoded snapshot.

The encoder (`policy-wasm-runtime.ts`'s `encodeBytecodeInput`) must populate the new fields. Spec 167's Phase 2 baseline notes `encodeBytecodeInput` at `38ms` per profiling probe; new fields should not regress that materially (target: <5ms additional).

### 3. TS opcode mapping

In `packages/engine/src/agents/policy-wasm-runtime.ts`:

- Locate the canonical mapping (Spec 169 §2.6 referenced `REF_KIND_TO_OPCODE`, but Spec 167 §2.2's grep found `POLICY_WASM_SMOKE_OPCODE_ADD = 1` instead — the canonical name may differ post-167). Identify the correct mapping by grepping for ref-kind dispatch in policy-wasm-runtime.ts during implementation.
- Add entries: `phaseIntrinsic: <slot>`, `scheduleDistance: <slot>`. Slots align with `lib.rs` feature constants.

### 4. Encoder extension

In `policy-wasm-runtime.ts`'s `encodeBytecodeInput`:

- For each consideration whose AST references `phaseIntrinsic` or `scheduleDistance`, encode the resolution input (phase id, boundary id index, unit code, current draw position, observer view summary). The encoded input must be sufficient for the Rust handlers to compute the same value the TS resolver would.

### 5. Equivalence test extension

In `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`:

- Add a new fixture profile exercising `phase.current.id`, `phase.next.id`, `schedule.distance.toBoundary.coupEntry.cards`, and at least one alternative unit (e.g., `.actions`).
- Run scoring on the WASM path and TS path; assert byte-identical scoring rows for all 15 baseline seeds (matching the existing harness pattern).
- Cover both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths (per Spec 169 §7 Phase 4 acceptance).

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify) — opcode slots, feature constants, Rust handlers, ABI version bump.
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify if needed) — verify the new refs work through preview-drive read paths; modify only if the snapshot encoding requires extension.
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify) — opcode mapping, `encodeBytecodeInput` extension.
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify) — new fixture profile, equivalence assertions for both batch routes.

## Out of Scope

- New ref kinds beyond `phaseIntrinsic` + `scheduleDistance` (003/004 already shipped the TS surface).
- FITL data authoring — 006 ticket.
- Performance regression beyond the encode-cost budget (<5ms additional). If `encodeBytecodeInput` regresses materially, a follow-up perf ticket may be required.
- WASM kernel forward-model primitives (`enumerateLegalActions`, `applyAction`) — out of Spec 169 scope per §13.

## Acceptance Criteria

### Tests That Must Pass

1. `policy-bytecode-equivalence.test.ts` — new fixture profile produces byte-identical scoring rows on WASM and TS paths across all 15 baseline seeds.
2. Equivalence holds across both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths — separate test rows assert each.
3. Existing equivalence test rows continue to pass — no regression in pre-spec-169 ref-kind equivalence.
4. ABI version bump is observable: `ludoforge_policy_vm_abi_version()` returns the new version, and the TS-side ABI check accepts it.
5. Existing suite: `pnpm -F @ludoforge/engine test:integration` and `pnpm -F @ludoforge/engine test:unit` pass — no regression.

### Invariants

1. For every fixture state + consideration referencing `phase.*` or `schedule.*`, WASM scoring == TS scoring (byte-identical trace rows).
2. `wasmScoreRowRouteCount + wasmPreviewCandidateFeatureRowRouteCount > 0` for the new fixture; `unsupported` counts remain at 0 (parity with Spec 167's verified production state).
3. Encoder cost regression is bounded: new ref encoding adds <5ms to `encodeBytecodeInput` per the baseline probe.
4. ABI version is bumped exactly once in this ticket; downstream tickets that don't change the ABI must not modify the version.

## Test Plan

### New/Modified Tests

1. `policy-bytecode-equivalence.test.ts` (modify) — add fixture profile + equivalence rows. Existing classification annotation preserved.
2. Optional: a focused unit test `phase-schedule-wasm-encode.test.ts` (new) covering encoder edge cases (multiple boundaries on same deck, interrupt-state phase, hidden-deck deck). `@test-class: architectural-invariant`. Decide during implementation whether it adds coverage beyond what the equivalence test provides.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build` (or equivalent Rust build command) — confirms WASM compiles with new opcodes.
2. `pnpm -F @ludoforge/engine test:integration -- --test-name-pattern policy-bytecode-equivalence` — runs equivalence test.
3. `pnpm turbo test --filter=@ludoforge/engine` — full engine gate.
4. `pnpm turbo typecheck` — typecheck.
5. `pnpm turbo build` — confirms cross-package build cleanliness.
