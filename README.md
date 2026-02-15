# ludoforge-llm
Evolving board games relying on LLMs for design/judgement, and executable prototypes

## Schema Artifacts
- Source-of-truth schemas in `src/kernel/schemas-core.ts` define all generated artifacts:
  - `GameDef.schema.json` from `GameDefSchema`
  - `Trace.schema.json` from `SerializedGameTraceSchema`
  - `EvalReport.schema.json` from `SerializedEvalReportSchema`
- Regenerate after contract changes: `npm run schema:artifacts:generate`
- Verify sync (used by `npm test`): `npm run schema:artifacts:check`
