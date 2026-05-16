# 174WASMDEEPPRV-001: Phase 0 — Inventory unsupported preview-drive classes and wire production preview-drive counters

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-runtime.ts` (new counters)
**Deps**: `archive/specs/174-wasm-preview-drive-coverage-extension.md`

## Problem

Spec 173 closed out with the slowest seed (1005) at 75,311 ms — well above the <=60 s soft target. The next-owner architectural follow-up routes the production deep preview-drive path through WASM where supported, but the current WASM path fails closed for `continuedDeepening` / `deep1024` configurations and offers no telemetry distinguishing route activation from fallback. Without a precise inventory and dedicated counters, Phase 1 ABI extension (tickets 002–006) cannot target the right unsupported classes, and Phase 3 activation (ticket 008) cannot prove the route is live versus silently fallen back to TS.

## Assumption Reassessment (2026-05-15)

1. Confirmed `policy-wasm-score-routing.ts:246` calls `evaluateProductionPreviewDriveBatchWithWasm` and returns a `{ kind: 'supported' } | { kind: 'unsupported'; reason; unsupportedDriveClass; unsupportedOwner? }` union.
2. Confirmed the deep-phase dispatch in `policy-preview-inner-deepening.ts:165` (`runDeepPass`) does not route through WASM today; it calls `continueChooseNStepInnerPreviewDrive` per option at line 191.
3. Confirmed existing counter pattern in `policy-wasm-runtime.ts:209-1291` (`recordProductionPolicyWasmScoreRows`, `recordProductionPolicyWasmPreviewCandidateFeatureRows`) — new preview-drive counters will mirror this shape exactly.
4. Confirmed the post-008 witness exists at `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`.

## Architecture Check

1. Inventory-and-counters scaffolding before ABI work avoids guessing which classes Phase 1 must extend; activation telemetry (Phase 3) requires dedicated counters to distinguish route-active from fallback-on-unsupported.
2. Engine-agnostic (F#1): counter names and unsupported-class strings are generic; no FITL identifiers, factions, cards, or authored profile names enter source code.
3. No backwards-compatibility shims (F#14): counters follow the existing `recordProductionPolicyWasm*` pattern exactly; no aliasing.

## What to Change

### 1. Inventory unsupported classes (broad-phase vs deep-phase)

Read the post-008 witness and the routing logic, then write `reports/174-phase-0-unsupported-class-inventory.md` containing:
- Table of every fail-closed reason string emitted by `policy-wasm-score-routing.ts` (around lines 197–322) and `policy-wasm-production-preview-drive.ts:72+` (`evaluateProductionPreviewDriveBatchWithWasm`).
- Attribution column: broad-phase (candidate-feature-row route) vs deep-phase (inner deepening; currently does not invoke WASM at all).
- Cross-reference each unsupported class to the upcoming Phase 1 ticket that will close it: 002 signal carriers / 003 decision-stack publication / 004 preview-state slots / 005 candidate grouping / 006 completion semantics.

### 2. Wire dedicated preview-drive counters

In `packages/engine/src/agents/policy-wasm-runtime.ts`, add:
- Module-level counters: `productionPreviewDriveRouteCount`, `productionPreviewDriveUnsupportedCount` (initialised to `0`; placed alongside the existing counters at lines 209–212).
- Exported helper: `recordProductionPolicyWasmPreviewDrive(kind: 'supported' | 'unsupported'): void` (mirroring lines 1245–1257).
- Exported readers: `getProductionPolicyWasmPreviewDriveRouteCount()`, `getProductionPolicyWasmPreviewDriveUnsupportedCount()`.
- Reset hooks in the existing counter-reset function (~line 1288).

### 3. Unit tests for the new counters

`packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts`:
- `@test-class: architectural-invariant` header.
- Increment via the new helper, assert the readers return the expected values.
- Reset clears both counters.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts` (new)
- `reports/174-phase-0-unsupported-class-inventory.md` (new)

## Out of Scope

- No ABI changes — Phase 1 (tickets 002–006) owns ABI surface work.
- No route wiring — counters are added but not yet incremented by the dispatch layer; that happens in 002–006 (per-surface) and 008 (broad-phase fail-closed removal + deep-phase wire-in).
- No FITL-specific identifiers in source code or test fixtures.

## Acceptance Criteria

### Tests That Must Pass

1. New counter unit tests pass.
2. Existing engine suite green: `pnpm turbo build && pnpm turbo test --filter @ludoforge/engine`.
3. `pnpm turbo lint && pnpm turbo typecheck`.

### Invariants

1. Counter helpers follow the existing `recordProductionPolicyWasm*` pattern exactly — same signature shape, same module location, same reset behaviour.
2. New test file carries the `@test-class: architectural-invariant` marker per `.claude/rules/testing.md`.
3. Engine remains agnostic — no FITL identifiers introduced in source code or test fixtures.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts` — unit tests for the new counter helpers and reset behaviour.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-15

Implemented. Phase 0 landed the inventory report at
`reports/174-phase-0-unsupported-class-inventory.md` and the generic
preview-drive counter API in `packages/engine/src/agents/policy-wasm-runtime.ts`:

- `recordProductionPolicyWasmPreviewDrive(kind: 'supported' | 'unsupported')`
- `getProductionPolicyWasmPreviewDriveRouteCount()`
- `getProductionPolicyWasmPreviewDriveUnsupportedCount()`

The counter reset is wired through the existing production WASM counter reset
hook used by tests. Dispatch callsites are intentionally unchanged; route
activation and counter increments from broad/deep production paths remain owned
by `tickets/174WASMDEEPPRV-008.md` after the ABI and parity tickets land.

The inventory report records the current broad-phase fail-closed reasons from
`policy-wasm-score-routing.ts`, the production preview-drive compiler reason
strings from `policy-wasm-production-preview-drive.ts`, the runtime bridge
`unsupported preview-drive class <class>` fallback, and the post-008
`continuedDeepening` witness classes that make deep-phase activation material.

Generated fallout: none expected. Schema, ABI, route wiring, and production
GameSpecDoc artifacts are untouched.

Source-size ledger: `packages/engine/src/agents/policy-wasm-runtime.ts` was
pre-existing over guidance at 1309 lines. This ticket adds only same-pattern
counter fields/readers/reset wiring; extracting the existing WASM runtime counter
cluster would widen Phase 0, so extraction is deferred with no successor opened
by this inventory slice.

Verification:

- `pnpm -F @ludoforge/engine build` - passed after the initial RED missing-export test.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.js` - passed after `dist` rebuild; 2 tests passed.
- `pnpm turbo build` - passed; engine and runner built, engine-wasm replayed from cache as supplemental because no Rust/WASM artifacts changed.
- `pnpm turbo test` - passed; engine default lane reported `81/81 files passed`; runner tests passed with expected jsdom canvas/crash-recovery advisory stderr.
- `pnpm turbo lint` - passed; runner lint replayed from cache, engine lint ran.
- `pnpm turbo typecheck` - passed; engine build replayed from cache, engine and runner typechecks ran.

Late-edit proof validity: the terminal status and verification transcription above
record only the just-run proof results and do not change scope, command
semantics, touched-file ownership, dependency ownership, or acceptance criteria.
No proof rerun is required for this closeout edit.
