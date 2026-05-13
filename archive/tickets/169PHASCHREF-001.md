# 169PHASCHREF-001: Phase 0 — types, BoundaryId, GameSpecDoc declaration & compiler validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel types, branded ids, compiler validation, diagnostic registry
**Deps**: `archive/specs/169-phase-boundary-and-schedule-refs.md`

## Problem

Spec 169 (`archive/specs/169-phase-boundary-and-schedule-refs.md`) introduces a new state-local ref family (`phase.*` and `schedule.*`) that lets agent profiles write timing-aware considerations without forward simulation. Before any ref can resolve, the compiler must accept a new `phaseBoundaries[]` declaration in GameSpecDoc, validate it against existing phase/deck/card data, and reject malformed schedule references at compile time per Spec 169 §4.4. Without Phase 0's static substrate (types, branded `BoundaryId`, declaration acceptance, diagnostic codes), no downstream phase can ship — runtime resolvers and tests both require these primitives.

This ticket is the foundation for the entire Spec 169 surface. It introduces no runtime resolution and no behavioral change to the engine — only validation and type plumbing.

## Assumption Reassessment (2026-05-13)

1. **Spec 166 ref-family precedent is current**: `packages/engine/src/kernel/types-core.ts:413-416,421-425` declares `candidateParam` ref with `onMissing` enum; `packages/engine/src/cnl/compile-agents.ts:144,220,2144-2213` registers the family end-to-end. Confirmed via Explore agent during spec authoring — pattern is stable.
2. **`PhaseDef` and `PhaseId` already exist**: `packages/engine/src/kernel/types-core.ts:183-194` declares `PhaseDef { id: PhaseId, onEnter?, onExit?, actionDefaults? }`; `packages/engine/src/kernel/branded.ts:7` brands `PhaseId`. New work in this ticket adds `BoundaryId` alongside, not in place of.
3. **`turnIntrinsic: 'phaseId'` ref exists**: confirmed in policy-runtime.ts ref dispatcher. The new `phase.current.id` is a grammar-symmetric alias; the existing intrinsic is not deprecated.
4. **No prior `phaseBoundaries` declaration in any GameSpecDoc**: `data/games/fire-in-the-lake/` and `data/games/texas-hold-em/` contain no `phaseBoundaries:` block. The field is purely additive.
5. **Diagnostic code registry pattern**: spec 166 uses a constant registry in `compile-agents.ts`; new codes follow the same shape.

## Boundary Correction (2026-05-13)

User-approved Option 1 after `docs/FOUNDATIONS.md` reassessment: Spec 169 §4.4's 10th Phase 0 diagnostic is corrected from the placeholder `PHASE_REF_UNKNOWN_PHASE` to `PHASE_BOUNDARY_EMPTY_CARD_SELECTOR`. Phase 0 has no authored `phase.<X>.*` literal-phase ref surface, while an empty `cardSelector` is a real compile-time-invalid `phaseBoundaries[]` declaration. This preserves Foundations #12, #15, and #16 by validating the actual static declaration invariant with direct automated proof.

## Architecture Check

1. **Generic primitives only** (Foundation #1): `BoundaryId`, `PhaseId`, `cardDraw` schedule kind, and `cardSelector` predicates are universal — no FITL-specific identifiers leak into the compiler. The `phaseId: coupVictory` value in a FITL `phaseBoundaries` block is data, not code.
2. **Compiler-validated everything statically knowable** (Foundation #12): boundary id uniqueness, phase/deck/tag/card resolution, unit-kind compatibility per spec §4.4's matrix are all compile-time facts. Runtime validation is out of scope for this ticket.
3. **No backwards-compatibility shim**: `phaseBoundaries` is purely additive; GameSpecs without it remain valid. No alias paths, no `_legacy` field names. Foundation #14 satisfied trivially.
4. **Foundation #17 alignment**: `BoundaryId` is a new branded type registered alongside the existing brand collection in `kernel/branded.ts`, preserving the typed-identifier invariant.
5. **Deterministic compile output** (Foundation #8): compiled boundary metadata serializes in declaration order; byte-identical GameDef across repeated compiles is enforced by Phase 0's determinism test.

## What to Change

### 1. Add `BoundaryId` branded type

In `packages/engine/src/kernel/branded.ts`, add `BoundaryId` brand alongside the existing brand collection. Follow the exact shape of the `PhaseId` declaration (line 7). Export from the kernel index.

### 2. Add AST node types

In `packages/engine/src/kernel/types-core.ts`:

- `PhaseBoundaryDef` interface — `id: BoundaryId`, `kind: 'phaseEntry' | 'phaseExit' | 'condition'`, optional `phaseId: PhaseId` (required for phaseEntry/phaseExit), optional `schedule: ScheduleKindDef`.
- `ScheduleKindDef` discriminated union — Phase 0 ships only `{ kind: 'cardDraw', deckId: string, cardSelector: CardSelector }` against the existing `eventDecks[]` surface. Reserve `turnCount` and `condition` enum entries in the type union but mark them as "(future)" with a TODO comment for downstream tickets — do NOT implement validation paths for them in Phase 0.
- `CardSelector` interface — `{ tags?: readonly string[], cardIds?: readonly string[] }`. Validation requires at least one populated field.
- `PhaseIntrinsicRef` AST node — `{ kind: 'phaseIntrinsic', name: 'current.id' | 'next.id' | ... }`. Add to the ref-AST union.
- `ScheduleDistanceRef` AST node — `{ kind: 'scheduleDistance', target: { kind: 'boundary', boundaryId: BoundaryId } | { kind: 'phase', phaseId: PhaseId }, unit: 'cards' | 'microturns' | 'actions' | 'turns' | 'rounds' }`. Add to the ref-AST union.

Both ref nodes carry a `scheduleFallback?: { onUnavailable: 'noContribution' | { constant: number } | 'dropConsideration' }` field for the resolver to consume in downstream tickets. Compile-time validation of fallback discipline is a 003-ticket concern; for Phase 0 the field is accepted on the AST but not yet enforced.

### 3. Extend `GameSpecDoc` to accept `phaseBoundaries`

In `packages/engine/src/cnl/compile-agents.ts` (or the GameSpecDoc schema module — locate via the existing top-level field acceptance for `turnStructure` or `dataAssets`):

- Accept optional `phaseBoundaries: PhaseBoundaryDef[]` top-level field.
- Empty/absent = valid.
- Iteration order preserved for deterministic compile output.

### 4. Compiler validation rules

Implement validation per spec §4.4, emitting these diagnostic codes:

| Diagnostic code | Trigger |
|---|---|
| `PHASE_BOUNDARY_DUPLICATE_ID` | Two entries share an `id`. |
| `PHASE_BOUNDARY_UNKNOWN_PHASE` | `phaseId` not in `turnStructure.phases` or `turnStructure.interrupts`. |
| `PHASE_BOUNDARY_UNKNOWN_DECK` | `schedule.deckId` not in `eventDecks[]`. |
| `PHASE_BOUNDARY_UNKNOWN_CARD_TAG` | `schedule.cardSelector.tags[]` references a tag not declared on any card in the deck. |
| `PHASE_BOUNDARY_UNKNOWN_CARD_ID` | `schedule.cardSelector.cardIds[]` references a card id not in the deck. |
| `PHASE_BOUNDARY_EMPTY_CARD_SELECTOR` | Neither `tags` nor `cardIds` populated. |
| `SCHEDULE_REF_UNKNOWN_BOUNDARY` | `schedule.distance.toBoundary.<X>.<unit>` references an undeclared BoundaryId. |
| `SCHEDULE_REF_UNKNOWN_PHASE` | `schedule.distance.toPhase.<X>.<unit>` references an undeclared PhaseId. |
| `SCHEDULE_REF_NO_PHASE_BOUNDARY` | `schedule.distance.toPhase.<X>.<unit>` references a phase with no declared `phaseEntry` boundary. |
| `SCHEDULE_REF_UNSUPPORTED_UNIT` | Requested unit is incompatible with the boundary's `schedule.kind` per the spec §4.4 compatibility matrix. |

The compatibility matrix for Phase 0 (only `cardDraw` shipping):

| `schedule.kind` | `cards` | `microturns` | `actions` | `turns` | `rounds` |
|---|---|---|---|---|---|
| `cardDraw` | ✅ | ✅ | ✅ | ✅ | ✅ |
| (future `turnCount`) | ❌ | ❌ | ❌ | ❌ | ❌ |
| (future `condition`) | ❌ | ❌ | ❌ | ❌ | ❌ |

### 5. Ref-kind dispatcher entries (validation-only)

In `compile-agents.ts`, the ref-kind validator (search for `candidateParam` template at lines ~2144-2213) gains two new branches — `phaseIntrinsic` and `scheduleDistance`. The branches validate scope (must be `move` or `microturn`) and target identity, but do NOT yet resolve at runtime (003 ticket adds resolver). Compile-time success means the spec is syntactically correct; runtime resolution lands in 002/003/004.

### 6. Diagnostic registry

Register all 10 new codes in the existing diagnostic-code registry (search `compile-agents.ts` for existing diagnostic-code constants).

## Files to Touch

- `packages/engine/src/kernel/branded.ts` (modify) — add `BoundaryId` brand.
- `packages/engine/src/kernel/types-core.ts` (modify) — add `PhaseBoundaryDef`, `ScheduleKindDef`, `CardSelector`, `PhaseIntrinsicRef`, `ScheduleDistanceRef`.
- `packages/engine/src/kernel/index.ts` (modify) — export new types and brand.
- `packages/engine/src/cnl/compile-agents.ts` (modify) — accept `phaseBoundaries`, validate, add new ref-kind branches, new diagnostic codes.
- `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts` (new) — architectural-invariant test covering all 10 rejection rules + diagnostic-code identity.
- `packages/engine/test/unit/cnl/phase-boundary-determinism.test.ts` (new) — architectural-invariant test: compile same GameSpec with `phaseBoundaries` twice → byte-identical GameDef.

## Out of Scope

- Runtime ref resolution (no `phase.current.id` value yet — 002 ticket).
- Card-draw schedule index in `GameDefRuntime` (003 ticket).
- WASM opcode integration (005 ticket).
- FITL `phaseBoundaries` data authoring (006 ticket).
- `scheduleFallback` enforcement at compile time — the field is parsed onto the AST but compile-time discipline rules (e.g., reject numeric uses without fallback) land in 003 alongside the runtime resolver.
- `turnCount` and `condition` schedule kinds — types reserve the enum entries but no validation or resolution paths ship.
- Hidden-information observer policy beyond default `observerView` — `omniscient` and `topNVisible` enum entries are reserved (per spec §13) but not implemented.

## Acceptance Criteria

### Tests That Must Pass

1. `phase-boundary-compile-validation.test.ts` — every diagnostic code has a positive-trigger row asserting both rejection and diagnostic code identity. 10 rows minimum.
2. `phase-boundary-determinism.test.ts` — compile same GameSpec with a non-trivial `phaseBoundaries` block twice; assert byte-identical compiled output.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit` passes — no regression in unrelated compiler validation.
4. Existing suite: `pnpm turbo typecheck` passes — new types integrate cleanly.

### Invariants

1. `phaseBoundaries` is purely additive — GameSpecs without it compile identically to pre-spec-169 behavior. No existing fixture, replay, or golden artifact requires migration.
2. `BoundaryId` is a branded type — cannot be confused with `PhaseId`, `ZoneId`, `ActionId`, or any other domain identifier.
3. Compiled boundary metadata serializes in declaration order; iteration order is part of the GameDef hash.
4. All 10 diagnostic codes are unique constants in the registry; no overlap with pre-existing codes.
5. Scope validation for `phaseIntrinsic` and `scheduleDistance` refs follows the existing `candidateParam` precedent (move + microturn only).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts` (new) — `@test-class: architectural-invariant`; one `it` block per diagnostic code with a minimal failing fixture; asserts rejection + diagnostic code.
2. `packages/engine/test/unit/cnl/phase-boundary-determinism.test.ts` (new) — `@test-class: architectural-invariant`; compile-twice byte-identical assertion on a fixture GameSpec with 2-3 declared boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build` — confirms types compile.
2. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern phase-boundary` — runs new tests in isolation.
3. `pnpm turbo test --filter=@ludoforge/engine` — full engine test gate.
4. `pnpm turbo typecheck` — cross-package typecheck.
5. `pnpm turbo lint` — lint gate.

## Implementation Closeout (2026-05-13)

Outcome amended: 2026-05-13 — updated the Spec 169 dependency/reference path after the spec completed and moved to `archive/specs/169-phase-boundary-and-schedule-refs.md`.

Implemented the Phase 0 static substrate only:

- Added `BoundaryId`, `PhaseBoundaryDef`, `ScheduleKindDef`, `CardSelector`, validation-only `phaseIntrinsic` and `scheduleDistance` compiled ref nodes, and `scheduleFallback` AST acceptance.
- Added top-level authored/parsed/compiled `phaseBoundaries[]` support, preserving absent specs as `null`/omitted and preserving declaration order when present.
- Added all 10 Phase 0 diagnostics, including the Foundation-aligned `PHASE_BOUNDARY_EMPTY_CARD_SELECTOR` correction.
- Added compiler validation for duplicate boundary ids, unknown phases, unknown event decks, unknown card tags/card ids, empty selectors, unknown schedule-ref targets, missing phase-entry boundaries, unsupported schedule units, and move/microturn-only ref scope.
- Kept `turnCount` and `condition` schedule kinds reserved only. Phase 0 accepts their type shape but rejects all distance-unit validation paths for them.
- Generated `packages/engine/schemas/GameDef.schema.json` after schema-core changes; `Trace` and `EvalReport` were byte-stable after generation.

Live-surface corrections from the draft:

- `schedule.deckId` validates against compiled `eventDecks[]`, not `dataAssets`; that is the live deck declaration surface.
- `kernel/index.ts` did not need a direct edit because it already re-exports `branded.ts` and `types.ts`, and `types.ts` re-exports `types-core.ts`.
- Parser/test fixture fallout was owned by adding a top-level GameSpecDoc key.
- `policy-evaluation-core.ts` received fail-closed `undefined` handling for the new ref kinds so Phase 0 stays validation-only until the runtime tickets land.
- `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` had one unrelated unused type import blocking the canonical lint gate; removed that import only.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/cnl/compile-agents.ts` | 4181 | 4427 | No — preexisting oversized | +246 | Phase 0 additions were surgical parser/ref-validation wiring; boundary declaration lowering/validation was extracted to `compile-phase-boundaries.ts` to avoid adding the bulk there. | None |
| `packages/engine/src/kernel/types-core.ts` | 2214 | 2259 | No — preexisting oversized | +45 | Ticket-owned additions are shared public contract types and belong on the existing GameDef/type union surface. | None |
| `packages/engine/src/cnl/compile-phase-boundaries.ts` | New file | 173 | No | +173 | New helper extracted from the compiler hub for boundary lowering and validation. | None |
| `packages/engine/src/kernel/schemas-core.ts` | 2625 | 2682 | No — preexisting oversized | +57 | Additions mirror the public GameDef type surface in the existing schema hub. | None |
| `packages/engine/src/cnl/compiler-core.ts` | 1994 | 2010 | No — preexisting oversized | +16 | Changes only thread the new section through existing section-result plumbing. | None |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/phase-boundary-compile-validation.test.js dist/test/unit/cnl/phase-boundary-determinism.test.js` — passed, 16 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regenerating `GameDef.schema.json`.
- `pnpm -F @ludoforge/engine test:unit` — passed, 5693 tests.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test --filter=@ludoforge/engine` — passed, including build, schema artifact check, unit, architecture, and default integration lanes.
