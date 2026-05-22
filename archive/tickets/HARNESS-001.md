# HARNESS-001: Make implement-spec state validator argument order match documented usage

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — Codex harness tooling only
**Deps**: `.codex/skills/implement-spec-tickets/SKILL.md`

## Problem

During the `191PLAROLSEM-001` state-only follow-up commit on 2026-05-22, the documented pre-commit validation command shape failed when invoked with the state path after the flag:

`node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs --allow-only-state-file-dirty .codex/run-state/implement-spec-tickets.json`

The validator reported `dirty_state cannot be clean when git status has entries` even though the only dirty path was `.codex/run-state/implement-spec-tickets.json` and the state file truthfully described the expected post-state-commit repo as `dirty_state: "clean"`. The same failure also occurred with the path before the flag. The final post-commit validator passed once the worktree was clean, so the failure appears limited to the transient pre-state-commit allowance.

The harness skill explicitly instructs this allowance mode for state-file-only commits, so a documented command that does not work forces manual validation at exactly the point where the workflow wants deterministic tooling.

## Assumption Reassessment (2026-05-22)

1. `.codex/skills/implement-spec-tickets/SKILL.md` documents the state-only pre-commit validator command with `--allow-only-state-file-dirty` and the state path in the same invocation.
2. `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs` detects the flag with `args.includes('--allow-only-state-file-dirty')`, but derives `statePath` from the first non-flag argument and compares `git status --short` rows with `line.slice(3) === statePath`.
3. The observed failure shows the allowance path is too brittle for the actual `git status --short` shape and/or supported argument ordering, so the validator should be made robust instead of relying on manual pre-commit validation.

## Architecture Check

1. This is workflow tooling only; it does not affect GameSpecDoc, GameDef, the compiler, kernel, runtime, runner, or generated artifacts.
2. The fix should make the retained validator enforce the existing documented contract rather than adding a compatibility shim in product code.
3. A focused regression test for the script protects the state-only handoff workflow and reduces future manual proof exceptions.

## What to Change

### 1. Fix allowance matching in the validator

Update `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs` so `--allow-only-state-file-dirty` succeeds when the only dirty worktree entry is the configured state file and the state file records expected post-commit `dirty_state: "clean"`.

The fix should support both documented and reasonable CLI forms:

- `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs --allow-only-state-file-dirty .codex/run-state/implement-spec-tickets.json`
- `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json --allow-only-state-file-dirty`

### 2. Add focused regression coverage

Add or extend a small script-level test that creates a temporary repo or equivalent controlled fixture, makes only the state file dirty, writes a state file with expected post-commit `dirty_state: "clean"`, and verifies both argument orders pass. Also verify that the allowance still rejects dirty paths other than the state file.

## Files to Touch

- `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs` (modify)
- `.codex/skills/implement-spec-tickets/scripts/` or an existing repo test location (new/modify focused validator regression test)
- `.codex/skills/implement-spec-tickets/SKILL.md` (modify only if the implementation intentionally narrows or changes the documented CLI contract)

## Out of Scope

- Rewriting the implement-spec harness workflow.
- Changing state-file vocabulary or adding a new `dirty_state` value.
- Product engine/compiler/runtime changes.

## Acceptance Criteria

### Tests That Must Pass

1. The focused validator regression proves both flag/path argument orders pass when only `.codex/run-state/implement-spec-tickets.json` is dirty and the state records post-commit `dirty_state: "clean"`.
2. The same regression proves allowance mode rejects an additional dirty file.
3. Existing workflow sanity: `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json` still passes on a clean worktree with a valid state file.

### Invariants

1. `last_work_commit: "self"` remains rejected.
2. Non-`none` commit SHAs remain validated as reachable commits.
3. The allowance applies only to the transient state-file-only dirty case and never masks unrelated dirty work.

## Test Plan

### New/Modified Tests

1. Focused validator script regression — covers state-only dirty allowance success and rejection cases.

### Commands

1. `<focused validator regression command>`
2. `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json`
3. `pnpm run check:ticket-deps`

## Outcome (2026-05-22)

- **Status**: COMPLETED.
- **Completion date**: 2026-05-22.
- **What landed**:
  - Updated `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs` so allowance-mode dirty-path matching normalizes repository-relative state paths and parses both normal `XY path` rows and the trimmed unstaged `M path` shape produced by the retained `git()` helper.
  - Added `.codex/skills/implement-spec-tickets/scripts/validate-state.test.mjs` with temp-repo coverage for clean validation without the allowance flag, both documented flag/path orders, rejection when an additional dirty path is present, and the retained commit-validation invariants.
- **Verified-no-edit**:
  - `.codex/skills/implement-spec-tickets/SKILL.md` already documents the intended CLI contract; no documentation change was needed because the implementation preserves that contract.
- **Generated/schema fallout**: None; Codex harness script/test only.
- **Command ledger**:
  - `Commands | <focused validator regression command> | replaced placeholder | node --test .codex/skills/implement-spec-tickets/scripts/validate-state.test.mjs`
  - `Commands | node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json | covered by clean-worktree regression subtest | direct repo-root invocation is expected to reject while this ticket's own files are dirty`
  - `Commands | pnpm run check:ticket-deps | run directly | final graph/status integrity lane`
- **Verification**:
  - `node --test .codex/skills/implement-spec-tickets/scripts/validate-state.test.mjs` passed: 7 tests, 7 pass.
  - `pnpm run check:ticket-deps` passed before terminal status: 4 active tickets and 2491 archived tickets.
  - `pnpm run check:ticket-deps` passed after terminal status: 4 active tickets and 2491 archived tickets.
  - `git diff --check` passed for tracked changes.
  - `git diff --no-index --check /dev/null .codex/skills/implement-spec-tickets/scripts/validate-state.test.mjs` produced no whitespace diagnostics; exit 1 was the expected content-diff status.
  - `git diff --no-index --check /dev/null tickets/HARNESS-001.md` produced no whitespace diagnostics; exit 1 was the expected content-diff status.
- **Source-size check**: `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs` grew from 109 to 130 lines; `.codex/skills/implement-spec-tickets/scripts/validate-state.test.mjs` is 166 lines. No source-size hard gate triggered.
- **Late-edit proof validity**: Terminal status/proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof lanes.
