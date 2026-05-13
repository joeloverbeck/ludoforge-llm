# 169PHASCHREF-005: Phase 4 — WASM opcode integration for phase.* and schedule.* refs

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — Rust WASM policy VM, TS opcode mapping, equivalence test fixture
**Deps**: `archive/tickets/169PHASCHREF-004.md`, `archive/tickets/169PHASCHREF-007.md`

## Problem

Phases 1-3b (tickets 002-004 and 007) ship `phase.*` and the currently implemented `schedule.*` ref surfaces on the TypeScript resolver path only: `schedule.nextBoundary.id`, `schedule.distance.toBoundary.<BoundaryId>.cards`, compile-time `.toPhase.<PhaseId>.cards` aliases, and declared-rate non-card `cardDraw` units. The production preview-drive batch in `policy-eval.ts` routes through WASM (Spec 167 made WASM the default scoring path; `wasmScoreRowRouteCount` is non-trivial in production traces). Until the new ref kinds have opcode slots in `packages/engine-wasm/policy-vm/src/lib.rs` and Rust resolver handlers, agents using these refs would either (a) silently fall back to the TS interpreter — defeating Spec 167's perf work — or (b) emit `unsupported` route counts that pollute trace diagnostics.

Non-card schedule units (`.microturns`, `.actions`, `.turns`, `.rounds`) moved to `archive/tickets/169PHASCHREF-007.md` after live reassessment showed their required kernel counters/rates were not present in Phase 3a. That ticket has now selected and shipped the declared `unitRates` model on the TypeScript/compiler path, so this WASM parity ticket owns opcode/encoding support for every schedule unit that exists when this ticket starts: `.cards` plus declared-rate non-card units.

This ticket adds:

- Opcode slots + feature constants in `lib.rs` ABI for the two new ref kinds (`phaseIntrinsic` + `scheduleDistance`).
- Rust handlers that resolve refs from the encoded input rows (the WASM equivalents of 002/003/004's TS resolver paths).
- `REF_KIND_TO_OPCODE` (or its current canonical mapping name) extension in `policy-wasm-runtime.ts`.
- Encoding and Rust resolver parity for `cardDraw.schedule.unitRates` declared-rate non-card units when the boundary declares the requested rate.
- ABI version bump per the project's ABI versioning discipline.
- Extension of `policy-bytecode-equivalence.test.ts` to cover the new refs across both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths.

## Assumption Reassessment (2026-05-13)

1. **WASM is the default scoring path post-167**: confirmed via `archive/specs/167-arvn-evolution-harness-performance.md` (Phase 0 — `initializePolicyWasmRuntimeSync()` called at tournament startup). WASM is loaded for production runs.
2. **`policy-bytecode-equivalence.test.ts` is the canonical equivalence harness**: confirmed at `packages/engine/test/integration/policy-bytecode-equivalence.test.ts:15,470,533,602` (referenced in Spec 167 §2.2). It tests WASM-vs-TS scoring identity over fixture profiles.
3. **`lib.rs` has existing opcode/feature constant patterns**: confirmed (lib.rs lines 32-78 per the Explore agent's verification during spec authoring) — OP_LOAD_FEATURE, OP_RESOLVE_REF, FEATURE_CANDIDATE_PARAM, FEATURE_CANDIDATE_TAG, etc. New constants follow the same shape.
4. **`preview_drive.rs` exists and is 379 lines**: confirmed via grep. The preview-drive path may need similar ref-resolution updates if the new refs are read inside preview frames — but per Spec 169 §3 Non-goals, `phase.*` and implemented `schedule.*` refs are NOT preview-derived. The preview-drive read path uses the same state snapshot mechanism; confirm during implementation that snapshot reads work through the same opcodes.
5. **ABI versioning convention**: lib.rs exports `ludoforge_policy_vm_abi_version()` (line 107 area per Spec 167's reference). Adding opcodes bumps the version.

## Architecture Check

1. **Foundation #5 (One protocol)**: WASM resolver semantics MUST equal TS resolver semantics for every new ref. The equivalence test enforces this — if WASM diverges, the test fails.
2. **Foundation #8 (Determinism)**: WASM resolution is deterministic; no FFI nondeterminism, no thread-local state in handlers.
3. **Foundation #10 (Bounded)**: opcode dispatch is O(1) per ref; resolution itself remains O(1) per the underlying schedule index (003) or phase-sequence lookup (002).
4. **No backwards compatibility**: ABI version bump is the canonical signal. Existing fixtures and profile bytecode are recompiled at load time; no shim layer.
5. **Trace-route parity**: WASM-routed refs must emit the same scoring, route metadata, unavailable/fallback behavior, and `scheduleFallbackFired` candidate metadata as the TypeScript path. 003 corrected the live trace contract: the current policy metadata surface does not expose a generic ready-state `inputRefs[]` row for these refs.

## What to Change

### 1. Opcode + feature constants in `lib.rs`

In `packages/engine-wasm/policy-vm/src/lib.rs`:

- Add `FEATURE_PHASE_INTRINSIC = <next-slot>` and `FEATURE_SCHEDULE_DISTANCE = <next-slot>` to the feature constant block (lines ~63-78).
- Add opcode constants if needed (`OP_RESOLVE_PHASE_INTRINSIC`, `OP_RESOLVE_SCHEDULE_DISTANCE`) — or extend the existing `OP_RESOLVE_REF` dispatcher to handle the new feature ids. Pick the path that aligns with how `candidateParam` was added in Spec 166.
- Bump `ludoforge_policy_vm_abi_version()` return value.

### 2. Rust resolver handlers

Add `resolve_phase_intrinsic` and `resolve_schedule_distance` functions in `lib.rs` (or split into `phase_refs.rs` if the file size warrants extraction):

- `resolve_phase_intrinsic`: dispatches on the intrinsic name (`current.id`, `next.id`, `nextBoundary.id`); reads from the encoded input row's phase fields (which the TS encoder populates per the new feature ids).
- `resolve_schedule_distance`: dispatches on target kind + unit for the implemented surfaces (`nextBoundary`, concrete `boundary` + `cards`, and declared-rate non-card units); reads from encoded schedule-index data and `unitRates` metadata passed through the input row. The schedule index itself is computed TS-side per 003 (the kernel runtime owns it); WASM reads the encoded snapshot.

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

- Add a new fixture profile exercising `phase.current.id`, `phase.next.id`, `schedule.nextBoundary.id`, `schedule.distance.toBoundary.coupEntry.cards`, and at least one declared-rate non-card unit such as `schedule.distance.toBoundary.coupEntry.turns`. `.toPhase` is compile-time rewritten by 004, so include an authored `.toPhase.scoring.cards` case if the equivalence fixture starts from authored profile YAML rather than precompiled ref AST.
- Run scoring on the WASM path and TS path; assert byte-identical scoring rows for all 15 baseline seeds (matching the existing harness pattern).
- Cover both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths (per Spec 169 §7 Phase 4 acceptance).

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify) — opcode slots, feature constants, Rust handlers, ABI version bump.
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify if needed) — verify the new refs work through preview-drive read paths; modify only if the snapshot encoding requires extension.
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify) — opcode mapping, `encodeBytecodeInput` extension.
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify) — new fixture profile, equivalence assertions for both batch routes.

## Out of Scope

- New ref kinds beyond `phaseIntrinsic` + `scheduleDistance` (003/004 already shipped the TS surface for card-distance and aliases).
- Live-counter schedule semantics and schedule kinds beyond `cardDraw.schedule.unitRates` — `archive/tickets/169PHASCHREF-007.md` only shipped exact declared rates for `cardDraw`, not action/microturn/round counters or new schedule kinds.
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

1. For every fixture state + consideration referencing `phase.*` or `schedule.*`, WASM scoring == TS scoring, including route counts, fallback metadata such as `scheduleFallbackFired`, and declared-rate non-card schedule distance units.
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

## Outcome

Completion date: 2026-05-13

What landed:

- Added first-class bytecode feature kinds for `phaseIntrinsic` and `scheduleDistance`.
- Bumped the policy WASM ABI from 9 to 10 in the Rust score-row VM, Rust preview-drive VM, and TypeScript host check.
- Added Rust VM handling for encoded phase/schedule feature rows.
- Added TypeScript WASM input materialization for ready/unavailable phase and schedule refs, including declared-rate non-card schedule units through the run-local schedule index.
- Passed the run-local `GameDefRuntime` into WASM score-row and preview-candidate-feature-row routes so schedule distance reads observe the same authoritative schedule index as the TypeScript resolver.
- Updated the TypeScript bytecode fallback completeness guard so the new first-class feature kinds cannot silently fall through.
- Extended `policy-bytecode-equivalence.test.ts` with phase/schedule fixtures proving both `evaluateWasmMoveConsiderationScoreRows` and `evaluateWasmCandidateFeatureRow` match TypeScript evaluation.
- Kept production score-row routing active when a preview candidate-feature row cannot be WASM-materialized directly by precomputing that row through the existing TypeScript evaluator and still routing the final score rows through WASM.
- Post-review correction: preserved `scheduleFallbackFired` metadata on WASM score rows when a schedule value is unavailable, and propagated that metadata back through the production WASM score-routing path.

Touched-file scope:

- Planned and touched: `packages/engine-wasm/policy-vm/src/lib.rs`, `packages/engine-wasm/policy-vm/src/preview_drive.rs`, `packages/engine/src/agents/policy-wasm-runtime.ts`, `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`.
- Owned implementation fallout: `packages/engine/src/cnl/policy-bytecode/types.ts`, `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, `packages/engine/src/agents/policy-wasm-score-routing.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts`.
- Owned test fallout: `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts`, `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts`.
- Optional focused encode test not added: the integration equivalence fixture now covers score-row and preview-candidate-feature-row materialization, while the fallback completeness guard covers feature-kind registration.

Generated/schema fallout:

- No JSON schema or golden artifact change expected. The regenerated Rust WASM binary is under `packages/engine-wasm/policy-vm/target/` and remains ignored build output.

Deferred sibling/spec scope:

- `tickets/169PHASCHREF-006.md` remains the owner for FITL `phaseBoundaries`, coup-card tags, sandbox profile authoring, and FITL golden traces.
- Schedule kinds beyond already-implemented `cardDraw` declared-rate units remain out of scope.

Invariant proof matrix:

| Invariant | Witness/assertion | Status | Proof lane |
|---|---|---|---|
| WASM scoring equals TypeScript for `phase.*` and `schedule.*` refs. | New score-row equivalence fixture compares `evaluateWasmMoveConsiderationScoreRows` to `PolicyEvaluationContext`. | proven | `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` |
| WASM preview-candidate-feature-row route supports the same refs. | New fixture compares `evaluateWasmCandidateFeatureRow` to TypeScript evaluation. | proven | same focused equivalence lane |
| Unsupported route counts stay at 0 for the new fixture. | New fixture requires non-null/supported WASM rows for both routes. | proven | same focused equivalence lane |
| ABI version is bumped exactly once and accepted by TS host checks. | Rust and TS ABI constants are both `10`; WASM loader-based equivalence and ARVN production WASM tests pass. | proven | `pnpm -F @ludoforge/engine-wasm build`; focused equivalence lane; ARVN WASM equivalence lane |
| Declared-rate non-card units use the same card-distance source. | New fixture reads `schedule.distance.toBoundary.coupEntry.turns/actions` through WASM with a run-local schedule runtime. | proven | same focused equivalence lane |

Command ledger:

| Ticket section | Literal command/shorthand | Final citation |
|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | passed |
| Format | `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` | passed |
| Test Plan | `pnpm -F @ludoforge/engine-wasm build` | passed |
| Test Plan | `pnpm -F @ludoforge/engine test:integration -- --test-name-pattern policy-bytecode-equivalence` | repo-valid substitution: direct compiled `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`; passed, 8 tests |
| Acceptance | `policy-bytecode-equivalence.test.ts` new fixture | passed in focused lane and full integration lane |
| Acceptance | both `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths | passed in focused lane |
| Acceptance | existing equivalence rows continue to pass | passed in focused lane |
| Acceptance | ABI version bump observable | passed via WASM build, focused equivalence, and `arvn-tournament-wasm-equivalence.test.js` |
| Regression | `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` | passed |
| Acceptance | `pnpm -F @ludoforge/engine test:integration` | passed, 281/281 files |
| Acceptance | `pnpm -F @ludoforge/engine test:unit` | passed, 5713 tests |
| Test Plan | `pnpm turbo test --filter=@ludoforge/engine` | passed, 69/69 files |
| Test Plan | `pnpm turbo typecheck` | passed |
| Test Plan | `pnpm turbo build` | passed |
| Integrity | `pnpm run check:ticket-deps` | passed, 2 active tickets and 2327 archived tickets |

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine-wasm/policy-vm/src/lib.rs` | 1298 | 1307 | No; preexisting oversized | +9 | ABI feature constants and encoded-value dispatch belong in the canonical Rust ABI hub; extracting the two-line dispatch would obscure the opcode table more than it would reduce risk. | None |
| `packages/engine-wasm/policy-vm/src/preview_drive.rs` | 379 | 379 | No | 0 | Preview-drive shares the ABI version gate; the one-line version bump is required to keep the production preview-drive route compatible after this ticket's ABI change. | None |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2009 | 2042 | No; preexisting oversized | +33 | The TypeScript bytecode fallback resolver is already the canonical interpreter fallback hub; the new phase/schedule feature cases sit with the existing feature-ref fallback dispatch. | None |
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1096 | 1153 | No; preexisting oversized | +57 | The substantial phase/schedule materialization logic was extracted to `policy-wasm-phase-schedule-encoding.ts`; remaining growth is ABI constant wiring, context threading, score-row fallback handling, and post-review fallback metadata propagation in the canonical host runtime. | None |
| `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts` | 0 | 147 | No | +147 | New narrow helper isolates phase/schedule WASM value materialization from the already-oversized host runtime. | None |
| `packages/engine/src/agents/policy-wasm-score-routing.ts` | 545 | 567 | No | +22 | The small routing fallback keeps production score-row WASM active when only preview candidate-row materialization is unsupported; post-review metadata propagation belongs beside candidate score assignment. Extracting this branch would make the route control flow harder to audit. | None |
| `packages/engine/src/cnl/policy-bytecode/feature-table.ts` | 554 | 592 | No | +38 | Encoding constants and first-class feature-ref lowering belong beside the existing feature table encoder; still below 600 lines after the change. | None |
| `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` | 675 | 828 | No; crossed typical band only, not cap | +153 | Kept route assertions and the post-review fallback metadata regression in the canonical equivalence harness; fixture construction stays extracted to an adjacent helper. | None |
| `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` | 0 | 71 | No | +71 | New narrow test fixture helper keeps the canonical equivalence harness below the repo cap. | None |

Final proof summary:

- Post-review red witness: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` failed on missing `scheduleFallbackFired` metadata for an unavailable schedule ref before the review fix.
- Post-review focused proof passed after the fix: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` (9 tests).
- Post-review affected original lanes passed after the fix: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js`.
- Focused bytecode fallback completeness passed: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js`.
- Focused phase/schedule WASM equivalence passed twice after the final build state: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`.
- ARVN production WASM equivalence passed after the ABI preview-drive correction: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js`.
- Broad engine integration passed: `pnpm -F @ludoforge/engine test:integration` (281/281 files).
- Broad engine unit passed: `pnpm -F @ludoforge/engine test:unit` (5713 tests).
- Repo gates passed: `pnpm turbo typecheck`, `pnpm turbo build`, `pnpm turbo test --filter=@ludoforge/engine`.
