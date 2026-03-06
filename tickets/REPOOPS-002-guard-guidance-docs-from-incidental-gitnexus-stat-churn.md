# REPOOPS-002: Guard Guidance Docs from Incidental GitNexus Stat Churn

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — repo tooling/documentation workflow guard
**Deps**: archive/tickets/REPOOPS/REPOOPS-001-stabilize-gitnexus-header-stats-in-guidance-docs.md

## Problem

Running index tooling can update GitNexus symbol/edge counts in `AGENTS.md` and `CLAUDE.md` even when no documentation policy change is intended. These incidental edits create review noise and merge-conflict risk.

## Assumption Reassessment (2026-03-06)

1. GitNexus analyze operations can rewrite guidance header stats in `AGENTS.md` and `CLAUDE.md`.
2. Current checks do not fail when those files change only by numeric stat churn.
3. Mismatch: repository quality gates currently allow accidental doc metadata churn to ride along with unrelated code changes.

## Architecture Check

1. A targeted guardrail is cleaner than relying on manual reviewer discipline for this recurring noise source.
2. This does not affect GameSpecDoc/GameDef/runtime behavior; it is workflow integrity only.
3. No backwards-compatibility shim is introduced; the policy is explicit and enforced.

## What to Change

### 1. Add a deterministic check for incidental GitNexus stat-only edits

Implement a script that detects stat-count-only modifications in `AGENTS.md`/`CLAUDE.md` and fails unless an explicit override flag is provided.

### 2. Integrate the check into repository quality gates

Wire the script into existing root validation commands so accidental churn is blocked before merge.

### 3. Document the override workflow

Document when and how to intentionally accept guidance-stat updates.

## Files to Touch

- `scripts/` (add a dedicated check script)
- `package.json` (modify scripts wiring)
- `AGENTS.md` (modify, documentation on override path if needed)
- `CLAUDE.md` (modify, documentation on override path if needed)
- `tickets/README.md` (modify, if ticket workflow should reference the new guard)

## Out of Scope

- Changes to engine/runtime/kernel behavior.
- Replacing GitNexus tooling.

## Acceptance Criteria

### Tests That Must Pass

1. Quality gate fails when `AGENTS.md`/`CLAUDE.md` contain stat-only churn without explicit override.
2. Quality gate passes for intentional updates when explicit override is set.
3. Existing suite: `pnpm run check:ticket-deps` and repository default checks pass.

### Invariants

1. Incidental doc stat churn cannot silently land with unrelated changes.
2. Enforcement stays tooling-level and game-agnostic.

## Test Plan

### New/Modified Tests

1. Script-level test/fixture for stat-only diff detection (or equivalent deterministic harness) — ensures false positives are controlled.
2. CI-script integration assertion — verifies guard runs in standard check path.

### Commands

1. `pnpm run check:ticket-deps`
2. `<new-guard-script-command>`
3. `pnpm test`
