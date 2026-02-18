# ludoforge-llm
Evolving board games relying on LLMs for design/judgement, and executable prototypes

## Testing Lanes
- Fast local e2e default: `pnpm -F @ludoforge/engine test:e2e`
- Slow long-run tournament regression lane: `pnpm -F @ludoforge/engine test:e2e:slow`
- Full e2e lane (includes slow coverage): `pnpm -F @ludoforge/engine test:e2e:all`
- Automation contract: protected branch/release CI must run the full e2e lane (`test:e2e:all`) or an equivalent split that always includes `test:e2e:slow`.

## Schema Artifacts
- Source-of-truth schemas in `src/kernel/schemas-core.ts` define all generated artifacts:
  - `GameDef.schema.json` from `GameDefSchema`
  - `Trace.schema.json` from `SerializedGameTraceSchema`
  - `EvalReport.schema.json` from `SerializedEvalReportSchema`
- Regenerate after contract changes: `npm run schema:artifacts:generate`
- Verify sync (used by `npm test`): `npm run schema:artifacts:check`
