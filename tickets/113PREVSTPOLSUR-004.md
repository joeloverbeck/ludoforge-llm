# 113PREVSTPOLSUR-004: Diagnostics, cookbook, and integration test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent diagnostics; documentation and tests
**Deps**: `archive/tickets/113PREVSTPOLSUR-003.md`, `specs/113-preview-state-policy-surface.md`

## Problem

With `preview.feature.*` refs compiled and evaluated (tickets 001-003), the trace output needs to correctly include preview-feature refs in diagnostic reporting. The cookbook needs documentation so LLM-driven evolution discovers the new ref path. An integration test must verify the full pipeline with FITL data.

## Assumption Reassessment (2026-04-05)

1. `previewRefIds` and `unknownPreviewRefs` on `PolicyEvaluationCandidate` track preview refs — confirmed at `policy-evaluation-core.ts:51-54`.
2. `previewRefKey()` at `policy-evaluation-core.ts:882` generates ref IDs for diagnostics — confirmed.
3. `PolicyPreviewUsageTrace.refIds` at `types-core.ts:1558` reports which preview refs were evaluated — confirmed.
4. Cookbook has a Preview References table at `docs/agent-dsl-cookbook.md:76-83` — confirmed.
5. FITL has state features (`vcGuerrillaCount`, `vcBaseCount`) that would produce different values on preview vs current state — confirmed in `92-agents.md`.

## Architecture Check

1. Diagnostics are a read-only projection — no behavioral changes. Foundation 9 (Auditability).
2. Preview-feature refs appear alongside existing preview refs in trace output — consistent format.
3. Integration test uses FITL data but verifies generic behavior (preview-feature evaluation against different states).

## What to Change

### 1. Ensure preview-feature refs appear in diagnostic trace

Verify that the `previewRefIds` and `unknownPreviewRefs` tracking from ticket 003 correctly flows into:
- `PolicyPreviewUsageTrace.refIds` (reported in agent decision traces)
- `PolicyPreviewUsageTrace.unknownRefs` (reported when preview is unavailable)

The `previewRefKey()` function may need updating if it doesn't handle `feature.*` ref IDs (currently formats as `"${family}.${id}"`). Preview-feature refs should appear as `"feature.<id>"` in the trace.

### 2. Document `preview.feature.*` in cookbook (`docs/agent-dsl-cookbook.md`)

Add to the Preview References table:

```markdown
| `preview.feature.<id>` | varies | authored state feature evaluated on preview state |
```

Add a usage pattern:

```yaml
candidateFeatures:
  projectedVcGuerrillaCount:
    type: number
    expr:
      coalesce:
        - { ref: preview.feature.vcGuerrillaCount }
        - { ref: feature.vcGuerrillaCount }
```

Add note: "`preview.feature.*` reuses authored `stateFeatures` definitions — there is no separate preview feature library. One definition, two evaluation contexts (current and preview). Always wrap in `coalesce` since preview may be unavailable."

### 3. FITL integration test

Create a test that:
1. Compiles the FITL game spec with its state features (`vcGuerrillaCount`, `vcBaseCount`)
2. Sets up a game state and a preview state where token counts differ (e.g., preview state has more guerrillas after a Rally)
3. Evaluates `feature.vcGuerrillaCount` → returns current-state count
4. Evaluates `preview.feature.vcGuerrillaCount` → returns preview-state count (different)
5. Verifies trace includes `feature.vcGuerrillaCount` in `previewRefIds`

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify, if `previewRefKey` needs updating)
- `docs/agent-dsl-cookbook.md` (modify)
- `packages/engine/test/integration/agents/preview-feature-surface.test.ts` (new)

## Out of Scope

- No changes to evaluation logic (ticket 003)
- No changes to compilation (ticket 002)
- No changes to agent profile YAML
- No game data changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration: `preview.feature.vcGuerrillaCount` returns a different value from `feature.vcGuerrillaCount` when preview state has different token counts
2. FITL integration: preview-feature ref appears in trace `previewRefIds`
3. FITL integration: unavailable preview → ref appears in `unknownPreviewRefs`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic trace format is consistent with existing preview ref reporting
2. Cookbook examples use correct types and `coalesce` pattern
3. No game-specific engine logic in integration test (tests generic behavior with FITL data)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/preview-feature-surface.test.ts` — end-to-end FITL test for preview-feature evaluation and diagnostics

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/agents/preview-feature-surface.test.js`
2. `pnpm -F @ludoforge/engine test`
