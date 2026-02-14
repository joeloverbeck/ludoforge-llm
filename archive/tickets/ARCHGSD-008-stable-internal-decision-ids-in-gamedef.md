# ARCHGSD-008 - Stable Internal Decision IDs in GameDef (Decouple From DSL Bind Strings)

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Architecture / Runtime Contract  
**Depends on**: `ARCHGSD-006`, `ARCHGSD-007`

## Why this ticket exists
Decision identity is currently tied to DSL bind strings. This couples runtime behavior to author-facing names and makes refactors harder.

## Reassessed current-state assumptions
- `GameDef` does not currently model a top-level decision-point table. Decision points exist as embedded `chooseOne`/`chooseN` nodes in `EffectAST`.
- Runtime identity is bind-string based today:
  - `legalChoices()` returns pending requests keyed by `name` (bind string).
  - `resolveMoveDecisionSequence()` writes selections into `move.params[request.name]`.
  - `completeTemplateMove()` does the same.
  - `applyMove()` and pipeline dispatch treat `move.params` keys as runtime binding names.
- Existing tests for these surfaces already exist:
  - `test/unit/kernel/legal-choices.test.ts`
  - `test/unit/kernel/move-decision-sequence.test.ts`
  - `test/integration/decision-sequence.test.ts`
- Additional integration coverage already branches on `request.name` in operation helpers (not listed in original ticket), especially `test/integration/fitl-coin-operations.test.ts`.

## 1) Corrected specification (what must change)
- Introduce compiler-generated stable internal decision IDs on decision-bearing `EffectAST` nodes in `GameDef` (embedded `chooseOne`/`chooseN`), generated deterministically from compiler traversal order.
- Keep bind strings as author-facing/export-facing labels only; they must not be runtime decision identity keys.
- Add explicit mapping at decision request boundary:
  - `decisionId` (runtime identity key)
  - `name` (author-facing bind label)
- Migrate runtime loops to store and resolve pending decisions by `decisionId` while still materializing bind values for effect evaluation.
- Update validation/apply/template-completion/error payload paths that reference pending decision identity so they no longer assume bind-name identity.
- No alias/back-compat dual mode. Full migration in one pass; broken call sites must be updated.

## Architecture reassessment verdict
- The proposed migration is superior to the previous architecture:
  - It removes coupling between runtime identity and author-facing bind strings.
  - It centralizes identity generation in the compiler, preserving engine genericity.
  - It enables bind-label refactors without hidden runtime behavior changes.
- One scope correction discovered during implementation: templated/dynamic bind names (for example bind strings resolved per loop item) require per-instance disambiguation. Runtime now composes per-instance decision IDs from compiler-stable IDs plus resolved bind instance so multiple expanded decisions do not collide.
- This remains aligned with the ticket goal because runtime identity is still not bind-label keyed by default and no back-compat alias mode was introduced.

## 2) Invariants (must remain true)
- Decision sequence determinism remains stable across equivalent specs.
- Runtime is independent of game-specific naming conventions.
- Compiler remains the only layer translating `GameSpecDoc` names into runtime identifiers.
- Action param behavior remains deterministic and explicit; this ticket changes decision-point identity, not action param schema semantics.

## 3) Tests to add/modify
- `test/unit/kernel/legal-choices.test.ts`
  - add assertions for `decisionId` presence and deterministic sequencing.
  - add coverage that display bind labels can change without changing identity semantics.
- `test/unit/kernel/move-decision-sequence.test.ts`
  - ensure completion keys selected values by internal IDs.
  - ensure pending request handoff exposes both `decisionId` and `name`.
- `test/integration/decision-sequence.test.ts`
  - validate incremental pending decisions by `decisionId` while preserving display labels.
- `test/integration/fitl-coin-operations.test.ts` (or equivalent operation chooser integration tests)
  - migrate chooser branching from bind-name identity assumptions to internal decision IDs where appropriate.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/decision-sequence.test.js`

## Outcome
- **Completion date**: 2026-02-14
- **What changed**
  - Compiler now emits stable `internalDecisionId` for `chooseOne`/`chooseN` effect AST nodes.
  - Kernel/agent decision flows now key pending + selected decision values by `decisionId` rather than bind `name`.
  - AST and core runtime types/schemas were updated so decision IDs are explicit and required at decision points.
  - Dynamic templated bind decisions gained explicit per-instance composed decision IDs to prevent collisions.
  - Tests were migrated and strengthened across unit/integration suites for decision identity, sequencing, and templated-bind edge cases.
- **Deviations from original plan**
  - Added a focused helper in tests to normalize legacy bind-keyed move params to decision IDs for integration fixtures that intentionally construct manual move payloads.
  - Explicitly addressed templated bind expansion identity, which was under-specified in the original ticket text.
- **Verification**
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (149/149).
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/integration/decision-sequence.test.js` passed.
