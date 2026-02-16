# ENGINEAGNO-006: Harden Replay Harness Diagnostics and Policy Surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No kernel behavior change required; test/runtime tooling interface hardening
**Deps**: ENGINEAGNO-004

## Problem

Replay failures originating from `applyMove` currently bubble up without guaranteed per-step replay context (step index, phase, active player, selected key vars). Also, bounded phase advancement helper does not expose execution-policy passthrough, limiting reuse for policy-sensitive deterministic scenarios.

For long-term game-agnostic validation of arbitrary `GameSpecDoc` games, replay tooling must always produce actionable diagnostics and offer complete game-agnostic policy controls.

## What to Change

1. Wrap replay `applyMove` failures with deterministic step-context diagnostics:
   - step index
   - move/action
   - current phase
   - active player
   - key vars snapshot
2. Preserve original error reason/details as nested cause or appended detail.
3. Extend bounded phase-advance helper config to accept optional execution policy passthrough.
4. Keep API game-agnostic (no game-specific policy fields or assumptions).

## Invariants

1. Every replay step failure includes actionable replay context.
2. Root failure reason from kernel/runtime remains visible and inspectable.
3. Bounded advance helper supports same deterministic policy semantics as underlying kernel call paths.
4. No game-specific branching in helper APIs.

## Tests

1. Unit: replay step failure from `applyMove` includes required step-context fields.
2. Unit: wrapped replay error retains original failure signal/message.
3. Unit: bounded phase helper forwards execution policy and preserves deterministic behavior.
4. Regression: existing replay harness tests and phase-advance tests remain green.
