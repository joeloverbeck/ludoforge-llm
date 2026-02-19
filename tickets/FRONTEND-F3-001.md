# FRONTEND-F3-001: Define Generic Card Animation Contract in GameSpecDoc -> GameDef

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler + shared runtime schema updates
**Deps**: None

## Problem

Milestone F3 requires card animations (`deal`, `flip`, `burn`), but the runtime animation pipeline only sees generic trace kinds (`moveToken`, `setTokenProp`, etc.) and lacks stable, game-agnostic metadata to classify card-specific intents.

Today, runner logic would need to infer semantics from zone IDs/action IDs (for example, `burn:none`, `deal`), which violates clean architecture and extensibility goals.

## What to Change

1. Extend GameSpecDoc/compiled GameDef contracts with generic animation metadata sufficient to identify:
   - whether a token type should be treated as a card for visuals/animation;
   - semantic role of card-relevant zones (for example: draw source, hand, shared board, burn, discard).
2. Keep the contract generic and schema-owned in shared engine/compiler types:
   - no per-game hardcoded IDs in compiler/runtime;
   - no runner-side game-specific switch statements.
3. Ensure metadata is authored in GameSpecDoc/YAML and compiled into GameDef.
4. Define compile-time validation rules so malformed card animation metadata fails fast.
5. Update docs/spec references so this contract is the canonical source for card animation semantics.

## Invariants

1. No runner, kernel, or compiler code may hardcode any specific game zone ID, token type ID, or action ID for card animation behavior.
2. All card animation semantics consumed by runner must be derivable from compiled GameDef metadata produced from GameSpecDoc.
3. Shared schema/type ownership remains generic (usable by any game), not game-specific.
4. Compiler diagnostics must reject invalid animation metadata deterministically.
5. Existing non-card games continue to compile and run with no required card metadata.

## Tests

1. Compiler unit tests: valid GameSpecDoc card metadata compiles into expected GameDef metadata shape.
2. Compiler unit tests: invalid metadata (unknown role, duplicate conflicting role, wrong type) yields deterministic diagnostics.
3. Schema tests: GameDef/Trace/runtime schemas include new fields and artifacts regenerate cleanly.
4. Integration compile test: Texas Hold'em fixture emits card animation metadata for deck/hand/shared/burn/discard semantics.
5. Regression compile test: non-card fixture compiles without new required fields.

