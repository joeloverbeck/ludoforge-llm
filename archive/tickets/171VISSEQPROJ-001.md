# 171VISSEQPROJ-001: Visible-sequence-source schema and resolver atomic cut

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel types/schemas, GameSpecDoc types, compiler (phase-boundary validation + diagnostic codes), agents runtime (TS schedule resolver), WASM host-side schedule encoder, JSON schema artifacts
**Deps**: `archive/specs/171-visible-sequence-projection.md`

## Problem

Spec 170's `observerPolicy.topNVisible.visiblePrefix.zones[]` + aggregate `maxItems` schema is silently non-functional under the production FITL configuration. Because FITL's `discardZone` is `played:none`, accumulated discards consume the aggregate `maxItems` budget before `lookahead:none` is ever scanned — 138/138 ARVN Govern candidates resolved `partial.lowerBound = 2`, zero `ready`, across 15 deterministic seeds (trigger report `reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md`).

Spec 171 replaces the schema with `visiblePrefix.sources[]`, each source carrying a **required per-source `take`** cap, so each source's contribution to the composed visible sequence is independently bounded. The `ObserverVisiblePrefix` type change forces every consumer — zod schema, GameSpecDoc type, compiler validation, the TS resolver, the WASM host-side resolver — to change atomically (TypeScript will not compile a partial type change), and the strict zod schema rejects unmigrated FITL data. This ticket is that atomic cut: spec Phases 0–2 source + Phase 3 FITL data migration + §8.1 test migrations, bundled so `build` / `typecheck` / `test` stay green at the ticket boundary.

## Assumption Reassessment (2026-05-14)

1. `ObserverVisiblePrefix` at `packages/engine/src/kernel/types-core.ts:211-214` is `{ zones: readonly { id: string }[]; maxItems: number }` — confirmed this session.
2. `resolveVisiblePrefixBoundaryCardDistance` at `packages/engine/src/agents/policy-runtime.ts:349-383` iterates all cards per zone (`for (const card of slotCards)`) against the aggregate `maxItems` budget — confirmed this session.
3. `validateObserverPolicy` at `packages/engine/src/cnl/compile-phase-boundaries.ts:198-319` reads `observerPolicy` via a loose local cast (not the `ObserverPolicy` type directly). `compile-agents.ts:~2239-2252` `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` keys only on whether the boundary is `topNVisible` — it does NOT introspect the prefix shape, so the rename is a type-reference update there, no logic change. Confirmed this session via Explore-agent map + direct reads.
4. `ObserverPolicySchema` at `packages/engine/src/kernel/schemas-core.ts:218-228` is `.strict()` — a migrated GameSpec carrying legacy `zones`/`maxItems` keys fails zod validation cleanly, so no compatibility shim is needed (Foundation #14). Confirmed this session.
5. The host-side `resolveVisiblePrefixBoundaryCardDistance` in `policy-wasm-phase-schedule-encoding.ts:~142-264` is a parallel copy of the TS resolver reading `visiblePrefix.maxItems`/`.zones` — confirmed this session via Explore-agent map.
6. All 8 owned test files exist under `packages/engine/test/integration/` and all four FITL event-deck files declare `discardZone: played:none` — confirmed this session.

## Architecture Check

1. Per-source `take` makes the FITL starvation trap structurally impossible — each source contributes at most `take` cards regardless of zone length. Dropping the aggregate `maxItems` entirely (rather than retaining it as a redundant cap, as the external proposal suggested) eliminates the bug *class*, not just the FITL instance — a `maxItems < sum(take)` config would re-admit the same starvation. The resolution bound is `sum(source.take)`, statically known, so Foundation #10 is satisfied without an aggregate cap (spec §3, §9).
2. `visiblePrefix.sources` stays a generic ordered list of `{ public zone id, take cap }`. The kernel knows zone visibility, deck contents, and card-identity predicates — no FITL-specific logic enters the engine; FITL remains a consumer (Foundation #1). The compiler validates per-source public visibility and deterministic order, so the resolver never reads a non-public or unordered zone (Foundation #4, #12).
3. No backwards-compat shim: `ObserverVisiblePrefix` is replaced, not aliased. The `.strict()` zod schema rejects the legacy `zones`/`maxItems` shape with a clean error — no `_legacy` field, no compat branch (Foundation #14). Source, FITL data, and all owned tests migrate in this one change so source and tests never disagree.

## What to Change

### 1. Kernel types (`types-core.ts`)

- Replace `ObserverVisiblePrefix` with `{ readonly sources: readonly ObserverVisibleSource[] }` — drop `zones` and `maxItems`.
- Add `ObserverVisibleSource = { readonly id: string; readonly take: number }`.
- Extend `PhaseScheduleResolution` `ready` + `partial` variants with `readonly visibleSequenceSources: readonly { readonly zoneId: string; readonly availablePublic: number; readonly taken: number }[]`.
- Extend `PolicyScheduleInputRefTrace` `ready` + `partial` variants (lines ~1857-1874) with the same `visibleSequenceSources` field.

### 2. Zod schemas (`schemas-core.ts`)

- `ObserverPolicySchema` (line ~218): `visiblePrefix` becomes `{ sources: z.array(z.object({ id: StringSchema, take: <positive integer schema> }).strict()) }` — drop `maxItems`. Keep `.strict()` on every nested object.
- Trace schema (lines ~2183-2191): add `visibleSequenceSources` to the `ready` + `partial` schedule-input-ref trace shapes.

### 3. GameSpecDoc type (`game-spec-doc.ts`)

- `GameSpecObserverVisiblePrefixDef` (lines ~169-185): `zones` → `sources` with `take`.

### 4. Diagnostic codes (`compiler-diagnostic-codes.ts`)

- Add `OBSERVER_POLICY_MISSING_TAKE`, `OBSERVER_POLICY_INVALID_TAKE`.
- Remove `OBSERVER_POLICY_INVALID_MAXITEMS`.
- Keep `OBSERVER_POLICY_UNKNOWN_KIND`, `OBSERVER_POLICY_DEFERRED_KIND`, `OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX`, `OBSERVER_POLICY_UNKNOWN_ZONE`, `OBSERVER_POLICY_NON_PUBLIC_ZONE`, `OBSERVER_POLICY_INVALID_ZONE_KIND`, `OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX`, `OBSERVER_POLICY_DUPLICATE_ZONE` — a source's `id` is still a zone reference, so the `_ZONE` codes remain accurate.

### 5. Compiler validation (`compile-phase-boundaries.ts`)

- Rewrite `validateObserverPolicy` (lines ~198-319): validate `visiblePrefix.sources` is a non-empty ordered list (`OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX`, message updated `zones`→`sources`); each `source.take` is a required positive integer (`OBSERVER_POLICY_MISSING_TAKE` when absent, `OBSERVER_POLICY_INVALID_TAKE` when present but not a positive integer); each `source.id` resolves to a declared zone, is `visibility: public`, has deterministic order (`ordering !== 'set'`), is not the deck's `drawZone`, and is not duplicated (existing `_ZONE` codes, applied to `source.id`). Remove the `maxItems` check entirely.

### 6. compile-agents.ts type reference

- `compile-agents.ts:~2239-2252` `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` — type-reference update only; confirm during implementation it does not introspect `visiblePrefix.zones`/`.sources` and keep its logic unchanged.

### 7. TS runtime resolver (`policy-runtime.ts`)

- Rewrite `resolveVisiblePrefixBoundaryCardDistance` (lines ~349-383) per spec §4.2: for each source in declaration order, read `readPublicZoneCards`, take `min(source.take, cards.length)` cards from the top, match `cardSelector` against the composed sequence; return `ready` at the matched composed-sequence index, else `partial.lowerBound: <composed sequence length>`. Populate `visibleSequenceSources` (`zoneId`, `availablePublic`, `taken`) on both `ready` and `partial` outcomes. An empty source contributes 0 cards and 0 to `distance`.

### 8. WASM host-side resolver (`policy-wasm-phase-schedule-encoding.ts`)

- Rewrite the parallel `resolveVisiblePrefixBoundaryCardDistance` copy (lines ~142-264) identically to the TS resolver. The `[number, number]` encoding seam is unchanged — `ready` value and `partial` lowerBound encode exactly as before.

### 9. JSON schema artifacts

- Re-emit `GameDef.schema.json` and `Trace.schema.json` via `pnpm -F @ludoforge/engine run schema:artifacts` (or `pnpm turbo schema:artifacts`).

### 10. FITL data migration (`30-rules-actions.md`)

- Migrate the `coupEntry` boundary's `observerPolicy.visiblePrefix` from `zones: [{id: played:none}, {id: lookahead:none}], maxItems: 2` to `sources: [{id: played:none, take: 1}, {id: lookahead:none, take: 1}]`. Leave `eventDecks.discardZone: played:none` unchanged — the played pile stays the accumulated public history; the policy takes only its top card.

### 11. Migrate the 8 owned test files

Mechanically migrate each to the `sources` schema (see Test Plan for per-file rationale).

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-phase-boundaries.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — owned trace-contract fallout for `visibleSequenceSources`)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)
- `packages/engine/schemas/Trace.schema.json` (modify — regenerated)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/partial-visibility-compile-validation.test.ts` (modify)
- `packages/engine/test/integration/partial-visibility-determinism.test.ts` (modify)
- `packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts` (modify)
- `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts` (modify)
- `packages/engine/test/integration/partial-visibility-no-leak.test.ts` (modify)
- `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` (modify)
- `packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts` (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (modify)
- `packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` (modify — existing FITL boundary literal fallout)
- `packages/engine/test/integration/schedule-ref-consideration-trace.test.ts` (modify — existing trace literal fallout)

## Out of Scope

- Cookbook rewrite (`docs/agent-dsl-cookbook.md`) — `archive/tickets/171VISSEQPROJ-002.md`.
- New regression tests (`partial-visibility-fitl-production-flow.test.ts`, `partial-visibility-source-take-cap.test.ts`) — `archive/tickets/171VISSEQPROJ-003.md`.
- `order` / `role` per-source fields — rejected by spec §3 (redundant with the zone's own `ordering`; diagnostic ornamentation). Do NOT add them.
- Aggregate `maxItems` retention or an `OBSERVER_VISIBLE_SEQUENCE_SOURCE_UNREACHED` runtime advisory — rejected by spec §3 (with `maxItems` gone there is no aggregate budget to starve a source).
- `omniscient` / `observerView` observer policies — remain reserved, rejected via the existing `OBSERVER_POLICY_DEFERRED_KIND`. No behavior change.
- `turn-flow-lifecycle.ts` — the card lifecycle is unchanged; only the observer-policy resolution changes.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — the engine compiles with `ObserverVisiblePrefix.sources` across all consumers (resolver, WASM encoder, compiler, types).
2. `pnpm turbo typecheck` — no type errors in `policy-runtime.ts`, `policy-wasm-phase-schedule-encoding.ts`, `compile-phase-boundaries.ts`, `compile-agents.ts`, `game-spec-doc.ts`.
3. `partial-visibility-resolver-correctness.test.ts` — composed-sequence cases pass: match in source 0 → `ready: 0, visiblePrefixLength: 1`; match in source 1 → `ready: 1, visiblePrefixLength: 2`; a source with `take: 1` and ≥2 cards contributes exactly 1 to `distance`; empty source 0 + non-matching source 1 → `partial.lowerBound: 1`; all sources empty → `partial.lowerBound: 0`.
4. `partial-visibility-compile-validation.test.ts` — `OBSERVER_POLICY_MISSING_TAKE`, `OBSERVER_POLICY_INVALID_TAKE`, and the `sources`-required rejection rows pass; no `OBSERVER_POLICY_INVALID_MAXITEMS` row remains.
5. `partial-visibility-no-leak.test.ts` — a coup beyond every source's `take` resolves `partial.lowerBound`, never an exact distance.
6. `pnpm -F @ludoforge/engine run schema:artifacts:check` — emitted JSON schema artifacts match the regenerated `observerPolicy.visiblePrefix.sources` shape.
7. Existing suite: `pnpm turbo test`.

### Invariants

1. `ObserverVisiblePrefix` has no `maxItems` or `zones` member anywhere in `packages/engine/src` — `grep -rn` for `visiblePrefix` returns only the `sources` shape.
2. The visible-sequence scan bound is `sum(source.take)`, a compile-time constant — no runtime aggregate cap, no unbounded zone scan (Foundation #10).
3. The resolver consults only `visibility: public` source zones; the compiler enforces this per source (Foundation #4).
4. No compatibility shim, alias path, or `_legacy` field for the `zones`/`maxItems` shape (Foundation #14).
5. WASM and TS resolvers produce identical scalar score rows for `ready` and `partial.lowerBound` resolutions (Foundation #5; pinned by `policy-bytecode-equivalence-partial-visibility.test.ts`).
6. Determinism: the same GameDef + state + seed produces identical resolver readouts (Foundation #8; pinned by `partial-visibility-determinism.test.ts`).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/partial-visibility-compile-validation.test.ts` — rejection rows updated for `sources`/`take`; remove the `OBSERVER_POLICY_INVALID_MAXITEMS` row; add `OBSERVER_POLICY_MISSING_TAKE` / `OBSERVER_POLICY_INVALID_TAKE` rows.
2. `packages/engine/test/integration/partial-visibility-determinism.test.ts` — fixture GameSpec uses `sources`.
3. `packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts` — fixtures use `sources` with explicit `take`; the five status cases re-expressed against composed-sequence semantics.
4. `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts` — fixture boundary uses `sources`; the `onPartial` routing assertions stay unchanged (the three resolution statuses are stable).
5. `packages/engine/test/integration/partial-visibility-no-leak.test.ts` — fixture uses `sources`.
6. `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` — the `assert.deepEqual(boundary?.schedule, { … })` literal is updated to the `sources` shape (a schema migration, not a trajectory re-bless); the `withVisibleCards` artificial-state cases are retained as valid one-card-per-source coverage.
7. `packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts` — trace assertions add `visibleSequenceSources`.
8. `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` — fixture profile/boundary use `sources`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine run schema:artifacts:check`
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

Completion date: 2026-05-14.
Outcome amended: 2026-05-14.

The implementation cut replaces the legacy `visiblePrefix.zones` + `maxItems` contract with `visiblePrefix.sources[]` and required per-source `take` across the kernel type, zod schema, GameSpecDoc type, compiler validation diagnostics, TS resolver, WASM host-side resolver, generated schema artifacts, FITL `coupEntry` data, and the owned integration fixtures.

Touched-file corrections:

- `packages/engine/src/agents/policy-evaluation-core.ts` was added to the touched surface because it owns the verbose trace type and recorder that must carry `visibleSequenceSources`.
- `packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` and `packages/engine/test/integration/schedule-ref-consideration-trace.test.ts` were added as existing literal fallout from the shared contract and trace shape migration.
- `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts` and `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` were ticket-named tests that required no source edit after live reassessment; both were still included in the focused compiled test proof as verified-no-edit coverage.
- `packages/engine/src/cnl/compile-agents.ts` was inspected; its `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` logic keys only on `topNVisible` and does not introspect `visiblePrefix`, so no source edit was required.
- Cookbook docs remain owned by `archive/tickets/171VISSEQPROJ-002.md`; new regression test files remain owned by `archive/tickets/171VISSEQPROJ-003.md`.

Schema/artifact fallout:

- `pnpm -F @ludoforge/engine run schema:artifacts` wrote `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`; only `GameDef.schema.json` and `Trace.schema.json` persisted as diffs.
- `GameDef.schema.json` now exposes `visiblePrefix.sources[].id/take`; `Trace.schema.json` now exposes `visibleSequenceSources` on ready/partial schedule input ref traces.
- Final post-broad-lane schema check: `pnpm -F @ludoforge/engine run schema:artifacts:check` passed.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | --- | --- | --- |
| `packages/engine/src/kernel/types-core.ts` | 2310 | 2324 | no; preexisting over-guidance | yes, +14 net | canonical type hub; extracting a two-field schema contract would obscure the atomic cut | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2739 | 2751 | no; preexisting over-guidance | yes, +12 net | canonical zod schema mirror; local edit keeps generated schema provenance clear | none |
| `packages/engine/src/cnl/game-spec-doc.ts` | 878 | 877 | no; preexisting over-guidance | no net growth | canonical authored GameSpecDoc type hub; no extraction needed for a shape replacement | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2208 | 2222 | no; preexisting over-guidance | yes, +14 net | canonical trace recorder/type hub; extraction would widen beyond this trace-field migration | none |
| `packages/engine/src/agents/policy-runtime.ts` | 786 | 799 | no; remains under 800 | yes, +13 net | resolver stayed local and below cap; no split required | none |

Final verification:

- `pnpm -F @ludoforge/engine build` — passed after the malformed negative test fixture cast was narrowed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-compile-validation.test.js dist/test/integration/partial-visibility-resolver-correctness.test.js dist/test/integration/partial-visibility-no-leak.test.js dist/test/integration/partial-visibility-fitl-coup-distance.test.js dist/test/integration/schedule-ref-consideration-trace-topNVisible.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js dist/test/integration/phase-boundary-fitl-coup-distance.test.js dist/test/integration/schedule-ref-consideration-trace.test.js dist/test/integration/partial-visibility-determinism.test.js dist/test/integration/partial-visibility-fallback-routing.test.js` — passed, 34 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm turbo build` — passed. Cache classification: engine and runner rebuilt; engine-wasm was cache-hit supplemental.
- `pnpm turbo lint` — passed. Cache classification: engine lint ran; runner lint was cache-hit supplemental.
- `pnpm turbo typecheck` — passed. Cache classification: engine and runner typecheck ran; engine build replay was cache-hit supplemental from the same final build input.
- `pnpm turbo test` — passed. Runner: 205 files / 2019 tests passed. Engine default lane summary: 79/79 files passed; focused ticket files passed inside the lane. Cache classification: package build prerequisites replayed from the final build inputs, while engine and runner tests ran.
- `rg -n "visiblePrefix\.(zones|maxItems)|OBSERVER_POLICY_INVALID_MAXITEMS|readonly zones: readonly \{ readonly id: string \}\[\]|readonly maxItems: number|visiblePrefix: \{ zones" packages/engine/src packages/engine/test data/games/fire-in-the-lake/30-rules-actions.md packages/engine/schemas` — passed with zero matches.
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2333 archived tickets.
- `git diff --check` — passed. `git diff --no-index --check /dev/null tickets/171VISSEQPROJ-001.md` produced no whitespace diagnostics; exit code 1 was the expected ordinary no-index diff status for a non-empty untracked file.

Late-edit proof validity:

- Terminal status and proof/checker transcription only; no scope, acceptance, command semantics, touched-file ownership, sibling ownership, or dependency classification changed after the final broad lanes. `pnpm -F @ludoforge/engine run schema:artifacts:check` was rerun after the broad lanes and remained green.
