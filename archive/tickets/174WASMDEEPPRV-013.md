# 174WASMDEEPPRV-013: Phase 3b prerequisite - chooseNStep continuation state-patch ABI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes - generic chooseNStep continuation compiler/materialization ABI, TypeScript host bridge, Rust preview-drive mirror
**Deps**: `archive/tickets/174WASMDEEPPRV-012.md`

## Problem

`tickets/174WASMDEEPPRV-011.md` cannot truthfully wire `runDeepPass` to consume WASM-produced projected state yet. The archived 012 substrate landed a generic state-patch/materialization ABI for the existing production preview-drive compiler, but that compiler is still rooted in root action `Move` / action-pipeline programs. `runDeepPass` operates on already-published `chooseNStep` microturn continuations and currently derives its projected states by calling `continueChooseNStepInnerPreviewDrive`.

Using TypeScript to apply the deep `chooseNStep` continuation and then counting a WASM row would make host-produced state look like accelerated-route activation. This violates Foundations #5, #9, #16, and #20.

This ticket lands the missing prerequisite: a generic WASM/host representation for `chooseNStep` continuation materialization so ticket 011 can consume the WASM-produced projected `GameState` without TypeScript being the hidden state producer.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-012.md` added ABI version 16, state-patch op encoding, TypeScript host materialization, and action-pipeline-rooted state-patch proof.
2. Live `compileProductionPreviewDrive` still selects one shared action program from candidate `actionId` / `move.actionId`; it does not compile a published `chooseNStep` continuation decision.
3. Live `runDeepPass` still calls `continueChooseNStepInnerPreviewDrive`, which publishes the next microturn, picks the next inner decision, and applies `chooseNStep` decisions in TypeScript.
4. `tickets/174WASMDEEPPRV-011.md` was reassessed on 2026-05-16 and blocked because 012 is not sufficient to prove that WASM produced the deep projected state consumed by `runDeepPass`.

## Architecture Check

1. Foundation #5: continuation materialization must remain part of the one rules protocol; the WASM route must represent the same published `chooseNStep` decision semantics as the TypeScript reference.
2. Foundations #9 and #16: activation can be counted only when the route produces the projected state consumed by the public deep-preview result, with a byte-equivalent TypeScript oracle.
3. Foundation #20: preview status, no-signal, unavailable, fallback, and depth-cap provenance must remain explicit when a continuation is unsupported or when no usable deep signal is produced.
4. Foundation #1: the ABI must stay game-agnostic. It may encode generic published microturn/decision/state-patch data; it must not inspect FITL identifiers, authored profile names, or game-specific rule concepts.

## What to Change

### 1. chooseNStep continuation compiler boundary

Add a generic host-side lowering path that can encode a supported `chooseNStep` continuation from the published microturn and candidate decision into preview-drive ABI input.

The boundary must include:
- decision key/context identity required to validate the continuation;
- selected/add/confirm command classification;
- candidate stable keys and ordering;
- bounded depth/cap metadata;
- completion/fallback provenance needed for the public `PolicyPreviewDriveTrace`.

Unsupported continuation shapes must fail closed with stable owner/reason strings.

### 2. WASM state-patch production for continuations

Extend the preview-drive ABI/Rust mirror only as needed for `chooseNStep` continuation state-patch production. The output must be materializable by the existing TypeScript state-patch host decoder or by a narrowly extended generic decoder.

Supported rows must include the state patch that reconstructs the projected `GameState` consumed by `runDeepPass`; unsupported rows must not increment supported activation.

### 3. Source-size gate resolution

Resolve the inherited source-size gate before this prerequisite completes. The previous substrate left the canonical TypeScript/Rust preview-drive hubs over the repo's 800-line guidance; this continuation ABI work touches the same hubs and must either:
- extract a narrow helper/module that reduces or stops active growth in the oversized hubs, or
- use a user-approved 1-3-1 deferral recorded in this ticket and in `tickets/174WASMDEEPPRV-011.md` before terminal closeout.

### 4. Focused prerequisite tests

Add focused tests proving:
- supported `chooseNStep` continuation rows return a WASM-produced state patch;
- unsupported continuation classes fail closed with explicit owner/reason provenance;
- materialized projected states are byte-equivalent to the TypeScript `continueChooseNStepInnerPreviewDrive` reference through `serializeGameState`;
- activation counters remain zero for unsupported continuation classes.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only if a small probe/wiring helper is required; production consumption remains ticket 011)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify or extract shared continuation helpers as needed)
- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify or extract ABI helper)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify if FFI call shape or counters change)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify or split continuation lowering from action-pipeline lowering)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify or split ABI helper)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if ABI export shape/version changes)
- `packages/engine/test/unit/agents/` (new/modified ABI/unsupported tests)
- `packages/engine/test/integration/` (new/modified continuation projected-state parity tests)

## Out of Scope

- No production `runDeepPass` activation/consumption flip; ticket 011 owns consuming this prerequisite.
- No Phase 4 measurement or default flip; tickets 009 and 010 remain gated on 011.
- No FITL-specific code.
- No policy-profile retuning or GameSpecDoc changes.

## Acceptance Criteria

### Tests That Must Pass

1. New `chooseNStep` continuation ABI/materialization tests pass.
2. Unsupported continuation classes fail closed with stable provenance and do not increment supported activation.
3. TypeScript and WASM materialized continuation projected states are byte-equivalent through `serializeGameState`.
4. Existing state-patch materialization test from ticket 012 remains green.
5. Engine suite green: `pnpm turbo build && pnpm turbo test`.
6. Determinism gates green (same list as ticket 002).

### Invariants

1. No supported activation is counted unless WASM produced the projected state consumed by the continuation materialization witness.
2. The continuation ABI is generic and bounded; it contains no game-specific identifiers beyond normal serialized `GameDef`/microturn/action/decision ids.
3. Unsupported, hidden, stochastic, failed, depth-capped, and no-signal classes remain explicit and cannot silently contribute scalar preview values.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/` continuation ABI/fail-closed tests - prove malformed and unsupported continuation surfaces are rejected deterministically.
2. `packages/engine/test/integration/` continuation projected-state parity test - compares WASM-materialized projected states with `continueChooseNStepInnerPreviewDrive` through `serializeGameState`.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`
2. `pnpm -F @ludoforge/engine build && node --test <compiled continuation projected-state parity test>`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm run check:ticket-deps`

## Outcome

Implementation completed on 2026-05-16.

Landed scope:
- Added a generic host-side `chooseNStep` continuation lowering helper that validates the published continuation identity, classifies the continuation command, emits stable candidate keys, and returns explicit unsupported owner/reason provenance for deferred terminal/confirm continuations.
- Extended the preview-drive state-patch ABI with an `applyChooseNStepDecision` op. The Rust preview-drive mirror validates the new op shape, the TypeScript ABI decoder verifies the WASM-returned op words, and the host materializer applies the returned generic continuation op through the public microturn decision protocol.
- Added focused tests proving supported add-continuation rows return a WASM state patch, unsupported confirm continuations fail closed without incrementing supported activation, and the materialized projected state is byte-equivalent to the `applyPublishedDecision` TypeScript oracle through `serializeGameState`.
- Kept production `runDeepPass` consumption out of scope; `tickets/174WASMDEEPPRV-011.md` remains the owner for consuming this prerequisite and counting deep supported activation after this ticket closes.

Post-review correction (2026-05-16):
- Tightened the host-side continuation lowerer so add/remove continuations are marked supported only when the exact decision is present in the published microturn legal action list. Malformed add/remove inputs now fail closed with stable provenance instead of advancing the context first and relying on later materialization failure.
- Added a focused ABI regression for unpublished add continuations.

Unsupported/fail-closed scope:
- Supported in this prerequisite: nonterminal `chooseNStep` add/remove continuation state-patch rows whose published microturn identity matches the source state.
- Deferred to `tickets/174WASMDEEPPRV-011.md`: production deep dispatch, terminal/confirm continuation consumption, Phase 4 measurement/default flip, and any broader unsupported classes found during production consumption.

ABI identity:
- `POLICY_WASM_ABI_VERSION` / Rust `ABI_VERSION` remains `16`.
- State-patch op word width remains 5 i32 words.
- New state-patch op code: `8` = `applyChooseNStepDecision`, encoded as `[op, frameId, decisionKeyCode, commandCode, valueCode]`.

Generated/schema fallout:
- Rust WASM target rebuilt under ignored `packages/engine-wasm/policy-vm/target/`.
- No schema, golden, GameSpecDoc, or checked-in generated JSON artifact changed.

Source-size ledger:
- `packages/engine/src/agents/policy-wasm-preview-drive.ts | before 936 | after 735 | crossed cap? no, extracted below cap | active growth none after extraction; state-patch codec and preview-state slot codec moved to adjacent modules | extraction/defer rationale: resolved active ABI hub growth while preserving the public ABI barrel | successor if any: none`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs | before 883 | after 733 | crossed cap? no, extracted below cap | active growth none after extraction; code/status and state-patch validation moved to adjacent modules | extraction/defer rationale: resolved active Rust preview-drive ABI hub growth without changing FFI exports | successor if any: none`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts | before 881 | after 881 | crossed cap? no, preexisting oversize with no active growth in this ticket | active growth none | extraction/defer rationale: verified-no-edit; this prerequisite used a separate continuation lowering helper instead of growing the action-pipeline compiler hub | successor if any: tickets/174WASMDEEPPRV-011.md for production consumption`
- `packages/engine/src/agents/policy-wasm-runtime.ts | before 1424 | after 1424 | crossed cap? no, preexisting oversize with no active growth in this ticket | active growth none | extraction/defer rationale: verified-no-edit; no FFI call-shape or counter change required | successor if any: none`
- `packages/engine-wasm/policy-vm/src/lib.rs | before 1307 | after 1307 | crossed cap? no, preexisting oversize with no active growth in this ticket | active growth none | extraction/defer rationale: verified-no-edit; ABI version/export shape unchanged | successor if any: none`

Command ledger:
- Test Plan | `pnpm -F @ludoforge/engine-wasm build` | ran directly | passed
- Test Plan | `pnpm -F @ludoforge/engine build && node --test <compiled continuation projected-state parity test>` | split into package build plus focused compiled Node test | passed; focused command covered the continuation ABI, continuation materialization, and inherited 012 state-patch materialization tests
- Test Plan | `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` | split into four serial turbo lanes | passed
- Test Plan | `pnpm run check:ticket-deps` | run after terminal status/dependency edits | passed

Verification:
- `pnpm -F @ludoforge/engine-wasm build` - passed.
- `pnpm -F @ludoforge/engine build` - passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-preview-choosenstep-continuation-abi.test.js dist/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.js dist/test/integration/policy-wasm-preview-drive-state-patch-materialization.test.js` - passed after post-review cleanup; 5 tests, 3 suites, 0 failures.
- `pnpm turbo build` - passed after post-review cleanup; 3 successful, 1 cached. Advisory emissions only: Vite reported the existing runner large-chunk warning.
- `pnpm turbo test` - passed after post-review cleanup; 5 successful, 3 cached; engine default lane reported 85/85 files passed. Advisory emissions only: runner tests replayed existing jsdom canvas/crash-recovery stderr while passing.
- `pnpm turbo lint` - passed; 2 successful, 1 cached.
- `pnpm turbo typecheck` - passed; 3 successful, 1 cached.
- `pnpm run check:ticket-deps` - passed; ticket dependency integrity check passed for active and archived tickets.

Late-edit proof validity: post-review changed source/test behavior at the continuation lowerer boundary, so the focused ABI/materialization proof and broad build/test/lint/typecheck lanes were rerun. The subsequent outcome edit records those just-run proof results and does not change source, test, schema, WASM ABI, runtime behavior, scope, command semantics, or dependency ownership.

Archive status: completed and ready for archival.
