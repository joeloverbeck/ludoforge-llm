# 186ADVTURNPLAN-003: routePairs + subset selector sources (Phase 1b)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `cnl` (`game-spec-doc.ts`, `types-core.ts`, `compile-agent-role-selectors.ts`, `validate-agents.ts`), `agents` runtime (`policy-selector-eval.ts`)
**Deps**: `archive/tickets/186ADVTURNPLAN-001.md`, `archive/tickets/186ADVTURNPLAN-002.md`

## Problem

Spec 186 §4.2 / Phase 1b adds two selector-source kinds the composed-turn unit needs: `routePairs` (origin selector × destination selector, capped) and `subset` (bounded `min`/`max` with `beamWidth`). These are **engine prerequisites for Spec 188** (Transport origin/destination pairs; VC terror subsets) — and because Spec 188 is YAML-only, their compiler/runtime support must land in this engine spec. They are separated into Phase 1b because the Spec 186 proof slice (Train+Govern) does not exercise them, so the paradigm proof can land first.

## Assumption Reassessment (2026-05-20)

1. Existing selector source kinds (`collection`/`product`/`microturnOptions`/`candidateParams`) are at `types-core.ts:1077–1088`; `routePairs`/`subset` are additive new variants.
2. `policy-selector-eval.ts` (291 lines) is the selector runtime; it must enumerate the new sources deterministically and within caps (Foundation #10).
3. Nothing in Spec 186 depends on this ticket — it is a leaf; Spec 188's Transport/VC authoring is the first consumer.

## Architecture Check

1. Both sources are bounded by mandatory caps (`maxPairs`; `min`/`max`/`beamWidth`) recorded in compiled output (Foundation #10).
2. Sources are generic (origin/destination selectors, item subsets); game meaning comes from the authored sub-selectors' filters (Foundation #1).
3. No shim — additive source variants on the v3 selector IR.

## What to Change

### 1. Source schema + compiled types

Add `routePairs` (`{ origin: selectorRef, destination: selectorRef, maxPairs }`) and `subset` (`{ of: collectionRef|selectorRef, min, max, beamWidth }`) to the selector source union in `game-spec-doc.ts` and `types-core.ts`.

### 2. Compilation (`compile-agent-role-selectors.ts`)

Lower the new sources; require and record their bound fields.

### 3. Validation (`validate-agents.ts`)

Cap-bounds diagnostics: `routePairs` requires `maxPairs`; `subset` requires `min`/`max`/`beamWidth`. Fire a named error when absent (extends `186ADVTURNPLAN-002`'s framework).

### 4. Runtime enumeration (`policy-selector-eval.ts`)

Deterministic, capped enumeration of origin×destination pairs and bounded subsets (stable ordering, beam-width truncation).

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/compile-agent-role-selectors.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/agents/policy-selector-eval.ts` (modify)

## Out of Scope

- FITL authoring that uses `routePairs`/`subset` (Spec 188 — Transport, VC subsets).
- Plan runtime (`004`–`006`).

## Acceptance Criteria

### Tests That Must Pass

1. A `routePairs` selector compiles with `maxPairs` and enumerates origin×destination pairs deterministically, truncated at the cap.
2. A `subset` selector compiles with `min`/`max`/`beamWidth` and enumerates bounded subsets deterministically.
3. Cap-bounds diagnostics fire when `maxPairs` / `min`/`max`/`beamWidth` are absent (named error).
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Enumeration is bounded by the declared caps (Foundation #10) — no unbounded expansion.
2. Enumeration order is stable and replayable (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/role-selector-routepairs-subset.test.ts` (new) — `architectural-invariant`: bounded deterministic enumeration + cap-bounds diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/role-selector-routepairs-subset.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-20)

Completed.

Implemented additive authored/compiled selector-source support for `routePairs` and `subset`, including:

1. authored source types in `packages/engine/src/cnl/game-spec-doc.ts`;
2. compiled IR/types and schema validation in `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and `packages/engine/schemas/GameDef.schema.json`;
3. compiler lowering and cap diagnostics in `packages/engine/src/cnl/compile-agent-selector-sources.ts`, called from the existing selector compilation path in `compile-agents.ts`;
4. runtime deterministic enumeration in `packages/engine/src/agents/policy-selector-eval.ts`, with selector catalog threading from `policy-evaluation-core.ts`;
5. focused architectural-invariant coverage in `packages/engine/test/unit/agents/role-selector-routepairs-subset.test.ts`.

The ticket's draft file list named `compile-agent-role-selectors.ts` / `validate-agents.ts`; live selector-source compilation is currently rooted through `compile-agents.ts`. The cap-bounds diagnostics were implemented at source lowering so both compile and validation entry points receive the same named diagnostics through the existing compiler path.

Generated artifact provenance:

- Artifact: `packages/engine/schemas/GameDef.schema.json`
- Canonical inputs: `packages/engine/src/kernel/schemas-core.ts` and the compiled selector-source schema/type changes.
- Command: `pnpm -F @ludoforge/engine run schema:artifacts`
- Reason checked in: `GameDef.schema.json` is a repository contract artifact and the engine schema-artifact tests require it to match compiled schema inputs.

Source-size ledger:

- `packages/engine/src/cnl/compile-agents.ts`: 5913 lines before, 5846 lines after; active growth `-67` via helper extraction.
- `packages/engine/src/cnl/compile-agent-selector-sources.ts`: new 357-line helper, under the 800-line cap.
- `packages/engine/src/agents/policy-selector-eval.ts`: 291 lines before, 376 lines after; active growth `+85`, under the 800-line cap.
- Other touched preexisting large source files had small schema/type wiring deltas only: `game-spec-doc.ts` `+6`, `types-core.ts` `+7`, `schemas-core.ts` `+21`, `policy-evaluation-core.ts` `+1`.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test dist/test/unit/agents/role-selector-routepairs-subset.test.js` — passed.
3. `pnpm -F @ludoforge/engine test` — passed, `164/164 files passed`.
4. `pnpm turbo build` — passed.
5. `pnpm turbo lint` — passed.
6. `pnpm turbo typecheck` — passed.
7. `pnpm turbo test` — passed, `5 successful, 5 total`; engine summary `164/164 files passed`.
