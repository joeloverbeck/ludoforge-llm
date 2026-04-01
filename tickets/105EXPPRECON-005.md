# 105EXPPRECON-005: Migrate YAML profiles, JSON schema, and golden fixtures

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — GameDef.schema.json, data files, test fixtures
**Deps**: `tickets/105EXPPRECON-002.md`, `tickets/105EXPPRECON-003.md`, `tickets/105EXPPRECON-004.md`, `specs/105-explicit-preview-contracts.md`

## Problem

With the type system, compiler, runtime, and trace changes in place (tickets 001-004), the YAML data files, JSON schema, and golden test fixtures still reference `tolerateRngDivergence`. Foundation 14 (No Backwards Compatibility) requires all owned artifacts to be migrated in the same change — no compatibility shims, no deprecated fallbacks.

## Assumption Reassessment (2026-04-01)

1. FITL `data/games/fire-in-the-lake/92-agents.md` has `vc-evolved` profile with `preview: { tolerateRngDivergence: true }` at line 314-315. Only this one profile has preview config. Confirmed.
2. Texas Hold'em `data/games/texas-holdem/92-agents.md` has no preview config on the `baseline` profile. Confirmed.
3. `GameDef.schema.json` includes `tolerateRngDivergence` in agent profile schema. Confirmed.
4. No other data files reference `tolerateRngDivergence`. Confirmed.

## Architecture Check

1. YAML migration is a data-level change — game-specific content in GameSpecDoc, not engine code.
2. JSON schema update reflects the compiled IR shape change from ticket 001.
3. All owned artifacts migrated together — no partial migration, no compatibility shims (Foundation 14).

## What to Change

### 1. Migrate FITL `vc-evolved` profile

In `data/games/fire-in-the-lake/92-agents.md`, change:
```yaml
vc-evolved:
  observer: currentPlayer
  preview:
    tolerateRngDivergence: true
```
To:
```yaml
vc-evolved:
  observer: currentPlayer
  preview:
    mode: tolerateStochastic
```

### 2. Add Texas Hold'em preview config

In `data/games/texas-holdem/92-agents.md`, add preview config to the `baseline` profile:
```yaml
baseline:
  observer: public
  preview:
    mode: disabled
```

### 3. Update `GameDef.schema.json`

Replace `tolerateRngDivergence` in the agent profile preview schema with:
```json
{
  "mode": {
    "type": "string",
    "enum": ["exactWorld", "tolerateStochastic", "disabled"]
  }
}
```

### 4. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate any derived schema files.

### 5. Update golden test fixtures

Any compiled GameDef golden snapshots or trace golden files that include `tolerateRngDivergence` or the old preview shape must be regenerated.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `data/games/texas-holdem/92-agents.md` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify)
- Golden fixture files in `packages/engine/test/` (modify — as discovered during implementation)

## Out of Scope

- Engine source code changes (completed in tickets 001-004)
- Adding new game profiles
- Changing observer assignments (owned by Spec 102)

## Acceptance Criteria

### Tests That Must Pass

1. FITL compilation succeeds with `mode: tolerateStochastic` — `vc-evolved` profile compiles correctly
2. Texas Hold'em compilation succeeds with `mode: disabled` — `baseline` profile compiles correctly
3. FITL policy agent integration test passes with behavioral equivalence to pre-migration
4. `pnpm turbo schema:artifacts` produces clean output
5. No remaining references to `tolerateRngDivergence` anywhere in the codebase (grep verification)
6. Full suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

### Invariants

1. Zero occurrences of `tolerateRngDivergence` in source, tests, data, or schemas after this ticket
2. FITL `vc-evolved` with `tolerateStochastic` produces identical move selections as the pre-migration `tolerateRngDivergence: true` (behavioral equivalence)
3. All JSON schema validations pass — `GameDef.schema.json` is consistent with compiled output

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — update preview config references, verify behavioral equivalence
2. `packages/engine/test/unit/schemas-top-level.test.ts` — update schema golden if affected
3. `packages/runner/test/config/visual-config-files.test.ts` — verify no impact (preview is not visual config)

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `grep -rn 'tolerateRngDivergence' packages/ data/ --include='*.ts' --include='*.md' --include='*.json'` — must return zero results
