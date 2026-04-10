# 123BATREDENU-003: Migrate FITL redeploy actions to parameterless batch form

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — YAML data change only
**Deps**: `archive/tickets/123BATREDENU-002.md`

## Problem

Blocked by `archive/tickets/123BATREDENU-002.md`, which is itself blocked after `archive/tickets/123BATREDENU-001.md` found the underlying probing-gap premise to be non-repro on current `main`.

FITL's 4 Coup redeploy actions use a hybrid workaround: `sourceSpace` as an action param with `forEach.over: { query: tokensInZone, zone: sourceSpace }`. This produces one move per eligible source zone. With the probing fix from ticket 002, these can be converted to fully parameterless batch form — one move per action type — dramatically reducing move count and enabling multi-Coup-cycle simulations within the 100-move budget.

## Archival Note

Archived without implementation on 2026-04-10 because the migration rationale depends on the disproved probing-gap premise recorded in `archive/tickets/123BATREDENU-001.md`.

## Boundary Correction (2026-04-10)

Do not perform this migration until a live, verified need is re-established. The current draft rationale depends on the stale assumption that parameterless redeploy still requires an engine probing fix.

## Assumption Reassessment (2026-04-10)

1. The 4 redeploy actions are defined in `data/games/fire-in-the-lake/30-rules-actions.md` at lines 602 (`coupArvnRedeployMandatory`), 711 (`coupArvnRedeployOptionalTroops`), 821 (`coupArvnRedeployPolice`), 892 (`coupNvaRedeployTroops`) — confirmed this session.
2. All 4 use `params: [sourceSpace]` with `domain: { query: mapSpaces }` — confirmed.
3. All 4 use `forEach.over: { query: tokensInZone, zone: sourceSpace }` with `chooseOne.options: { query: mapSpaces }` for destination selection — confirmed.
4. `coupRedeployPass` (line 955) is already parameterless — no migration needed.
5. The probing fix from ticket 002 enables parameterless actions with `forEach` + embedded decisions to enumerate correctly.

## Architecture Check

1. The migration converts action params from `[sourceSpace]` to `[]` and wraps the existing effects in an outer `forEach.over: { query: mapSpaces, filter: ... }` — a declarative YAML change, no engine code touched.
2. The preconditions that currently filter on `sourceSpace` move into the outer `forEach` filter — same logic, different structural location.
3. No backwards-compatibility shims — the hybrid form is fully replaced (F14).
4. The parameterless form is the spec-intended pattern — this completes the batch redesign.

## What to Change

### 1. Rewrite `coupArvnRedeployMandatory` (line 602)

- Remove `params: [sourceSpace]` → set `params: []`
- Move the `sourceSpace`-dependent precondition logic into the outer `forEach` filter
- Wrap effects in outer `forEach.over: { query: mapSpaces, filter: <eligible-zone-filter> }` with bind `$sourceZone`
- Update inner `forEach.over` to use `zone: { zoneExpr: { ref: binding, name: $sourceZone } }` instead of `zone: { zoneExpr: { ref: binding, name: sourceSpace } }`
- Simplify the `pre:` to only check global conditions (active player, etc.) that don't depend on a specific source zone
- Update the `chooseOne` destination options filter if it references `sourceSpace`

### 2. Rewrite `coupArvnRedeployOptionalTroops` (line 711)

Same structural transformation as section 1, adapted to this action's specific zone eligibility and token filters.

### 3. Rewrite `coupArvnRedeployPolice` (line 821)

Same structural transformation. Police redeploy has additional destination restrictions (South Vietnam LoCs or COIN-controlled) — these stay in the inner `chooseOne.options` filter.

### 4. Rewrite `coupNvaRedeployTroops` (line 892)

Same structural transformation. NVA redeploy restricts destinations to spaces with NVA bases — stays in the inner `chooseOne.options` filter.

### 5. Verify compilation

Run the FITL compiler to confirm all 4 rewritten actions compile without errors. Fix any compilation failures before proceeding.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — lines 602-954, 4 action definitions)

## Out of Scope

- Engine code changes (ticket 002 handles the probing fix)
- Test updates (ticket 004)
- Golden fixture regeneration (ticket 004)
- The `coupRedeployPass` action (already parameterless)

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameSpecDoc compiles without errors: `pnpm -F @ludoforge/engine build`
2. The compiled GameDef contains the 4 redeploy actions with `params: []`
3. Existing suite: `pnpm turbo build` — compilation succeeds across all packages

### Invariants

1. The 4 redeploy actions remain semantically equivalent — same zones, same tokens, same destination logic
2. No engine source code is modified
3. `coupRedeployPass` is unchanged

## Test Plan

### New/Modified Tests

1. No new tests in this ticket — test updates are in ticket 004

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo build`
