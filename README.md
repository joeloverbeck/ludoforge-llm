# ludoforge-llm
Evolving board games relying on LLMs for design/judgement, and executable prototypes

## Testing Lanes
- Default engine lane: `pnpm -F @ludoforge/engine test` runs schema checks, all unit tests, and only the core integration lane.
- Engine core integration lane: `pnpm -F @ludoforge/engine test:integration:core`
- Engine game-package integration lane: `pnpm -F @ludoforge/engine test:integration:game-packages`
- Full engine integration aggregate: `pnpm -F @ludoforge/engine test:integration`
- Fast local e2e default: `pnpm -F @ludoforge/engine test:e2e`
- Slow long-run tournament regression lane: `pnpm -F @ludoforge/engine test:e2e:slow`
- Full e2e aggregate (includes slow coverage): `pnpm -F @ludoforge/engine test:e2e:all`
- Automation contract: protected branch/release CI must run `test:e2e:all`, or an equivalent split that always includes `test:e2e` and `test:e2e:slow`.

## Runner Dev Bootstrap
- Generate all runner bootstrap fixtures: `pnpm -F @ludoforge/runner bootstrap:fixtures`
- Check fixture drift (fails on stale fixtures): `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
- Start runner: `pnpm -F @ludoforge/runner dev`
- FITL URL: `http://localhost:5173/?game=fitl`
- Texas URL: `http://localhost:5173/?game=texas`

## Schema Artifacts
- Source-of-truth schemas in `src/kernel/schemas-core.ts` define all generated artifacts:
  - `GameDef.schema.json` from `GameDefSchema`
  - `Trace.schema.json` from `SerializedGameTraceSchema`
  - `EvalReport.schema.json` from `SerializedEvalReportSchema`
- Regenerate after contract changes: `npm run schema:artifacts:generate`
- Verify sync (used by `npm test`): `npm run schema:artifacts:check`
