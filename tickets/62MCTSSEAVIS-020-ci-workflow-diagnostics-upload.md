# 62MCTSSEAVIS-020: CI Workflow YAML — Diagnostics Upload

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — CI config only
**Deps**: archive/tickets/62MCTSSEAVIS-005-ci-diagnostics-and-console-visitor.md

## Problem

MCTS diagnostics JSONL files need to be uploaded as CI artifacts for post-analysis. All 6 `engine-mcts-*.yml` workflow files need the `MCTS_DIAGNOSTICS_DIR` env var and `actions/upload-artifact@v4` step.

## What to Change

### 1. Add env var to all 6 workflow files

```yaml
env:
  MCTS_DIAGNOSTICS_DIR: ${{ runner.temp }}/mcts-diagnostics
```

### 2. Add artifact upload step

```yaml
- name: Upload MCTS diagnostics
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: mcts-diagnostics-${{ matrix.scenario || 'all' }}
    path: ${{ env.MCTS_DIAGNOSTICS_DIR }}
    retention-days: 14
    if-no-files-found: ignore
```

### 3. Final verification

Run full build/lint/typecheck/test pipeline:
```bash
pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test
```

## Files to Touch

- `.github/workflows/engine-mcts-*.yml` (all 6 files — modify)

## Out of Scope

- CiDiagnosticsReporter implementation (already in 62MCTSSEAVIS-005)
- Production source code changes
- Non-MCTS workflow files
- Workflow restructuring or consolidation

## Acceptance Criteria

### Tests That Must Pass

1. All 6 workflow YAML files are valid (parseable YAML)
2. `MCTS_DIAGNOSTICS_DIR` env var is set in each workflow
3. Artifact upload step uses `if: always()` and `if-no-files-found: ignore`
4. Retention is 14 days
5. Full pipeline passes: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

### Invariants

1. Existing workflow behavior unchanged — only additive changes
2. Artifact upload does not block on missing files (`if-no-files-found: ignore`)
3. Upload happens even on failure (`if: always()`)

## Test Plan

### Commands

1. Validate YAML syntax for all modified files
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
