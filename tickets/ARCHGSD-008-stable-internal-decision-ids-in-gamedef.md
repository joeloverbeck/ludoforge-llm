# ARCHGSD-008 - Stable Internal Decision IDs in GameDef (Decouple From DSL Bind Strings)

**Status**: TODO  
**Priority**: P1  
**Type**: Architecture / Runtime Contract  
**Depends on**: `ARCHGSD-006`, `ARCHGSD-007`

## Why this ticket exists
Decision identity is currently tied to DSL bind strings. This couples runtime behavior to author-facing names and makes refactors harder.

## 1) Specification (what must change)
- Add compiler-generated stable internal decision IDs to `GameDef` decision points.
- Keep DSL bind strings as author-facing labels only.
- Update `legalChoices` / decision sequence resolution / application paths to use internal IDs for identity and deterministic ordering.
- Preserve external move-param authoring UX by maintaining explicit mapping between exported bind names and internal IDs.
- No alias/back-compat dual-mode; migrate all affected call sites.

## 2) Invariants (must remain true)
- Decision sequence determinism remains stable across equivalent specs.
- Runtime is independent of game-specific naming conventions.
- Compiler remains the only layer translating `GameSpecDoc` names into runtime identifiers.

## 3) Tests to add/modify
## New tests
- `test/unit/kernel/legal-choices.test.ts`
  - internal ID stability independent of display bind text.
- `test/unit/kernel/move-decision-sequence.test.ts`
  - completion based on internal IDs and explicit mapping.
- `test/integration/decision-sequence.test.ts`
  - deterministic choice flow after bind-name refactor.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
