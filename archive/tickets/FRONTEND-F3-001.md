# FRONTEND-F3-001: Define Generic Card Animation Contract in GameSpecDoc -> GameDef

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler + shared runtime schema updates
**Deps**: None

## Problem

Milestone F3 requires card animations (`deal`, `flip`, `burn`), but the runtime animation pipeline only sees generic trace kinds (`moveToken`, `setTokenProp`, etc.) and lacks stable, game-agnostic metadata to classify card-specific intents.

Today, runner logic would need to infer semantics from zone IDs/action IDs (for example, `burn:none`, `deal`), which violates clean architecture and extensibility goals.

### Assumption Reassessment (2026-02-19)

1. The core assumption is still correct: there is no canonical `GameSpecDoc -> GameDef` card-animation contract today.
2. A discrepancy exists in token-type modeling assumptions:
   - Texas Hold'em in this repo derives token types from `pieceCatalog` data assets and materializes many concrete card token type IDs (for example `card-2S`, `card-KD`, ...).
   - Therefore, requiring per-token-type inline YAML flags would be brittle and not scalable for data-asset-driven games.
3. Scope correction:
   - Card token classification metadata must support selector-style targeting (for example explicit token type IDs and/or deterministic ID-prefix selectors), not only one-by-one inline flags.
   - This preserves agnostic compiler/runtime architecture while keeping evolution input purely YAML-authored.

## What to Change

1. Extend GameSpecDoc/compiled GameDef contracts with generic animation metadata sufficient to identify:
   - whether a token type should be treated as a card for visuals/animation (via scalable selectors, not only per-type manual flags);
   - semantic role of card-relevant zones (for example: draw source, hand, shared board, burn, discard).
2. Keep the contract generic and schema-owned in shared engine/compiler types:
   - no per-game hardcoded IDs in compiler/runtime;
   - no runner-side game-specific switch statements.
3. Ensure metadata is authored in GameSpecDoc/YAML and compiled into GameDef.
4. Define compile-time validation rules so malformed card animation metadata fails fast.
   - unknown role names fail;
   - conflicting singleton role assignments fail;
   - invalid selector shapes/types fail deterministically.
5. Update docs/spec references so this contract is the canonical source for card animation semantics.

## Invariants

1. No runner, kernel, or compiler code may hardcode any specific game zone ID, token type ID, or action ID for card animation behavior.
2. All card animation semantics consumed by runner must be derivable from compiled GameDef metadata produced from GameSpecDoc.
3. Shared schema/type ownership remains generic (usable by any game), not game-specific.
4. Compiler diagnostics must reject invalid animation metadata deterministically.
5. Existing non-card games continue to compile and run with no required card metadata.

## Tests

1. Compiler unit tests: valid GameSpecDoc card metadata compiles into expected GameDef metadata shape.
2. Compiler unit tests: invalid metadata (unknown role, duplicate conflicting singleton role, wrong selector/type) yields deterministic diagnostics.
3. Schema tests: GameDef/Trace/runtime schemas include new fields and artifacts regenerate cleanly.
4. Integration compile test: Texas Hold'em fixture emits card animation metadata for deck/hand/shared/burn/discard semantics and resolves selector-based card token typing (data-asset-derived token type IDs).
5. Regression compile test: non-card fixture compiles without new required fields.

## Outcome

- **Completion date**: 2026-02-19
- **Implemented changes**:
  - Added `metadata.cardAnimation` authoring contract in `GameSpecDoc` with:
    - token selectors (`cardTokenTypes.ids`, `cardTokenTypes.idPrefixes`);
    - zone-role selectors (`zoneRoles.draw|hand|shared|burn|discard`).
  - Added compiled `GameDef.cardAnimation` contract with concrete:
    - `cardTokenTypeIds`;
    - `zoneRoles` mapped to concrete materialized zone IDs.
  - Added compile-time validation + deterministic diagnostics for:
    - malformed selector shapes/types;
    - unknown token/zone selectors;
    - empty selector resolution;
    - conflicting singleton role assignments (`draw/shared/burn/discard`).
  - Regenerated engine schema artifacts to include `cardAnimation` in `GameDef.schema.json`.
  - Wired Texas Hold'em production metadata to emit role + token selectors.
  - Added unit and integration tests for valid/invalid metadata + Texas production compilation path.
- **Deviations from original plan**:
  - Implemented selector-based token classification instead of per-token inline flags to support data-asset-derived token types (for example Texas `card-*` IDs).
  - Compiled output stores concrete resolved IDs to keep runner-side consumption simple and deterministic.
- **Verification**:
  - `pnpm -F @ludoforge/engine schema:artifacts`
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/card-animation-metadata.test.js dist/test/integration/texas-card-animation-metadata.test.js` (from `packages/engine`)
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo lint`
