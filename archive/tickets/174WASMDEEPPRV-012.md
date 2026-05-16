# 174WASMDEEPPRV-012: Phase 3b prerequisite - Deep preview-drive state-patch ABI design

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes - WASM preview-drive state-patch ABI design, TypeScript host decoder, deep materialization proof
**Deps**: `tickets/174WASMDEEPPRV-008.md`

## Problem

`tickets/174WASMDEEPPRV-011.md` cannot truthfully count deep `continuedDeepening` activation until the WASM route returns the projected `GameState` consumed by `runDeepPass`. Live reassessment on 2026-05-16 found that the existing production preview-drive route is rooted in action `Move` pipelines, while `runDeepPass` operates on `chooseNStep` microturn continuations. A narrow scalar-slot route would still need TypeScript to apply the deep continuation to compute the state delta, which would make fallback success look like WASM state production and violate Foundations #5, #9, #16, and #20.

This ticket designs and lands the prerequisite generic state-patch/materialization ABI needed before `174WASMDEEPPRV-011` can wire deep-phase WASM consumption.

## Assumption Reassessment (2026-05-16)

1. `evaluateProductionPreviewDriveBatchWithWasm` returns preview-drive rows, preview-state slot values, candidate grouping, decision-stack publication, completion records, and F#20 signal carriers; it does not return a generic state patch.
2. `runDeepPass` starts from `ChooseNStepInnerPreviewResult.state` and applies additional `chooseNStep` microturn decisions through `continueChooseNStepInnerPreviewDrive`, not through the root action `Move` pipeline compiler.
3. A scalar/global-only host bridge would still rely on TypeScript to apply or inspect the continuation to derive deltas, so it is not a Foundation-aligned proof that WASM produced the consumed projected state.

## Architecture Check

1. F#5: deep continuation materialization must remain part of the kernel's one rules protocol; no client-side or profile-specific shortcut can manufacture a legal continuation.
2. F#9 and F#16: the accelerated route must produce the state actually consumed by `runDeepPass`, and tests must fail if fallback TypeScript state production is counted as activation.
3. F#20: preview status, no-signal, unavailable, and fallback provenance must survive the state-patch boundary without being coerced into scalar contributions.

## What to Change

### 1. Deep continuation state-patch ABI

Design a generic ABI payload that can represent the state mutations needed by supported deep preview continuations. The payload must be deterministic, bounded, and game-agnostic.

At minimum, classify and either encode or fail closed for:
- global variables
- per-player variables
- zone variables
- token movement and token scalar property updates
- markers/global markers
- decision-stack / microturn continuation metadata needed to publish or retire the continuation cleanly

### 2. Host materialization and fail-closed validation

Add TypeScript host decoding that reconstructs the projected `GameState` from the WASM-returned payload and canonicalizes its hash before any public preview result consumes it.

Unsupported structural classes must return stable unsupported classifications and must not increment supported activation counters.

### 3. Focused proof substrate for ticket 011

Add a focused ABI/materialization test surface that `tickets/174WASMDEEPPRV-011.md` can consume when wiring `runDeepPass`.

The proof must distinguish:
- route activation
- unsupported/fallback classification
- byte-equivalent serialized projected state compared with the TypeScript reference

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if ABI export shape changes)
- `packages/engine/test/unit/agents/` (new/modified ABI materialization and fail-closed tests)
- `packages/engine/test/integration/` (new/modified projected-state materialization parity tests)

## Out of Scope

- No `runDeepPass` production dispatch wiring; ticket 011 owns consuming the new ABI.
- No Phase 4 measurement or default flip; tickets 009 and 010 remain gated on ticket 011.
- No FITL-specific Rust, TypeScript, GameSpecDoc, or profile branches.

## Acceptance Criteria

### Tests That Must Pass

1. New ABI materialization tests prove supported state-patch payloads reconstruct canonical projected `GameState` values.
2. Unsupported structural classes fail closed with explicit reason/fallback provenance and do not increment supported activation.
3. Existing preview-drive parity oracle remains green.
4. Engine suite green: `pnpm turbo build && pnpm turbo test`.
5. Determinism gates green (same list as ticket 002).

### Invariants

1. No supported activation is counted unless WASM returned the state-patch payload used to reconstruct the consumed projected state.
2. The host decoder rejects malformed, out-of-bounds, mismatched-layout, or unsupported state-patch payloads deterministically.
3. Serialized projected state remains byte-equivalent to the TypeScript reference for the supported subset.

## Test Plan

### New/Modified Tests

1. ABI materialization unit tests - success, malformed payload, unsupported class, and hash canonicalization.
2. Integration projected-state parity tests - compare WASM-materialized projected states with TypeScript reference states through `serializeGameState`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <compiled ABI materialization test>`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-16
Outcome amended: 2026-05-16

Landed scope:
- Added preview-drive state-patch ABI version 16 across the TypeScript host and Rust guest.
- Added an opt-in `materializeStatePatch` production preview-drive request path. Existing broad production preview-drive rows remain unchanged unless the caller requests materialized projected state.
- Added WASM-returned state-patch rows for supported generic state classes: global variable values, zone variable values, token moves, numeric/boolean token scalar properties, marker state, action-usage counters, and microturn metadata needed for canonical preview-state identity.
- Added TypeScript host materialization that reconstructs a canonical `GameState`, recomputes `stateHash`/`_runningHash`, and rejects mismatched or non-materializable payloads deterministically.
- Kept production deep `runDeepPass` consumption out of scope; `tickets/174WASMDEEPPRV-011.md` remains the owner for dispatching deep `continuedDeepening` after `tickets/174WASMDEEPPRV-013.md` lands the missing generic `chooseNStep` continuation materialization prerequisite.

Unsupported/fail-closed scope:
- Per-player variable patches and broader structural classes not encoded above remain unsupported for state-patch materialization.
- Existing preview-drive unsupported/fallback reason surfaces remain explicit; production activation is still deferred through `tickets/174WASMDEEPPRV-013.md` to `tickets/174WASMDEEPPRV-011.md`.

ABI identity:
- `POLICY_WASM_ABI_VERSION` / Rust `ABI_VERSION`: `15 -> 16`.
- Preview-drive FFI call shape now includes state-patch count and op buffers after preview-state slot metadata.
- New state-patch op word width: 5 i32 words per op.

Generated/schema fallout:
- Rust WASM target rebuilt under ignored `packages/engine-wasm/policy-vm/target/`.
- No schema, golden, GameSpecDoc, or checked-in generated JSON artifact changed.

Source-size ledger:
- `packages/engine/src/agents/policy-wasm-preview-drive.ts | before 768 | after 936 | crossed cap? yes | active growth state-patch ABI codec/type extension | extraction/defer rationale: canonical preview-drive ABI hub; extracting while the ABI is still changing would widen/obscure the substrate seam | successor if any: tickets/174WASMDEEPPRV-013.md`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts | before 786 | after 881 | crossed cap? yes | active growth opt-in state-patch emission/materialization | extraction/defer rationale: canonical production preview-drive compiler hub; surgical addition keeps the state-patch provenance beside supported/fail-closed lowering | successor if any: tickets/174WASMDEEPPRV-013.md`
- `packages/engine/src/agents/policy-wasm-runtime.ts | before 1404 | after 1424 | crossed cap? no, preexisting oversize + active growth | active growth FFI pointer/length mirror | extraction/defer rationale: canonical WASM runtime FFI hub; narrow mirror update is safer than interface extraction in this ticket | successor if any: tickets/174WASMDEEPPRV-013.md`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs | before 757 | after 883 | crossed cap? yes | active growth ABI state-patch validation/output mirror | extraction/defer rationale: canonical Rust preview-drive ABI evaluator; split would obscure host/guest mirror proof | successor if any: tickets/174WASMDEEPPRV-013.md`
- `packages/engine-wasm/policy-vm/src/lib.rs | before 1307 | after 1307 | crossed cap? no active growth beyond ABI version literal | extraction/defer rationale: preexisting canonical VM export hub | successor if any: none`

Post-review correction (2026-05-16): `tickets/174WASMDEEPPRV-011.md` was initially unblocked because this prerequisite ABI landed, and it explicitly owned resolving the inherited source-size gate while wiring deep materialized-state consumption. Later live reassessment found this action-pipeline-rooted substrate is necessary but not sufficient for `runDeepPass`; `tickets/174WASMDEEPPRV-013.md` now owns the missing generic `chooseNStep` continuation materialization prerequisite and source-size gate resolution before 011 can close. No runtime code changed during review.

Verification:
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-state-patch-materialization.test.js` — passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js packages/engine/dist/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.js packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js packages/engine/dist/test/integration/policy-wasm-preview-drive-state-patch-materialization.test.js` — passed.
- `pnpm -F @ludoforge/engine test:determinism` — passed 23/23 files.
- `pnpm turbo build` — passed; runner emitted the existing Vite large-chunk advisory, and Turbo emitted a no-output warning for `@ludoforge/engine-wasm#build`; both are non-ticket-owned advisories.
- `pnpm turbo test` — passed; 5 tasks successful, engine default lane reported 84/84 files passed. Runner tests replayed/passed with known jsdom canvas and crash-recovery stderr advisories.
- `pnpm turbo lint` — passed; 2 tasks successful.
- `pnpm turbo typecheck` — passed; 3 tasks successful.

Late-edit proof validity: the terminal status and final verification transcription record the just-run proof results. Post-review edits changed only ticket/spec ownership prose and archive-path references, then reran dependency and markdown hygiene; no runtime, source, test, schema, ABI identity, or acceptance behavior changed, so no code proof rerun is required for this closeout edit.
