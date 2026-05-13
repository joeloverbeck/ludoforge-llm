# 170PARTVISOBS-001: Types, `ObserverPolicy` union, and compiler validation for partial-visibility observer policy

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/agents/policy-runtime.ts` (type union only — no resolver logic), `packages/engine/src/cnl/compile-agents.ts` (or phase-boundary sibling), `packages/engine/src/kernel/schemas-extensions.ts`, regenerated `packages/engine/schemas/` artifacts
**Deps**: `specs/170-partial-visibility-observer-policy.md`

## Problem

Spec 169's schedule-distance refs are blocked for FITL ARVN because the binary observer-visibility check in `resolveBoundaryCardDistance` collapses every partially-observable deck (visible lookahead + hidden tail) into `unavailable: hiddenDeck`. Spec 170 corrects this by introducing a generic `observerPolicy.topNVisible` field with an ordered `visiblePrefix.zones[]` and a first-class `partial.lowerBound` resolution status. This ticket lands the type system + compiler validation half of the change: the new types are visible to authors and the compiler rejects malformed declarations, but the runtime still produces no `partial` resolutions yet (those land in ticket 002). Without this ticket, no downstream work can author or validate the new field.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/agents/policy-runtime.ts:71-87` defines `PhaseScheduleResolution` as a two-variant union (`ready` | `unavailable`) — confirmed by direct read this session. Extending it with a `partial` kind is additive and respects Foundation #20.
2. `packages/engine/src/cnl/compile-agents.ts:2231-2232` already raises `scheduleFallback.onUnavailable` requirements for schedule-distance refs; the new `onPartial.visiblePrefixExhausted` requirement is parallel — confirmed by direct read.
3. `packages/engine/src/kernel/schemas-extensions.ts:300-301,407` defines `cardLifecycle` Zod schemas for the FITL slot identifiers — confirmed; schema artifact regen path is `pnpm turbo schema:artifacts`.
4. No `observerPolicy`, `topNVisible`, or `partialVisib` symbols exist anywhere in `packages/engine/src/` — confirmed by grep this session. Namespace is clean.
5. Spec 169 archived at `archive/specs/169-phase-boundary-and-schedule-refs.md` with status closed; cited as contract reference only, not in Deps (per `/spec-to-tickets` archived-and-completed dep rule).

## Architecture Check

1. **Engine agnosticism (Foundation #1)**: `ObserverPolicy.topNVisible` is a generic predicate carrying an ordered list of public zones plus a `maxItems` integer cap — no FITL-specific identifiers leak into kernel or compiler types. FITL becomes a consumer in ticket 004, not part of the implementation.
2. **Compiler-kernel validation boundary (Foundation #12)**: All static constraints (kind enum, non-empty zones list, zone visibility, container-of-cards shape, no overlap with deck's hidden draw zone, no duplicates, positive `maxItems`, fallback-required when topNVisible declared) are compile-time. State-dependent matching is deferred to ticket 002.
3. **Preview signal integrity (Foundation #20)**: The new `partial.lowerBound` resolution variant is a distinct status kind, NOT a flavor of `unavailable`. The type system enforces the distinction so future fallback evaluators cannot silently coerce partial evidence into unavailability.
4. **No backwards-compat shims (Foundation #14)**: `observerPolicy` is optional; absence preserves the existing `unavailable: hiddenDeck` path verbatim. No alias paths or compatibility wrappers introduced.

## What to Change

### 1. New types in `packages/engine/src/kernel/types-core.ts`

Add (alongside existing `PhaseBoundaryDef`/`ScheduleKindDef`):

```ts
export type ObserverPolicy = {
  readonly kind: 'topNVisible';
  readonly visiblePrefix: ObserverVisiblePrefix;
};

export type ObserverVisiblePrefix = {
  readonly zones: readonly { readonly id: string }[];
  readonly maxItems: number;
};
```

Extend `PhaseBoundaryDef.schedule` (the existing `cardDraw` variant) with an optional `observerPolicy?: ObserverPolicy`. Confirm exact insertion point by grepping `cardSelector` near the `PhaseBoundaryDef`/`ScheduleKindDef` declarations.

### 2. Extend `PhaseScheduleResolution` in `packages/engine/src/agents/policy-runtime.ts:71-87`

Add a `partial` variant and extend `ready` with optional observer metadata:

```ts
export type PhaseScheduleResolution =
  | {
      readonly kind: 'ready';
      readonly value: string | number;
      readonly observerPolicy?: { readonly kind: 'topNVisible' };
      readonly visiblePrefixLength?: number;
    }
  | {
      readonly kind: 'partial';
      readonly partialKind: 'lowerBound';
      readonly lowerBound: number;
      readonly observerPolicy: { readonly kind: 'topNVisible' };
      readonly visiblePrefixLength: number;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'interruptStateNoSuccessor'
        | 'phaseSequenceExhausted'
        | 'noBoundaryReachable'
        | 'unsupportedScheduleDistance'
        | 'notCardScheduled'
        | 'noTriggeringCardRemaining'
        | 'hiddenDeck';
    };
```

No new `unavailable.reason` is introduced — partial is its own status kind.

### 3. Compiler validation in `packages/engine/src/cnl/compile-agents.ts`

Locate the phase-boundary validator (`compile-phase-boundaries.ts` if present per spec 169's insertion point, else `compile-agents.ts`). Add validation for the optional `observerPolicy` field with these diagnostic codes:

- `OBSERVER_POLICY_UNKNOWN_KIND` — `observerPolicy.kind` not in `{ 'topNVisible' }`.
- `OBSERVER_POLICY_DEFERRED_KIND` — reject `omniscient` / `observerView` with a "reserved for future" message.
- `OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX` — `visiblePrefix.zones` empty or absent.
- `OBSERVER_POLICY_INVALID_MAXITEMS` — `maxItems` not a positive integer.
- `OBSERVER_POLICY_UNKNOWN_ZONE` — `visiblePrefix.zones[i]` does not resolve to a declared zone.
- `OBSERVER_POLICY_NON_PUBLIC_ZONE` — resolved zone has `visibility != 'public'`.
- `OBSERVER_POLICY_INVALID_ZONE_KIND` — resolved zone is not container-of-cards-shaped (e.g., `ordering: set` for cards).
- `OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX` — a listed zone equals the deck's `drawZone`.
- `OBSERVER_POLICY_DUPLICATE_ZONE` — duplicate zone ids in the list.

Extend the consideration-level scheduleFallback validator at `compile-agents.ts:2231-2232`: when a consideration reads a `schedule.distance.toBoundary.<X>.cards` ref whose target boundary declares `observerPolicy.kind === 'topNVisible'`, require `scheduleFallback.onPartial.visiblePrefixExhausted`. New diagnostic: `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`. The existing `onUnavailable` requirement is unchanged.

### 4. Schema regeneration

Run `pnpm turbo schema:artifacts` after the type changes land to regenerate `packages/engine/schemas/` JSON Schema artifacts. Commit the regenerated artifacts.

### 5. PolicyScheduleFallback shape (forward-declare only)

In `packages/engine/src/agents/policy-evaluation-core.ts:78-90`, extend the `PolicyScheduleFallback` type to include the optional `onPartial?: { visiblePrefixExhausted: ... }` discriminator. The runtime route through `onPartial` is added in ticket 002 — this ticket lands the type only so the compiler's `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` diagnostic has something to validate against.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — `ObserverPolicy`, `ObserverVisiblePrefix`, extend `PhaseBoundaryDef.schedule`.
- `packages/engine/src/agents/policy-runtime.ts` (modify) — extend `PhaseScheduleResolution` type union only; do NOT add resolver logic (deferred to ticket 002).
- `packages/engine/src/cnl/compile-agents.ts` (modify) — observerPolicy validator + 9 diagnostic codes + `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`. (May need a sibling file `compile-phase-boundaries.ts` per spec 169's insertion-point precedent — verify during implementation.)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — type-only extension to `PolicyScheduleFallback` for the `onPartial` discriminator.
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if needed) — Zod schemas for `ObserverPolicy` if compile validation reads through the schema layer.
- `packages/engine/schemas/` (regenerated) — JSON Schema artifacts via `pnpm turbo schema:artifacts`.
- `packages/engine/test/integration/partial-visibility-compile-validation.test.ts` (new) — every rejection rule with diagnostic code coverage.
- `packages/engine/test/integration/partial-visibility-determinism.test.ts` (new) — byte-identical compile output for a spec with `observerPolicy` declared.

## Out of Scope

- Runtime resolver logic — deferred to ticket 002. This ticket adds the `partial` resolution variant to the type union; no code path produces `partial` resolutions yet.
- Fallback evaluator routing — deferred to ticket 002.
- WASM bytecode opcodes — deferred to ticket 003.
- FITL data authoring — deferred to ticket 004.
- `omniscient` / `observerView` observer policies — out of scope per spec 170 §3.
- Any change to existing `unavailable: hiddenDeck` resolutions for non-policy-bearing boundaries.

## Acceptance Criteria

### Tests That Must Pass

1. `partial-visibility-compile-validation.test.ts` — every diagnostic code in §3 raises on a malformed fixture spec; valid `observerPolicy` declarations compile without warning.
2. `partial-visibility-determinism.test.ts` — compile the same fixture spec twice (with `observerPolicy` declared); assert byte-identical GameDef output.
3. `partial-visibility-compile-validation.test.ts` — consideration referencing a `topNVisible`-bearing boundary without `scheduleFallback.onPartial.visiblePrefixExhausted` raises `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`.
4. Existing suite: `pnpm turbo test` — no regressions.
5. Existing suite: `pnpm turbo build` — typecheck passes with new type union.
6. Existing suite: `pnpm turbo lint` — no new lint errors.

### Invariants

1. Absence of `observerPolicy` on a `phaseBoundaries[].schedule` declaration is identical to today's behavior — no diagnostics, no resolver change, the existing `unavailable: hiddenDeck` golden traces from spec 169 are preserved verbatim.
2. The new `partial` variant of `PhaseScheduleResolution` is unreachable at runtime in this ticket (resolver still uses the spec-169 binary check); the variant exists only in the type union so ticket 002's resolver path is type-safe.
3. Schema artifact byte-identity: re-running `pnpm turbo schema:artifacts` after the type changes produces a deterministic output checked into the repo.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/partial-visibility-compile-validation.test.ts` — architectural-invariant. Each of the 10 diagnostic codes (9 observerPolicy + `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`) has a coverage row asserting both rejection AND diagnostic code.
2. `packages/engine/test/integration/partial-visibility-determinism.test.ts` — architectural-invariant. Compile-twice byte-identity for an `observerPolicy`-bearing fixture.

Test class headers per `.claude/rules/testing.md`:
- `// @test-class: architectural-invariant` on both new files.

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-compile-validation.test.ts`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-determinism.test.ts`
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm turbo schema:artifacts` — regenerate and verify byte-stable output.
5. `pnpm turbo test` — full suite regression check.

## Outcome (2026-05-13)

Outcome amended: 2026-05-13

Completed the type-system and compiler-validation half of Spec 170:

- Added generic `ObserverPolicy.topNVisible` / `ObserverVisiblePrefix` types to the compiled `cardDraw` schedule contract.
- Extended `PhaseScheduleResolution` with the type-only `partial.lowerBound` variant plus optional ready-path observer metadata. No resolver branch was added; runtime production of `partial` remains owned by `archive/tickets/170PARTVISOBS-002.md`.
- Added authored `scheduleFallback.onPartial.visiblePrefixExhausted` lowering for `useLowerBound`, `noContribution`, `dropConsideration`, and integer `constant`.
- Added compile-time observer-policy validation for all ticket-required diagnostics: unknown/deferred kind, empty prefix, invalid `maxItems`, unknown zone, non-public zone, unordered zone, draw-zone prefix, duplicate zone, and missing partial fallback.
- Regenerated `packages/engine/schemas/GameDef.schema.json` from the schema source.
- Added the two ticket-named integration witnesses:
  - `packages/engine/test/integration/partial-visibility-compile-validation.test.ts`
  - `packages/engine/test/integration/partial-visibility-determinism.test.ts`

Ticket corrections applied:

- Observer-policy validation landed in the live phase-boundary lowerer, `packages/engine/src/cnl/compile-phase-boundaries.ts`; `compile-agents.ts` only owns the consideration-level fallback requirement.
- The schema mirror for `phaseBoundaries[].schedule.observerPolicy` and compiled `scheduleFallback.onPartial` lives in `packages/engine/src/kernel/schemas-core.ts`; `packages/engine/src/kernel/schemas-extensions.ts` required no edit.
- Focused test command substitution: because engine tests execute compiled `dist` files, the focused proof lanes were `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/integration/<file>.js`. The ticket-named full Turbo lanes were run literally.

Deferred sibling/spec scope:

- `archive/tickets/170PARTVISOBS-002.md` owns resolver logic, runtime partial fallback routing, and trace population.
- `tickets/170PARTVISOBS-003.md` owns WASM parity.
- `tickets/170PARTVISOBS-004.md` appeared during implementation and was opened as read-only sibling context; it owns FITL authoring, cookbook docs, and FITL golden traces after tickets 001-003.

Schema/artifact fallout:

- `pnpm turbo schema:artifacts` wrote `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`; only `packages/engine/schemas/GameDef.schema.json` persisted as a diff. `Trace.schema.json` and `EvalReport.schema.json` were byte-identical after generation.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` passed after regeneration.

Invariant proof matrix:

| Invariant | Witness/assertion | Status | Proof lane |
| --- | --- | --- | --- |
| Valid `topNVisible` declarations compile and preserve the compiled schedule/fallback shape | exact assertions on `gameDef.phaseBoundaries[0].schedule` and compiled consideration fallback | proven | `partial-visibility-compile-validation.test.ts` |
| All observer-policy malformed declarations emit the named diagnostic codes | 9 rejection rows plus diagnostic-code assertions | proven | `partial-visibility-compile-validation.test.ts` |
| A topNVisible schedule-distance value ref requires `scheduleFallback.onPartial.visiblePrefixExhausted` | diagnostic path/code assertion for `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` | proven | `partial-visibility-compile-validation.test.ts` |
| Compile output with `observerPolicy` is byte-identical across repeated compiles | `JSON.stringify(first.gameDef) === JSON.stringify(second.gameDef)` | proven | `partial-visibility-determinism.test.ts` |
| Absence of `observerPolicy` preserves spec-169 hidden-deck behavior | existing FITL phase-boundary golden remained green | proven | `pnpm turbo test` included `phase-boundary-fitl-coup-distance.test.js` |
| `partial.lowerBound` is unreachable at runtime in this ticket | no resolver, evaluator, trace, or WASM behavior was added; runtime owner confirmed in sibling 002 | deferred to confirmed sibling | `archive/tickets/170PARTVISOBS-002.md` |
| Schema artifact generation is deterministic and checked in | generator and check passed; only `GameDef.schema.json` persisted as owned diff | proven | `pnpm turbo schema:artifacts`; `pnpm -F @ludoforge/engine run schema:artifacts:check` |

Implementation-introduced branch ledger:

| Branch/status | Classification |
| --- | --- |
| `PhaseScheduleResolution.kind === "partial"` / `partialKind === "lowerBound"` | type-only branch; runtime production deferred to confirmed sibling 002 |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "useLowerBound"` | declaration/lowering tested; runtime evaluation deferred to sibling 002 |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "noContribution"` | declaration/lowering enabled; runtime evaluation deferred to sibling 002 |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "dropConsideration"` | declaration/lowering enabled; runtime evaluation deferred to sibling 002 |
| `scheduleFallback.onPartial.visiblePrefixExhausted.constant` | declaration/lowering enabled; runtime evaluation deferred to sibling 002 |

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
| --- | ---: | ---: | --- | --- | --- | --- |
| `packages/engine/src/kernel/types-core.ts` | 2271 | 2289 | no; preexisting over guidance | +18 net | canonical shared contract hub; surgical type addition is clearer than extraction | none |
| `packages/engine/src/agents/policy-runtime.ts` | 708 | 717 | no | +9 net | near-cap file only gained the type union required by this ticket; resolver extraction belongs to sibling 002 if needed | `archive/tickets/170PARTVISOBS-002.md` for behavior |
| `packages/engine/src/cnl/compile-agents.ts` | 4500 | 4619 | no; preexisting over guidance | +119 net | canonical policy compiler hub; change is localized fallback validation/lowering, extraction would obscure the ticket seam | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2042 | 2048 | no; preexisting over guidance | +6 net | canonical policy evaluation type hub; type-only schedule fallback kind extension | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2696 | 2717 | no; preexisting over guidance | +21 net | canonical schema mirror hub; surgical schema addition required for generated artifacts | none |
| `packages/engine/src/cnl/compiler-core.ts` | 2010 | 2011 | no; preexisting over guidance | +1 net | one argument threads existing compiled zones into phase-boundary validation | none |
| `packages/engine/src/cnl/game-spec-doc.ts` | 860 | 878 | no; preexisting over guidance | +18 net | canonical authored GameSpecDoc type hub; surgical type addition required for authoring | none |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-compile-validation.test.js` — passed, 11/11 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-determinism.test.js` — passed, 1/1 test.
- `pnpm turbo schema:artifacts` — passed; regenerated schema artifacts.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed, including the new tests and existing `phase-boundary-fitl-coup-distance.test.js`.
- `pnpm run check:ticket-deps` — passed for 4 active tickets and 2329 archived tickets.

Late-edit proof validity:

- No-invalidation: terminal status/proof transcription only; no code, schema, acceptance command semantics, dependency ownership, or deferred sibling scope changed after the final proof lanes.
