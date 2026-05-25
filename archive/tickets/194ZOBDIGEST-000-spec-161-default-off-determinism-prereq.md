# 194ZOBDIGEST-000: Prerequisite — restore Spec 161 default-off determinism proof

**Status**: COMPLETED
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

After the focused Spec 161 test is green and `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md` resolves the broader determinism timeout, rerun the determinism lane and then return to `194ZOBDIGEST-001` so its replay proof can be cited truthfully.

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

## Outcome

Blocked on 2026-05-24 after landing the focused Spec 161 snapshot repair.

The focused red witness was reproduced after `pnpm turbo build` with:

`node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` from `packages/engine`

Diagnosis: this was a stale snapshot caused by later generic canonical-state and preview-trace evolution, not a chooseNStep default-off behavior leak. Spec 191 added `targetKinds` to published choice contexts, and Spec 185 added the `unknownPostGrantCap`, `unknownFreeOperationCap`, and `unknownGrantFlowPartial` preview outcome-breakdown counters. The current explicit-disabled and omitted-flag captures remain byte-identical to each other, both keep `previewUsage.mode: "disabled"`, evaluate zero candidates, and select `chooseNStep:$picks:add:"spare"`.

Changed:

- Regenerated `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` from the current disabled fixture output.
- No production source changed.
- No Zobrist source, Spec 194 capture/report tooling, or policy-profile-quality witness changed.

Remaining blocker:

- `pnpm -F @ludoforge/engine run test:determinism` progressed through the first two determinism files, then stalled in `dist/test/determinism/draft-state-determinism-parity.test.js` with heartbeat output at 31s, 1m1s, 1m31s, 2m1s, 2m31s, and 3m1s quiet. The lane was interrupted with user approval under the 1-3-1 recommended option 2.
- Replacement probe `timeout 120s node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` timed out with exit 124 after printing only `TAP version 13`.
- Replacement probe `timeout 600s node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` also timed out with exit 124 after printing only `TAP version 13`.
- No source file used by that stalled production-scale parity test changed in this ticket. The next owner is `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`.

Outcome amended: 2026-05-24.

`archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md` resolved the draft-state timeout with a bounded FITL prefix proof, but the broad determinism lane then stalled in `dist/test/determinism/fitl-policy-agent-canary-determinism.test.js`. The next owner before this prerequisite can finish is `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`.

Snapshot generation command:

`node --input-type=module -e "import {writeFileSync} from 'node:fs'; import {PolicyAgent} from './packages/engine/dist/src/agents/index.js'; import {applyDecision, serializeGameState} from './packages/engine/dist/src/kernel/index.js'; import {createChoosenStepPreviewFixture, legalAddStableKeys} from './packages/engine/dist/test/unit/agents/policy-preview-inner-choosenstep-fixture.js'; const fixture=createChoosenStepPreviewFixture(false); const agent=new PolicyAgent({traceLevel:'verbose'}); const result=agent.chooseDecision(fixture.input); const finalState=applyDecision(fixture.def, fixture.state, result.decision).state; const trace=result.agentDecision; const snapshot={serializedFinalState: serializeGameState(finalState), previewUsage: trace?.previewUsage, selectedStableMoveKey: trace?.selectedStableMoveKey, candidateStableKeys: trace?.candidates?.map((candidate)=>candidate.stableMoveKey) ?? [], candidatePreviewDrives: trace?.candidates?.map((candidate)=>candidate.previewDrive ?? null) ?? [], legalAddKeys: legalAddStableKeys(fixture.microturn)}; writeFileSync('/tmp/spec-161-current-snapshot.json', JSON.stringify(snapshot,null,2)+'\n'); console.log(JSON.stringify({stateHash: snapshot.serializedFinalState.stateHash, outcomeKeys: Object.keys(snapshot.previewUsage.outcomeBreakdown), hasTargetKinds: Object.prototype.hasOwnProperty.call(snapshot.serializedFinalState.decisionStack[1].context, 'targetKinds')}));"`

Verification:

- `pnpm turbo build` — passed from cache.
- `node --input-type=module -e "<explicit-disabled vs omitted capture comparison>"` — passed; reported `byteIdentical: true`, `explicitHash: "0x2fb6f5427d98e3cc"`, `omittedHash: "0x2fb6f5427d98e3cc"`, and selected move `chooseNStep:$picks:add:"spare"`.
- `node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` from `packages/engine` — passed, 2 tests.
- `git diff --check -- packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` — passed before the blocker-ticket rewrite.

Outcome amended: 2026-05-25.

`archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md` resolved the remaining FITL PolicyAgent canary timeout. This prerequisite's broad acceptance lanes are now citeable:

- `pnpm -F @ludoforge/engine run test:determinism` — passed, 31/31 files.
- `pnpm -F @ludoforge/engine run test` — passed, 169/169 files.

This ticket's Spec 161 default-off snapshot repair remains unchanged, and no production source, Zobrist source, Spec 194 capture/report tooling, or policy-profile-quality witness changed here.
