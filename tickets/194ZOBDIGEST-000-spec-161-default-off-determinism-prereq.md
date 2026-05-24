# 194ZOBDIGEST-000: Prerequisite — restore Spec 161 default-off determinism proof

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — narrow determinism proof repair under `packages/engine/test/determinism/` and only the production source needed if diagnosis proves a real default-off behavior drift
**Deps**: `specs/194-zobrist-decision-stack-digest-optimization.md`, `archive/tickets/161CHOOSNINNPREV-009.md`

## Problem

Spec 194 Phase 1 is observation-only and has zero engine source/test drift, but its terminal acceptance requires the existing replay-identity corpus to be 100% green. The live determinism lane currently fails in the archived Spec 161 default-off invariant:

`node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js`

The focused rerun on 2026-05-24 reproduced two failing subtests. The current actual trace differs from the committed default-off snapshot by at least:

- `serializedFinalState.stateHash`: actual `0x2fb6f5427d98e3cc`, expected `0xa1ef2aba789f84f`.
- `DecisionStackFrame.context.targetKinds`: actual includes `targetKinds: []`, expected omits the field.
- `previewUsage.outcomeBreakdown`: actual includes newer keys `unknownPostGrantCap`, `unknownFreeOperationCap`, and `unknownGrantFlowPartial`, expected omits them.

Per `docs/FOUNDATIONS.md` #8 and #16 plus the Appendix, failures in `packages/engine/test/determinism/` are engine bugs and block CI. This prerequisite restores the replay proof lane before `194ZOBDIGEST-001` can close.

## Assumption Reassessment (2026-05-24)

1. The failure reproduces in the focused compiled test from `packages/engine`: `node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js`.
2. The failure is outside the Zobrist ticket's owned implementation surface: `git diff packages/engine/src/ packages/engine/test/` is empty after the Zobrist capture/report work.
3. The archived owner is `archive/tickets/161CHOOSNINNPREV-009.md`, which added the default-off invariant test and snapshot for `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts`.
4. This is not a profile-quality witness. It lives in `packages/engine/test/determinism/`, so Foundations classifies it as a blocking engine determinism proof.
5. Do not update the snapshot merely to preserve current output. First diagnose whether the new serialized fields are legitimate repo-wide canonical-state evolution or a real default-off behavior leak; only then choose production fix vs snapshot migration.

## Architecture Check

1. F#8 and F#16 control this prerequisite: runtime determinism must be proven by replay tests, and failing determinism tests block terminal proof for dependent tickets.
2. The repair must preserve the Spec 161 default-off contract: disabling or omitting `preview.inner.chooseNStep` must not introduce chooseNStep-specific preview behavior.
3. If the actual output is legitimate canonical trace evolution from later generic engine work, migrate the owned snapshot/test atomically and document the new identity; do not add compatibility shims or special-case the Spec 161 fixture.
4. If the actual output exposes a behavior bug, fix the generic engine source with TDD and keep the existing invariant meaningful.

## What to Change

### 1. Diagnose the default-off mismatch

Compare the failing actual trace against `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` and identify the source of the added `targetKinds`, added `outcomeBreakdown` keys, and state-hash change.

### 2. Restore the determinism invariant

Choose the narrow repair based on diagnosis:

- If the drift is a real default-off behavior leak, fix the generic source path so the default-off chooseNStep trace returns to the committed invariant.
- If the drift is legitimate canonical trace evolution from later generic engine contracts, migrate the snapshot/test with an explicit rationale and ensure both explicit-disabled and omitted-flag cases remain byte-identical to the intended default-off baseline at the current kernel version.

### 3. Re-open Spec 194 proof lanes

After the focused Spec 161 test is green, rerun the determinism lane and then return to `194ZOBDIGEST-001` so its replay proof can be cited truthfully.

## Files to Touch

- `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` (possible modify)
- `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` (possible modify only if diagnosis proves legitimate canonical trace evolution)
- `packages/engine/src/` (possible narrow modify only if diagnosis proves a production default-off behavior bug)
- `tickets/194ZOBDIGEST-001.md` (modify after prerequisite completion only if closeout proof text needs refresh)

## Out of Scope

- Zobrist capture/report implementation.
- Any change to `packages/engine/src/kernel/zobrist.ts`.
- Re-blessing the snapshot without diagnosis.
- Softening or skipping the determinism lane.
- Policy-profile-quality witness changes.

## Acceptance Criteria

### Tests That Must Pass

1. Focused current red test: `node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` — 100% green.
2. Existing replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green.
3. Existing engine suite: `pnpm -F @ludoforge/engine run test` — 100% green, or any remaining red lane is separately reproduced and resolved before returning to `194ZOBDIGEST-001`.

### Invariants

1. The Spec 161 default-off invariant remains an architectural-invariant replay proof, not a profile-quality or golden-convergence witness.
2. No compatibility shims, legacy branches, or fixture-specific production paths are introduced.
3. Any snapshot migration records why the new output is the current canonical artifact identity rather than a bug.

## Test Plan

### New/Modified Tests

1. No new test is required initially; the existing failing determinism test is the TDD red witness.
2. Add or narrow assertions only if diagnosis shows the existing byte-equality failure hides multiple separable contracts that need clearer proof.

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` from `packages/engine`
3. `pnpm -F @ludoforge/engine run test:determinism`
4. `pnpm -F @ludoforge/engine run test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`
