# RUNBOOTFIX-001: Decide and Refresh Runner Bootstrap Fixture Drift

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None expected — fixture/tooling decision only unless reassessment proves generator drift comes from engine compilation changes
**Deps**: `docs/FOUNDATIONS.md`, `packages/runner/src/bootstrap/README.md`, `packages/runner/scripts/bootstrap-fixtures.mjs`, `packages/runner/src/bootstrap/fitl-game-def.json`, `packages/runner/src/bootstrap/texas-game-def.json`

## Problem

During the ARVN profile promotion work on 2026-05-22, the scoped profile rename required touching the FITL bootstrap fixture. Running the canonical runner drift check exposed broader generated-output drift:

```bash
pnpm -F @ludoforge/runner bootstrap:fixtures:check
```

reported:

```text
Bootstrap fixture drift detected:
- fitl: game-def fixture content differs from generated output (.../packages/runner/src/bootstrap/fitl-game-def.json)
- texas: game-def fixture content differs from generated output (.../packages/runner/src/bootstrap/texas-game-def.json)
```

The broad generator output changed unrelated Texas fixture content, so the ARVN rename intentionally did not commit a full bootstrap regeneration. This ticket owns the separate decision: either bless the current generator output deliberately, or identify and fix the cause of unintended drift before refreshing fixtures.

## Assumption Reassessment (2026-05-22)

1. `packages/runner/src/bootstrap/README.md` documents `pnpm -F @ludoforge/runner bootstrap:fixtures` and `bootstrap:fixtures:check` as the canonical fixture lifecycle.
2. The live check currently reports drift for both FITL and Texas game-def fixtures, not only the FITL profile rename surface.
3. The scoped ARVN change updated only the needed FITL profile key/removal and binding in `packages/runner/src/bootstrap/fitl-game-def.json`; it did not accept the full generated rewrite because that rewrite included unrelated Texas drift.

## Architecture Check

1. The decision must preserve the existing separation: production game behavior remains authored in `GameSpecDoc`; runner bootstrap JSON is generated fixture material, not a second rules source.
2. If the generator output is correct, refresh fixtures through the canonical script instead of hand-editing generated structure.
3. If the generator output is unexpectedly broad, fix the generator/compiler determinism or formatting source before blessing artifacts. Do not add compatibility aliases or profile-name shims.

## What to Change

### 1. Reproduce and Classify Drift

Run the canonical check and, if needed, generate fixtures in a disposable diff to inspect exactly what changes for FITL and Texas.

Classify each drift chunk as one of:

- Expected consequence of current `GameSpecDoc` / compiler output.
- Pre-existing stale fixture output that should be blessed.
- Unexpected generator/compiler instability that must be fixed before fixture refresh.

### 2. Apply the Chosen Fixture Decision

If the generated output is correct, run:

```bash
pnpm -F @ludoforge/runner bootstrap:fixtures
```

and commit the resulting `*-game-def.json` / `*-game-metadata.json` changes that are explained by the reassessment.

If the generated output is not correct, patch the smallest generator/compiler/tooling cause, then regenerate and verify.

## Files to Touch

- `packages/runner/src/bootstrap/fitl-game-def.json` (modify, if drift is blessed)
- `packages/runner/src/bootstrap/fitl-game-metadata.json` (modify only if generator changes it)
- `packages/runner/src/bootstrap/texas-game-def.json` (modify, if drift is blessed)
- `packages/runner/src/bootstrap/texas-game-metadata.json` (modify only if generator changes it)
- `packages/runner/scripts/bootstrap-fixtures.mjs` (modify only if drift source is tooling)
- `packages/engine/src/cnl/**` (modify only if reassessment proves compiler output instability)

## Out of Scope

- Reintroducing `arvn-evolved` or any alias profile.
- Changing FITL or Texas authored gameplay semantics to make fixture diffs smaller.
- Broad runner UI or bootstrap registry redesign.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
2. `pnpm -F @ludoforge/runner test test/bootstrap/bootstrap-fixtures-script.test.ts test/bootstrap/runner-bootstrap.test.ts`
3. Existing targeted engine compile check if compiler/tooling code changes: `pnpm -F @ludoforge/engine build`

### Invariants

1. Runner bootstrap fixtures match canonical generation output after the chosen decision.
2. No production code accepts legacy `arvn-evolved` as a compatibility alias.
3. FITL and Texas fixture changes are explained in the ticket outcome, especially if both game-def fixtures change.

## Test Plan

### New/Modified Tests

1. No new tests required if this is a fixture refresh only.
2. Add or update `packages/runner/test/bootstrap/bootstrap-fixtures-script.test.ts` only if the generator/check behavior changes.

### Commands

1. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
2. `pnpm -F @ludoforge/runner bootstrap:fixtures`
3. `pnpm -F @ludoforge/runner test test/bootstrap/bootstrap-fixtures-script.test.ts test/bootstrap/runner-bootstrap.test.ts`
4. `pnpm -F @ludoforge/engine build`
