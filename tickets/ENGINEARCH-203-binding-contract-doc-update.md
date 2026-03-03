# ENGINEARCH-203: Document Canonical Binding Contract for GameSpecDoc Authoring

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation/spec clarity only
**Deps**: tickets/README.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md

## Problem

Canonical binding identifier requirements are enforced in code but not clearly documented as a hard authoring rule for GameSpecDoc. This increases churn and avoidable invalid specs when adding games.

## Assumption Reassessment (2026-03-03)

1. Engine contracts currently enforce canonical `$name` in some binding surfaces and are moving toward stricter coverage.
2. Existing game content still uses mixed historical styles in reference docs/examples, causing ambiguity for future authors.
3. Mismatch: undocumented hard contract in code leads to authoring friction; scope is corrected to make binding syntax explicit in authoritative docs/spec guidance.

## Architecture Check

1. Explicit docs for core syntax contracts improve extensibility and reduce accidental invalid specs.
2. This keeps game-specific behavior in GameSpecDoc while reinforcing game-agnostic engine contract boundaries.
3. No compatibility shims are added; docs describe strict canonical contract only.

## What to Change

### 1. Add/clarify canonical binding rule in spec documentation

Document that binding identifiers must be canonical `$name` tokens where introduced and referenced.

### 2. Update examples to canonical form

Ensure representative examples in affected spec/rules docs use canonical bind names consistently.

### 3. Add a short authoring checklist note

Add a concise checklist entry that flags non-canonical bind names as invalid.

## Files to Touch

- `specs/29-fitl-event-card-encoding.md` (modify)
- `data/games/fire-in-the-lake/20-macros.md` (modify examples/comments if needed)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify examples/comments if needed)

## Out of Scope

- Runtime/schema behavior changes.
- Visual config documentation.
- Backfill of unrelated historical docs outside the chosen authoritative files.

## Acceptance Criteria

### Tests That Must Pass

1. Docs/spec examples reflect canonical binding syntax consistently in touched sections.
2. Existing suite remains green: `pnpm turbo test`.

### Invariants

1. Binding syntax guidance is explicit and unambiguous (`$name` only).
2. Documentation preserves GameSpecDoc vs visual-config boundary guidance.

## Test Plan

### New/Modified Tests

1. N/A (documentation-only ticket).

### Commands

1. `pnpm turbo test`
