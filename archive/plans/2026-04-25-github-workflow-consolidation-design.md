# GitHub Workflow Consolidation — Design

**Status**: ✅ COMPLETED

## Brainstorm Context

- **Original request**: Audit `.github/workflows/` for redundant work — within a single workflow or across workflows — and decide whether to remove tests or whole suites that are truly redundant.
- **Reference file**: None (analysis grounded in workflow YAML + `packages/engine/scripts/test-lane-manifest.mjs` + `packages/engine/package.json` + `turbo.json`).
- **Final confidence**: 95%. Approach selected: **B2 — Matrix + build-once**.
- **Key interview decisions**:
  - Two strict duplicates removed outright.
  - Seven near-identical engine test-slice workflows consolidated into one matrix workflow with a shared build job.
  - `engine-determinism.yml` left untouched (specialized multi-job structure).
  - `ci.yml` left untouched (orchestrator, runs the cheap tier).

## Overview

Eliminate two strict-duplicate workflows and consolidate seven near-identical engine test-slice workflows into a single `engine-tests.yml` matrix workflow with a build-once-fan-out-to-test pattern.

## Goals

- **Remove duplicate test execution** (`runner-tests.yml` runs the same `vitest run` that `ci.yml`'s `pnpm turbo test` already runs; `engine-grant-determinism.yml` runs a single test that is auto-globbed into `engine-determinism.yml`'s determinism lane).
- **Reduce per-PR CI wall-clock** by building the engine once and fanning out to 7 long-running test lanes via matrix, instead of cold-building once per lane.
- **Reduce YAML maintenance surface** — 7 near-identical workflows collapse to one parameterized matrix.

## Non-Goals

- Touching `engine-determinism.yml`'s `policy-profile-quality` matrix shards or report-generation job.
- Re-architecting `ci.yml` (it stays the orchestrator for lint / typecheck / build / `pnpm turbo test` + Node-20 build smoke).
- Adding new test coverage or removing in-scope tests.
- Adding a turbo remote cache (out of scope; would be a separate effort).

## Design

### Workflows kept unchanged

| File | Reason |
|---|---|
| `ci.yml` | Orchestrator — runs lint/typecheck/build/test on every push, plus the Node-20 build-only smoke. Already covers unit + `integration:core` (engine) and `vitest run` (runner). |
| `engine-determinism.yml` | Multi-job structure with `policy-profile-quality` matrix shards and a baseline-comparing report-generation job. Folding into a generic matrix would lose specialized behavior. |

### Workflows deleted

| File | Reason |
|---|---|
| `runner-tests.yml` | Strict duplicate of `ci.yml` — both run `vitest run` for `@ludoforge/runner` on Node 22 with the same install/build path. Provides no extra coverage and no faster feedback. |
| `engine-grant-determinism.yml` | Strict subset of `engine-determinism.yml`. Runs only `fitl-policy-agent-canary-determinism.test.js`, which is auto-globbed into `ALL_DETERMINISM_TESTS` (`packages/engine/scripts/test-lane-manifest.mjs:67`) and executed by the determinism lane. |

### Workflows replaced by `engine-tests.yml`

These seven workflows are deleted; their lanes move into the matrix:

| Removed file | Lane id | Engine script | Per-lane timeout |
|---|---|---|---|
| `engine-fitl-events.yml` | `fitl-events` | `test:integration:fitl-events` | 30 min |
| `engine-fitl-rules.yml` | `fitl-rules` | `test:integration:fitl-rules` | 30 min |
| `engine-texas-cross-game.yml` | `texas-cross-game` | `test:integration:texas-cross-game` | 30 min |
| `engine-slow-parity.yml` | `slow-parity` | `test:integration:slow-parity` | 30 min |
| `engine-e2e-all.yml` | `e2e-all` | `test:e2e:all` | 30 min |
| `engine-memory.yml` | `memory` | `test:memory` | 10 min |
| `engine-performance.yml` | `performance` | `test:performance` | 30 min |

### `engine-tests.yml` structure

Two jobs in one workflow: `build` (single instance) and `test` (matrix of 7 lanes, depends on `build`).

```yaml
name: Engine Tests

on:
  push:
    branches: [main]
    paths:
      - 'packages/engine/**'
      - 'data/games/**'
      - 'scripts/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'turbo.json'
      - 'tsconfig.base.json'
      - 'eslint.config.js'
      - '.github/workflows/engine-tests.yml'
  pull_request:
    branches: [main]
    paths:
      - 'packages/engine/**'
      - 'data/games/**'
      - 'scripts/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'turbo.json'
      - 'tsconfig.base.json'
      - 'eslint.config.js'
      - '.github/workflows/engine-tests.yml'
  workflow_dispatch:

concurrency:
  group: engine-tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm guard:worktree-pointers
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @ludoforge/engine build
      - name: Upload engine dist
        uses: actions/upload-artifact@v4
        with:
          name: engine-dist
          path: packages/engine/dist
          retention-days: 1
          if-no-files-found: error

  test:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: ${{ matrix.lane.timeout }}
    strategy:
      fail-fast: false
      matrix:
        lane:
          - { id: fitl-events,       script: 'test:integration:fitl-events',       timeout: 30 }
          - { id: fitl-rules,        script: 'test:integration:fitl-rules',        timeout: 30 }
          - { id: texas-cross-game,  script: 'test:integration:texas-cross-game',  timeout: 30 }
          - { id: slow-parity,       script: 'test:integration:slow-parity',       timeout: 30 }
          - { id: e2e-all,           script: 'test:e2e:all',                       timeout: 30 }
          - { id: memory,            script: 'test:memory',                        timeout: 10 }
          - { id: performance,       script: 'test:performance',                   timeout: 30 }
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Download engine dist
        uses: actions/download-artifact@v4
        with:
          name: engine-dist
          path: packages/engine/dist
      - name: Run engine ${{ matrix.lane.id }}
        run: pnpm -F @ludoforge/engine ${{ matrix.lane.script }}
```

### Key decisions

1. **Build-once via artifact, not via turbo cache.** The pnpm store is already cross-workflow cached, so the redundant cost across the 7 lanes is `tsc` and the post-build `schema:artifacts` write — that cost is captured in `packages/engine/dist`. Uploading `dist/` and downloading once per matrix lane removes 6 cold `tsc` runs per PR. We don't try to skip `pnpm install` in the test job because the engine's `test` scripts (`pnpm -F @ludoforge/engine ...`) need pnpm-resolved local symlinks, and `pnpm install --frozen-lockfile` against a warm pnpm cache is fast.
2. **Single shared concurrency group.** `concurrency.group: engine-tests-${{ github.ref }}` cancels previous runs of the same workflow on the same ref. We do not split per-lane concurrency, because cancelling the `build` job orphans the matrix — the unified group keeps the build/test pair atomic.
3. **`fail-fast: false`.** Each lane is independent and surfaces a different defect class. One failure should not abort the others.
4. **Per-lane timeout via `matrix.lane.timeout`.** Memory keeps its tighter 10-minute timeout; the rest take 30 minutes (matching the longest pre-consolidation timeout). `engine-fitl-events.yml`, `-fitl-rules.yml`, `-texas-cross-game.yml`, `-e2e-all.yml`, `-performance.yml` had no explicit `timeout-minutes`, so the GHA default (360 min) was applying — 30 min is a tighter ceiling than today and is consistent with the explicitly-bounded ones.
5. **`if-no-files-found: error` on upload.** Catches a build that "succeeded" but emitted no `dist/` (e.g., wrong working directory).
6. **`retention-days: 1` for the dist artifact.** Test jobs run within minutes of build; one-day retention is more than enough and keeps storage bills minimal.
7. **`engine-determinism.yml` does not migrate to the shared dist artifact.** It runs `pnpm -F @ludoforge/engine build` itself in each of its three jobs (`determinism`, `policy-profile-quality`, `policy-profile-quality-report`). Migrating it is non-trivial because of its existing baseline-download / artifact-merge flow and was explicitly scoped out. Leave it alone.

### Path filter consolidation

The 7 deleted workflows each had a near-identical `paths:` filter that referenced their own `.github/workflows/<name>.yml`. The new `engine-tests.yml` uses a single combined `paths:` filter that includes `'.github/workflows/engine-tests.yml'` (and drops the per-old-workflow self-references). All other path entries are identical across the 7 source workflows, so the union equals each.

### Edge cases

- **Branch protection required-status-checks.** Removing `runner-tests.yml`, `engine-grant-determinism.yml`, and the 7 consolidated workflows changes the GHA "context" names that branch protection looks for. Any context that no longer reports will block merging forever (UI shows "Expected — Waiting for status to be reported"). The new workflow's contexts will be `Engine Tests / build` and `Engine Tests / test (<lane.id>)` — different shape from the per-workflow contexts. **The plan must include a verification + reconciliation step against branch protection before merging the consolidation PR.**
- **`paths:` filter on the consolidated workflow firing differently from today.** Today, e.g., `engine-memory.yml` only triggers when its own self-reference (`.github/workflows/engine-memory.yml`) changes. After consolidation, all 7 lanes trigger when `.github/workflows/engine-tests.yml` changes (because they share the workflow). This is the correct trade — workflow-config changes should re-validate every lane.
- **`workflow_dispatch` dispatch granularity.** Today you can manually trigger one lane (e.g., just `engine-memory.yml`). After consolidation, manual dispatch runs the full matrix. Acceptable — manual dispatch is a power-user fallback, not a daily flow. If finer dispatch is needed, we can add an `inputs.lane` selector with a default of `all` later; not in scope now.
- **Forks/PR artifact permissions.** `actions/upload-artifact@v4` and `download-artifact@v4` work across jobs in the same workflow run without elevated permissions, so PRs from forks remain unaffected.
- **Engine dist size.** A clean `packages/engine/dist` is mostly `.js` + `.d.ts` from `tsc`; it is well under the artifact size limits that matter. Upload + download will be a few seconds.
- **`ci.yml`'s `pnpm turbo test` build re-execution.** `ci.yml` independently builds the engine as part of `pnpm turbo build`. We are not changing that — the consolidation only removes duplication *within the engine-tests fan-out*, not between `ci.yml` and `engine-tests.yml`. Both workflows must still build independently because they run on separate GHA jobs.

### Files NOT touched

- `.github/workflows/ci.yml`
- `.github/workflows/engine-determinism.yml`
- `packages/engine/scripts/run-tests.mjs`
- `packages/engine/scripts/test-lane-manifest.mjs`
- `packages/engine/package.json` (test scripts unchanged)
- `packages/runner/package.json`
- `turbo.json`

## Step-by-step execution

> All paths are relative to the repo root: `/home/joeloverbeck/projects/ludoforge-llm`. No worktree.

### Phase 1 — Pre-merge reconciliation snapshot

1. Capture the current branch protection required-status-check contexts so reconciliation in Phase 4 has a target diff.

   ```bash
   gh api repos/:owner/:repo/branches/main/protection/required_status_checks \
     | tee /tmp/branch-protection-before.json
   ```

   Expected: a JSON object with a `contexts` array. Save it for Phase 4.

   If the repo is missing branch protection on `main`, the `gh` call returns 404; record that and proceed (Phase 4 becomes a no-op).

### Phase 2 — Delete strict-duplicate workflows

2. Remove `runner-tests.yml`.

   ```bash
   rm .github/workflows/runner-tests.yml
   ```

3. Remove `engine-grant-determinism.yml`.

   ```bash
   rm .github/workflows/engine-grant-determinism.yml
   ```

4. Sanity check: `git status` shows two deletions, no other modifications.

### Phase 3 — Add consolidated `engine-tests.yml` and remove the seven source workflows

5. Create `.github/workflows/engine-tests.yml` with the YAML defined in this design.

6. Remove the seven consolidated workflows in one batch:

   ```bash
   rm .github/workflows/engine-fitl-events.yml \
      .github/workflows/engine-fitl-rules.yml \
      .github/workflows/engine-texas-cross-game.yml \
      .github/workflows/engine-slow-parity.yml \
      .github/workflows/engine-e2e-all.yml \
      .github/workflows/engine-memory.yml \
      .github/workflows/engine-performance.yml
   ```

7. Validate the new YAML is parseable and the matrix expands as expected:

   ```bash
   # actionlint catches GHA-specific syntax issues; install it locally if not present
   actionlint .github/workflows/engine-tests.yml || true
   # Or use Python to assert the matrix shape:
   python3 - <<'PY'
   import yaml, sys
   with open('.github/workflows/engine-tests.yml') as f:
       wf = yaml.safe_load(f)
   lanes = wf['jobs']['test']['strategy']['matrix']['lane']
   ids = [l['id'] for l in lanes]
   expected = ['fitl-events','fitl-rules','texas-cross-game','slow-parity','e2e-all','memory','performance']
   assert ids == expected, f'lane mismatch: {ids}'
   print(f'OK: {len(ids)} lanes')
   PY
   ```

   Expected: `OK: 7 lanes`.

8. Commit with a body that lists the removed workflows + the new one. Suggested subject: `ci: consolidate engine test-slice workflows into engine-tests.yml matrix`.

### Phase 4 — Branch protection reconciliation (BEFORE merging the PR)

9. Open the PR, push, and wait for the new `engine-tests.yml` to run on the PR head. Once it has at least started, the new context names appear in GHA. Confirm the new contexts:

   ```bash
   gh pr checks <PR-number> --watch
   ```

   Expected new contexts (each prefixed by the workflow run name `Engine Tests`):
   - `Engine Tests / build`
   - `Engine Tests / test (fitl-events)`
   - `Engine Tests / test (fitl-rules)`
   - `Engine Tests / test (texas-cross-game)`
   - `Engine Tests / test (slow-parity)`
   - `Engine Tests / test (e2e-all)`
   - `Engine Tests / test (memory)`
   - `Engine Tests / test (performance)`

10. Diff against `branch-protection-before.json`. For every removed workflow, if its context appeared in `contexts`, replace it with the corresponding new context (or remove it if the lane is no longer required for merging — that is a policy decision for the user).

    ```bash
    cat /tmp/branch-protection-before.json | jq '.contexts'
    ```

    If reconciliation is needed, update via the GitHub UI (Settings → Branches → main → Edit protection) **or** via API:

    ```bash
    # Replace <new-contexts> with the desired updated array
    gh api -X PATCH repos/:owner/:repo/branches/main/protection/required_status_checks \
      -F strict=true \
      -F 'contexts[]=Engine Tests / build' \
      -F 'contexts[]=Engine Tests / test (fitl-events)' \
      # ... etc
    ```

    **STOP and ask the user** if you discover removed workflow names listed in `contexts`. The user's policy on which lanes are required-to-merge is not for this plan to decide — present the list and ask.

### Phase 5 — Post-merge verification

11. After the PR merges to `main`, watch the first `engine-tests.yml` run on `main`:

    ```bash
    gh run list --workflow engine-tests.yml --branch main --limit 1
    gh run view --log <run-id>
    ```

    Expected: `build` job succeeds and uploads `engine-dist`; all 7 matrix lanes succeed (or fail in the same way they would have failed pre-consolidation — failures are not a regression of the consolidation itself).

12. Confirm no orphaned workflow names appear in GHA "All workflows" list. The deleted `.yml` files + their workflow names should be gone from the sidebar after the next push to `main`.

## Verification checklist

- [ ] `git status` after Phase 3 shows: 9 deletions (`runner-tests.yml`, `engine-grant-determinism.yml`, plus the 7 consolidated workflows) and 1 addition (`engine-tests.yml`). Nothing else.
- [ ] `actionlint` (or the Python YAML check) reports no errors on `engine-tests.yml`.
- [ ] `engine-tests.yml`'s `build` job completes and the `engine-dist` artifact appears in the run page.
- [ ] All 7 matrix lanes start (visible in the GHA matrix tab) and pass — or fail in a manner unrelated to consolidation.
- [ ] No workflow file references one of the removed names: `grep -rn 'engine-fitl-events\|engine-fitl-rules\|engine-texas-cross-game\|engine-slow-parity\|engine-e2e-all\|engine-memory\|engine-performance\|engine-grant-determinism\|runner-tests' .github/`
  - Expected: no matches.
- [ ] Branch protection `contexts` no longer references any removed workflow.
- [ ] First `main`-branch run of `engine-tests.yml` after merge succeeds.

## Recovery info

- Each phase is one or more `rm` / `Write` operations under `.github/workflows/`. Recovery from any phase before merge: `git checkout HEAD -- .github/workflows/`.
- Recovery from a merged-but-broken consolidation: revert the consolidation commit. The 9 removed workflow files come back verbatim from git history, and the matrix workflow is removed in the same revert.
- Branch protection: the `branch-protection-before.json` snapshot from Phase 1 is the rollback target. Re-PATCH the original `contexts` array to restore.

## FOUNDATIONS.md alignment

This is a CI infrastructure change, not source code governed by FOUNDATIONS.md. Not applicable.

## Outcome

**Completion date**: 2026-04-25

**What changed**:

- Deleted strict-duplicate workflows: `.github/workflows/runner-tests.yml`, `.github/workflows/engine-grant-determinism.yml`.
- Deleted seven near-identical engine test-slice workflows: `engine-fitl-events.yml`, `engine-fitl-rules.yml`, `engine-texas-cross-game.yml`, `engine-slow-parity.yml`, `engine-e2e-all.yml`, `engine-memory.yml`, `engine-performance.yml`.
- Added `.github/workflows/engine-tests.yml` — single matrix workflow with a `build` job that uploads `engine-dist` and a `test` job that fans out to 7 lanes (`fitl-events`, `fitl-rules`, `texas-cross-game`, `slow-parity`, `e2e-all`, `memory`, `performance`) and downloads the prebuilt artifact. `fail-fast: false`, per-lane `timeout-minutes` from a matrix `lane.timeout` field, shared concurrency group `engine-tests-${{ github.ref }}`.
- `ci.yml` and `engine-determinism.yml` left untouched per design.

**Deviations from original plan**:

- **Lint test rewrite (not in original plan).** `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` referenced six of the deleted workflows and would have failed after their removal. Per 1-3-1 user approval, the test was rewritten to validate `engine-tests.yml`'s consolidated path filters (push/pull_request parity, uniqueness, required shared filters present, self-reference present). The architectural-invariant intent (path-filter correctness) is preserved against the new single-workflow shape.

**Verification results**:

- `git status --short .github/workflows/` shows 9 deletions + 1 addition (`engine-tests.yml`).
- Python YAML structural check on `engine-tests.yml`: `OK: 7 lanes`.
- `grep -rn '<removed-names>' .github/`: no matches.
- `pnpm -F @ludoforge/engine build`: passes.
- `pnpm -F @ludoforge/engine lint`: passes.
- `pnpm -F @ludoforge/engine typecheck`: passes.
- Rewritten lint test (`engine-special-suite-workflow-path-policy.test.ts`) passes against `engine-tests.yml`.
- Phase 1 branch-protection snapshot: `gh api .../required_status_checks` returned 404 — `main` is not protected. Phase 4 reconciliation is therefore a no-op as the design anticipated.

**Post-merge action items (Phases 4–5 from the plan)**:

- Phase 4 reconciliation is a no-op (no branch protection on `main`).
- Phase 5 post-merge verification (watching the first `engine-tests.yml` run on `main`) remains to be done after this is merged.
