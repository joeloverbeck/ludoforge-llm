# 64DECVICMET-001: Expose synthesized derived metrics in FITL observer profile

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — observer/agent compilation plumbing for synthesized derived metric ids
**Deps**: None

## Problem

The FITL observer profile in `93-observability.md` does not declare a `derivedMetrics` surface. The compiler default for undeclared surfaces is `hidden` (`packages/engine/src/cnl/compile-observers.ts:45`). This means synthesized derived metrics (for example `auto:victory:controlledPopulation:coin`) remain invisible to agents even though the engine supports metric references via `ref: metric.<id>`.

Live reassessment on 2026-04-11 showed the draft ticket boundary was too narrow: adding `_default: public` in FITL data alone does **not** expose synthesized metrics. `compiler-core` currently passes only authored `doc.derivedMetrics` ids into observer validation/lowering and agent policy metric surfaces, while FITL’s needed metrics are synthesized later from `victoryStandings`.

## Assumption Reassessment (2026-04-11)

1. `data/games/fire-in-the-lake/93-observability.md` exists and contains the `currentPlayer` observer profile with `surfaces:` — confirmed via read this session.
2. `GameSpecObserverSurfacesDef` in `packages/engine/src/cnl/game-spec-doc.ts:543` already has a `derivedMetrics?: GameSpecObserverSurfaceValue` field — confirmed via read this session.
3. The compiler auto-synthesizes derived metrics from victory standings (`packages/engine/src/cnl/synthesize-derived-metrics.ts`). FITL produces `auto:victory:controlledPopulation:coin` in the compiled GameDef — confirmed via compile and bootstrap fixture inspection this session.
4. The default visibility for `derivedMetrics` when not declared in the observer profile is `hidden` — confirmed at `packages/engine/src/cnl/compile-observers.ts:45`.
5. Blocking discrepancy: `packages/engine/src/cnl/compiler-core.ts` feeds observer validation, observer lowering, and `policyMetricIds` from `resolvedTableRefDoc.derivedMetrics`, which excludes synthesized metrics. After a provisional FITL `_default: public` change, the compiled FITL observer surface still emitted `{}` for `currentPlayer.surfaces.derivedMetrics` — confirmed this session.

## Architecture Check

1. The real fix belongs at the compiler authority point, not in FITL-only data. Observer and agent compilation must consume the merged derived-metric set after synthesis.
2. The engine change remains generic: it plumbs synthesized metric ids through existing generic observer/agent contracts rather than adding FITL-specific logic (Foundation 1).
3. The FITL YAML change is still required so `currentPlayer` intentionally exposes the synthesized metrics once the compiler knows they exist.
4. No compatibility shims are introduced. Built-in observer defaults remain unchanged unless the spec explicitly overrides them.

## What to Change

### 1. Fix compiler-known derived metric ids after synthesis

In `packages/engine/src/cnl/compiler-core.ts`, use the merged derived metric set (`sections.derivedMetrics` after synthesis) when:

- validating observer surface ids
- lowering observer surfaces
- supplying `policyMetricIds` to agent compilation

This ensures synthesized victory-derived metrics participate in the same generic visibility and agent-surface contracts as authored derived metrics.

### 2. Expose derived metrics in FITL `currentPlayer` observer

In `data/games/fire-in-the-lake/93-observability.md`, add:

```yaml
        derivedMetrics:
          _default: public
```

This should expose synthesized victory metrics such as `auto:victory:controlledPopulation:coin` to agents using the `currentPlayer` observer profile.

### 3. Regenerate FITL bootstrap fixture and verify output

Regenerate the FITL runner bootstrap fixture so repo-owned compiled artifacts reflect the new observer catalog. Confirm the compiled FITL GameDef includes a public `currentPlayer.surfaces.derivedMetrics["auto:victory:controlledPopulation:coin"]` entry.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify)
- `data/games/fire-in-the-lake/93-observability.md` (modify)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify)
- `tickets/64DECVICMET-001.md` (modify)

## Out of Scope

- Agent profile changes in `92-agents.md` (covered by 64DECVICMET-002)
- Adding new derived metric definitions beyond the existing synthesis from victory standings
- Changing observer visibility for any surface family besides FITL `derivedMetrics`
- Modifying built-in `default` or `omniscient` observer behavior

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles without diagnostics after the compiler plumbing fix and FITL observer update.
2. The compiled FITL GameDef observer catalog for `currentPlayer` includes `derivedMetrics["auto:victory:controlledPopulation:coin"]` with `current: public` and `preview.visibility: public`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The compiler fix is generic and does not special-case FITL.
2. Other observer surfaces (globalVars, perPlayerVars, victory, etc.) retain their existing visibility behavior.
3. The built-in `default` and `omniscient` observer profiles remain unaffected.
4. Synthesized derived metric ids become available to downstream generic agent policy surfaces the same way authored derived metric ids are.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — prove the compiled FITL `currentPlayer` observer exposes the synthesized `auto:victory:controlledPopulation:coin` metric publicly.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome (2026-04-11)

- Rewrote the draft boundary after reassessment: the live fix required generic compiler plumbing plus the FITL observer opt-in, not a YAML-only change.
- Updated `packages/engine/src/cnl/compiler-core.ts` so observer validation, observer lowering, and agent `policyMetricIds` consume the merged derived metric ids after synthesis from `victoryStandings`.
- Added `derivedMetrics: { _default: public }` to the FITL `currentPlayer` observer in `data/games/fire-in-the-lake/93-observability.md`.
- Added a FITL production compilation regression proof in `packages/engine/test/integration/fitl-production-data-compilation.test.ts` and refreshed the FITL policy catalog golden in `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`.
- Regenerated `packages/runner/src/bootstrap/fitl-game-def.json` and verified `currentPlayer.surfaces.derivedMetrics["auto:victory:controlledPopulation:coin"]` now equals `{ current: public, preview.visibility: public }`.
- Verification run: `pnpm turbo build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo typecheck`, plus a FITL-only bootstrap fixture check via `packages/runner/scripts/bootstrap-fixtures.mjs`.
- Residual repo state: unrelated pre-existing changes remain in `.claude/skills/reassess-spec/SKILL.md`, `specs/64-decomposed-victory-metrics.md`, and untracked draft sibling `tickets/64DECVICMET-002.md`.
