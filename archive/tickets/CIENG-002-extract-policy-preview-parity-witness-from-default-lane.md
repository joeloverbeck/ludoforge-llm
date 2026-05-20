# CIENG-002: Extract Spec 178 chooseOne Inner-Preview Outcome Parity Witness From Engine `default` Lane

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/scripts/test-lane-manifest.mjs`, `packages/engine/scripts/run-tests.mjs`, `packages/engine/package.json`. No production source changes.
**Deps**: `archive/reports/ci-default-lane-wall-time-2026-05-19.md`

## Problem

The `CI / ci` workflow (`.github/workflows/ci.yml`) runs `pnpm turbo test`, which expands per `turbo.json` to the engine `default` lane plus the runner `vitest run`. The `default` lane is the "local fast feedback" lane — it excludes the FITL-events / FITL-rules / texas-cross-game / slow-parity / policy-canaries shards that live in `.github/workflows/engine-tests.yml`. However, a single test file under `test/architecture/` now dominates the lane:

- `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` — "Spec 178 chooseOne inner-preview outcome parity"
- Iterates `WITNESS_SEEDS = [1005, 1011, 1008, 1013, 1009]`, running a full ARVN production simulation per seed with `traceLevel: 'verbose'` and deep-equal comparison against `test/architecture/fixtures/178-outcome-parity-<seed>.json`.

Measured locally (`archive/reports/ci-default-lane-wall-time-2026-05-19.md`):

- Engine `default` lane total: 297.45 s
- `dist/test/architecture/**/*.test.js` glob: 177 s of that
- This one file (one `describe`): **173 s** (~58 % of the lane)
- Seed 1008 alone: 84 s (of 90 s per-test timeout)
- All other architecture files combined: ~4 s

Scaled to a GitHub-hosted runner (~1.5–2× local), this single file is ~4–5 min of `CI / ci` wall time. Removing it from the `default` lane pulls `CI / ci` under target without losing coverage, since the witness will run on its own shard in `engine-tests.yml` alongside other heavy regression witnesses (`policy-canaries`, `slow-parity`).

## Assumption Reassessment (2026-05-19)

1. `default` lane is defined in `packages/engine/scripts/run-tests.mjs:19-28` with patterns `[unit/**, architecture/**, ...listIntegrationTestsForLane('integration:core').map(toDistTestPath)]`. Confirmed by reading the file. The architecture portion is currently a raw glob with no exclusion layer.
2. `test-lane-manifest.mjs` already provides exclusion lists and helpers for integration tests (`SLOW_INTEGRATION_TESTS`, `POLICY_CANARY_INTEGRATION_TESTS`, `listIntegrationTestsForLane(...)`), but **has no architecture-test analog** — the architecture root is not referenced anywhere in the manifest. The new exclusion needs to add that wiring.
3. `engine-tests.yml` already shards heavy lanes via a matrix with `id`, `script`, `timeout` columns and a `needs: build` dependency on the prebuilt `engine-dist` artifact. Adding a new shard row follows the existing pattern; no workflow restructure required.
4. The witness's per-test timeout is 90 s (`policy-preview-inner-outcome-parity.test.ts:107`). A 15 min lane timeout in the new shard leaves comfortable headroom (5 seeds × 90 s = 7.5 min worst case).
5. The file's `// @test-class:` marker reads `architectural-invariant`, but the test shape (per-seed fixture deep-equal) matches `convergence-witness` per `.claude/rules/testing.md` ("Fall back to `convergence-witness` only when the property is inherently seed- or profile-specific"). Re-classification is a separate concern and is explicitly out of scope here (see Out of Scope).
6. No other file in `test/architecture/preview-standing/` is heavy: `spec-180-standing-role-primitives.test.ts` runs in 0.39 s in isolation; `spec-180-seat-matrix-trace.test.ts` and `spec-180-ordinary-operation-standing-projection-witness.test.ts` are within the ~4 s residual architecture budget. Only the single witness file needs to move.

## Architecture Check

1. **Precedent fit**: This extends the existing pattern in `test-lane-manifest.mjs` where heavy regression witnesses are excluded from the local-feedback `default` / `integration:core` lanes and re-attached as dedicated matrix shards in `engine-tests.yml`. `SLOW_INTEGRATION_TESTS` and `POLICY_CANARY_INTEGRATION_TESTS` are direct analogs.
2. **Coverage preserved**: The witness still runs on every PR push touching `packages/engine/**`, just on a separate matrix shard rather than the main `ci` job. No CI signal is lost; total CI compute is unchanged (work moves to a parallel runner).
3. **Test-class semantics**: The file's `@test-class: architectural-invariant` marker continues to be honored by the test-class reporter wherever the file runs. Lane membership and class marker are orthogonal concerns; this ticket only changes lane membership.
4. **No backwards-compatibility shims**: No alias scripts, no transitional dual-membership. The file is removed from the `default` lane's architecture pattern enumeration and added to a new dedicated lane in one change.
5. **GameDef / runtime agnosticism**: Not relevant — this ticket touches CI plumbing and test-runner manifests only. No engine kernel, compiler, agents, or runtime code is modified.

## What to Change

### 1. Add architecture-test exclusion machinery to `test-lane-manifest.mjs`

Mirror the integration-test exclusion pattern. Add at module scope (near the existing `SLOW_INTEGRATION_TESTS` / `POLICY_CANARY_INTEGRATION_TESTS` declarations):

```js
const ARCHITECTURE_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'architecture');

// Heavy parametric architectural witnesses. Each iterates a seed corpus and
// runs full bounded ARVN simulations with verbose policy traces against
// JSON fixtures, so individually they cost minutes. Excluded from the
// default lane to keep local `pnpm turbo test` fast; covered by a dedicated
// shard in engine-tests.yml.
export const SLOW_ARCHITECTURE_TESTS = [
  'policy-preview-inner-outcome-parity.test.ts',
];

export const ALL_ARCHITECTURE_TESTS = collectTestFiles(ARCHITECTURE_TEST_ROOT);

export function isSlowArchitectureTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return SLOW_ARCHITECTURE_TESTS.includes(baseName);
}

export function listArchitectureTestsForLane(lane) {
  switch (lane) {
    case 'architecture:default':
      return ALL_ARCHITECTURE_TESTS.filter((sourcePath) => !isSlowArchitectureTest(sourcePath));
    case 'architecture:policy-preview-parity':
      return ALL_ARCHITECTURE_TESTS.filter((sourcePath) => isSlowArchitectureTest(sourcePath));
    default:
      throw new Error(`Unknown architecture test lane: ${lane}`);
  }
}
```

The constant naming `SLOW_ARCHITECTURE_TESTS` matches the `SLOW_INTEGRATION_TESTS` precedent; the lane keys `architecture:default` / `architecture:policy-preview-parity` use the namespace convention from `integration:*`.

### 2. Rewire the `default` lane and add the new lane in `run-tests.mjs`

Update the lane config block (`packages/engine/scripts/run-tests.mjs:19-28`):

- Replace the raw architecture glob `'dist/test/architecture/**/*.test.js'` with `...listArchitectureTestsForLane('architecture:default').map(toDistTestPath)`.
- Add the new lane:

```js
'architecture:policy-preview-parity': {
  execution: 'sequential',
  patterns: listArchitectureTestsForLane('architecture:policy-preview-parity').map(toDistTestPath),
  timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
},
```

Sequential is appropriate here because the witness is short (single file) and per-file process isolation is cheap; using `batched` would still work but offers no benefit at one file.

Update the import statement at the top of `run-tests.mjs` to include the new manifest exports:

```js
import {
  ALL_DETERMINISM_TESTS,
  ALL_POLICY_PROFILE_QUALITY_TESTS,
  listArchitectureTestsForLane,
  listE2eTestsForLane,
  listIntegrationTestsForLane,
  toDistTestPath,
} from './test-lane-manifest.mjs';
```

### 3. Add the `test:architecture:policy-preview-parity` script

In `packages/engine/package.json`, add (sorted alphabetically among the existing `test:*` scripts):

```json
"test:architecture:policy-preview-parity": "node scripts/run-tests.mjs --lane architecture:policy-preview-parity",
```

### 4. Add a matrix shard row to `engine-tests.yml`

In `.github/workflows/engine-tests.yml`, append to the existing `test.strategy.matrix.lane` list:

```yaml
- { id: policy-preview-parity, script: 'test:architecture:policy-preview-parity', timeout: 15 }
```

Place it next to the other architecture/witness shards for readability (after `policy-canaries`).

### 5. Verify default-lane and new-lane composition

Run, in this order, to confirm the rewire:

- `pnpm -F @ludoforge/engine build` (rebuild dist so test files exist there)
- `pnpm -F @ludoforge/engine test` — should NOT execute `policy-preview-inner-outcome-parity.test.js`. Confirmed by absence of `Spec 178 chooseOne inner-preview outcome parity` lines in stdout, and by total wall time dropping from ~5 min to ~2 min locally.
- `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity` — should execute exactly one file (`dist/test/architecture/policy-preview-inner-outcome-parity.test.js`) with 5 passing `it()` cases.
- Optionally inspect via `node -e "import('./scripts/test-lane-manifest.mjs').then(m => console.log(m.listArchitectureTestsForLane('architecture:default').length, m.listArchitectureTestsForLane('architecture:policy-preview-parity')))"` to confirm the lane composition before invoking the runner.

### 6. Extend the existing lane-taxonomy policy guard

`packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` already guards lane taxonomy and package-script wiring for the slow integration lanes. Extend it to assert that:

- `SLOW_ARCHITECTURE_TESTS` is a non-empty subset of `ALL_ARCHITECTURE_TESTS`.
- The slow architecture witness is absent from the `default` execution plan.
- The new `architecture:policy-preview-parity` execution plan contains that witness.
- `engine-tests.yml` contains the new `policy-preview-parity` matrix row and the engine package has the matching script.

## Files to Touch

- `packages/engine/scripts/test-lane-manifest.mjs` (modify — add architecture machinery)
- `packages/engine/scripts/run-tests.mjs` (modify — rewire `default`, add new lane, extend import)
- `packages/engine/package.json` (modify — add new test script)
- `.github/workflows/engine-tests.yml` (modify — add matrix shard row)
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modify — extend existing lane-taxonomy guard)

## Out of Scope

- **Test-class marker re-classification** (`@test-class: architectural-invariant` → `@test-class: convergence-witness` with a `@witness` reference to Spec 178). The current marker is arguably incorrect per `.claude/rules/testing.md` because the test asserts per-seed trajectory parity, but re-classifying it is a separate review of the witness's purpose and should not bundle into this CI-plumbing ticket. If pursued, it belongs in a follow-up ticket alongside any other mis-classified architecture witnesses found by a broader audit.
- **Reducing the witness's cost (downsampling seeds, dropping `traceLevel: 'verbose'`)**. Branch B of the diagnostic report. Coverage implications need separate review.
- **Parallelizing `integration:core`'s 96 per-file Node spawns**. Branch D of the diagnostic report. Worth a separate ticket only if CI is still over target after this ticket lands.
- **Measuring `pnpm turbo lint` / `pnpm turbo typecheck` / `pnpm turbo build` wall times in the `CI / ci` workflow**. Out of frame for this ticket; the diagnostic report only covered `pnpm turbo test`.
- **Sharding the witness across multiple matrix rows** (e.g., seed 1008 alone in its own shard). One shard fits comfortably within the 15-minute matrix timeout. Sharding can be added later if the witness grows.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` completes without running `policy-preview-inner-outcome-parity.test.js`, and total wall time on the implementation host is materially below the pre-change baseline (target: at least 50 % reduction in engine `default` lane wall time).
2. `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity` completes with 5/5 passing `it()` cases for `Spec 178 chooseOne inner-preview outcome parity`.
3. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` (or any other existing lane invoked through `run-tests.mjs`) continues to pass — verifies that the import-list and helper-signature changes in `run-tests.mjs` did not break other lanes.
4. `pnpm -F @ludoforge/engine lint` passes (no unused-imports / unused-exports regressions from the new manifest exports).
5. `pnpm -F @ludoforge/engine typecheck` passes.
6. Existing suite: `pnpm turbo test` (root) completes successfully.
7. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` guards the new architecture lane split and workflow/package-script wiring.

### Invariants

1. The set of test files run by `default` ∪ `architecture:policy-preview-parity` equals the set previously run by `default` (no file silently dropped from CI coverage on push/PR events affecting `packages/engine/**`).
2. `SLOW_INTEGRATION_TESTS` / `POLICY_CANARY_INTEGRATION_TESTS` / `SLOW_ARCHITECTURE_TESTS` remain mutually disjoint sets — no file lives in two exclusion lists simultaneously.
3. `engine-tests.yml`'s `test` job still depends on `build` and still consumes the `engine-dist` artifact for the new lane (no separate build step in the new shard row).
4. Engine `default` lane continues to run sequentially per-pattern (one Node process per pattern) — execution-mode semantics for the `default` lane are unchanged; only its pattern list changes.

## Test Plan

### New/Modified Tests

No new unit/integration tests are required for this ticket. The change is to test-runner manifests and CI workflow plumbing only. Coverage of the modified manifest helpers is implicit in the acceptance criteria — successful runs of both the trimmed `default` lane and the new `architecture:policy-preview-parity` lane prove the manifest works.

Extend `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` to assert that `SLOW_ARCHITECTURE_TESTS` ⊂ `ALL_ARCHITECTURE_TESTS`, that the slow architecture witness is out of `default` and in `architecture:policy-preview-parity`, and that the new `engine-tests.yml` matrix row references a real `package.json` script. This guard exists in the live repo, so it is in scope rather than optional.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` (verify guard)
3. `pnpm -F @ludoforge/engine test` (verify trimmed default lane)
4. `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity` (verify new lane)
5. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` (verify another run-tests.mjs lane)
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm -F @ludoforge/engine typecheck`
8. `pnpm turbo test` (full root run)

After landing, verify on the first real `CI / ci` run that:

- `CI / ci` total wall time drops from >10 min toward the 5–7 min range.
- A `policy-preview-parity` shard appears in `Engine Tests` workflow runs and completes within the 15 min budget.

## Outcome (2026-05-19)

- **What landed**:
  - Added `ALL_ARCHITECTURE_TESTS`, `SLOW_ARCHITECTURE_TESTS`, `isSlowArchitectureTest(...)`, and `listArchitectureTestsForLane(...)` in `packages/engine/scripts/test-lane-manifest.mjs`.
  - Rewired the engine `default` lane in `packages/engine/scripts/run-tests.mjs` from the raw `dist/test/architecture/**/*.test.js` glob to the enumerated `architecture:default` list, excluding `policy-preview-inner-outcome-parity.test.ts`.
  - Added the dedicated `architecture:policy-preview-parity` lane and `test:architecture:policy-preview-parity` package script.
  - Added `policy-preview-parity` to the `Engine Tests` matrix with `timeout: 15`, still behind `needs: build` and the shared `engine-dist` artifact.
  - Extended `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` to guard the slow architecture manifest, default-lane exclusion, dedicated-lane inclusion, package script, and workflow shard row.
- **Boundary corrections**:
  - The optional guard-test hook existed in the live repo, so it was made an explicit ticket deliverable.
  - `test:unit` intentionally still runs the raw unit + architecture globs; this ticket only moved the heavy witness out of the engine `default` lane used by `pnpm -F @ludoforge/engine test` / `pnpm turbo test`.
- **Lane composition**:
  - `architecture:default`: 61 architecture files.
  - `architecture:policy-preview-parity`: `test/architecture/policy-preview-inner-outcome-parity.test.ts`.
  - `ALL_ARCHITECTURE_TESTS`: 62 files.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` passed: 10/10 subtests.
  - `cd packages/engine && node -e "import('./scripts/test-lane-manifest.mjs').then(m => console.log(JSON.stringify({defaultHasSlow:m.listArchitectureTestsForLane('architecture:default').includes('test/architecture/policy-preview-inner-outcome-parity.test.ts'), parity:m.listArchitectureTestsForLane('architecture:policy-preview-parity'), defaultCount:m.listArchitectureTestsForLane('architecture:default').length, total:m.ALL_ARCHITECTURE_TESTS.length})))"` printed `{"defaultHasSlow":false,"parity":["test/architecture/policy-preview-inner-outcome-parity.test.ts"],"defaultCount":61,"total":62}`.
  - `pnpm -F @ludoforge/engine test` passed with `[run-tests] [default] summary 158/158 files passed`; the old raw architecture glob was not run.
  - `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity` passed after the final `pnpm turbo test` rebuild with `[run-tests] [architecture:policy-preview-parity] summary 1/1 files passed` and duration `2m 59s`; this file contains the five Spec 178 seed cases.
  - `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` passed with `[run-tests] [integration:fitl-events-shard-a] summary 38/38 files passed`.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm turbo test` passed with `Tasks: 5 successful, 5 total`; `@ludoforge/engine:build`, `@ludoforge/engine:test`, and runner tasks were cache misses, while `@ludoforge/engine-wasm:build` replayed from cache as supplemental non-ticket-owned evidence.
  - `pnpm run check:ticket-deps` passed: `Ticket dependency integrity check passed for 1 active tickets and 2446 archived tickets.`
- **Schema/artifact fallout**: none; no schema, golden, fixture, or generated JSON artifacts changed.
- **Source-size decision**: not triggered. Final touched source sizes are `run-tests.mjs` 282 lines, `test-lane-manifest.mjs` 272 lines, and `engine-test-lane-taxonomy-policy.test.ts` 438 lines; no touched source file is near the 600-line checkpoint or 800-line cap.
- **Untracked/touched-file hygiene**:
  - This ticket owns tracked edits to `.github/workflows/engine-tests.yml`, `packages/engine/package.json`, `packages/engine/scripts/run-tests.mjs`, `packages/engine/scripts/test-lane-manifest.mjs`, and `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts`.
  - This ticket owns untracked artifacts `archive/reports/ci-default-lane-wall-time-2026-05-19.md` and, after post-review archival, `archive/tickets/CIENG-002-extract-policy-preview-parity-witness-from-default-lane.md`.
  - Concurrent unrelated dirty paths observed after proof: `.claude/skills/brainstorm/SKILL.md`, `.claude/skills/brainstorm/references/approaches-and-design.md`, `.claude/skills/brainstorm/references/context-and-classification.md`, and `.claude/skills/brainstorm/references/output-artifacts.md`; this ticket did not touch them.
- **Late-edit proof validity**: terminal status and proof transcription only; no source, command semantics, acceptance boundary, touched-file ownership, or follow-up ownership changed after the final proof lanes. Post-status dependency-check transcription was clerical and did not change graph-affecting facts.
- **Post-review decision**: no must-fix cleanup, reopen item, or follow-up ticket found; archived at `archive/tickets/CIENG-002-extract-policy-preview-parity-witness-from-default-lane.md`. Post-archive `pnpm run check:ticket-deps` passed for 0 active tickets and 2447 archived tickets.
