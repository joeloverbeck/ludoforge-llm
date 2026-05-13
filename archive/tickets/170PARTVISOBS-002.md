# 170PARTVISOBS-002: Runtime resolver branch, `partial.lowerBound` status, fallback evaluator, and trace

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/agents/microturn-option-eval.ts`, `packages/engine/src/agents/policy-agent.ts` (trace surface), four new integration tests
**Deps**: `archive/tickets/170PARTVISOBS-001.md`

## Problem

Ticket 001 lands the type system + compiler validation; this ticket lands the runtime behavior the types describe. Without it, authoring an `observerPolicy: topNVisible` declaration compiles cleanly but produces no `partial` resolutions — the agent surface is still effectively the spec-169 binary path. This ticket extends `resolveBoundaryCardDistance` to scan the declared visible prefix in declared order, emit `ready` when a selector match is found, emit `partial.lowerBound` when the prefix exhausts with hidden tail remaining, route the `partial` resolution through a new `scheduleFallback.onPartial.visiblePrefixExhausted` evaluator path, and surface the observer-policy metadata in deterministic trace output. After this ticket, the partial-visibility signal is end-to-end usable by any consideration that opts into the new fallback discriminator. FITL data authoring is still deferred to ticket 004; this ticket proves correctness against synthetic fixtures only.

## Assumption Reassessment (2026-05-13)

1. `resolveBoundaryCardDistance` in `packages/engine/src/agents/policy-runtime.ts:296-329` performs a single binary visibility check at lines 312-313; no observer-policy branch exists — confirmed by direct read.
2. `PolicyScheduleFallback` in `packages/engine/src/agents/policy-evaluation-core.ts:78-90` carries `kind: 'noContribution' | 'constant' | 'dropConsideration'` for `onUnavailable` — confirmed by direct read. The `onPartial` discriminator type was added in ticket 001; this ticket adds the evaluator route.
3. `microturn-option-eval.ts:107-156` is the fallback application point (`scheduleOption: { scheduleFallbackFired }`) — confirmed by direct read.
4. Trace surface for schedule fallbacks is `PolicyScheduleFallbackFired` carried on `scoreContribution` rows; existing pinned trace fixtures live in `packages/engine/test/integration/schedule-ref-consideration-trace.test.ts` (verified to exist).
5. FITL `cardLifecycle` exposes both `lookahead:none` AND `leader:none` as `visibility: public, ordering: stack` (verified in `data/games/fire-in-the-lake/10-vocabulary.md:62-69` this session). This ticket uses synthetic fixtures, but the FITL shape informs the fixture topology (2-zone visible prefix).

## Architecture Check

1. **Preview signal integrity (Foundation #20)**: The runtime emits `partial.lowerBound` as a distinct resolution kind, never coerced into `unavailable`. The fallback evaluator routes `partial` through `onPartial.visiblePrefixExhausted` exclusively — `onUnavailable` is NOT consulted when the resolution kind is `partial`. The §8.5 leakage test in spec 170 asserts hidden deck composition cannot be recovered through the partial signal.
2. **Bounded computation (Foundation #10)**: The resolver scans at most `maxItems` cards across the declared zones, hard-bounded at compile time per ticket 001's validation.
3. **One rules protocol (Foundation #5)**: The resolver path is shared between agents and the simulator. WASM parity is in scope only for ticket 003; this ticket ensures the TS path is consistent and deterministic for both.
4. **Authoritative state + observer views (Foundation #4)**: `readPublicZoneCards` consults only zone contents whose `visibility: public` has been compile-validated. No observer-profile state is consulted. The compiler proved each listed zone public at ticket 001's validation stage.
5. **No backwards-compat shims (Foundation #14)**: Boundaries without `observerPolicy` continue to take the spec-169 binary path verbatim; existing golden traces (spec 169 §8.2) are pinned unchanged. No alias paths.

## What to Change

### 1. Resolver branch in `resolveBoundaryCardDistance` (`packages/engine/src/agents/policy-runtime.ts:296-329`)

Before the existing draw-zone-visibility check, branch on `observerPolicy`:

```ts
const observerPolicy = boundary.definition.schedule?.observerPolicy;
if (observerPolicy?.kind === 'topNVisible') {
  const zones = observerPolicy.visiblePrefix.zones;
  const maxItems = observerPolicy.visiblePrefix.maxItems;
  let scanned = 0;
  for (const zoneRef of zones) {
    if (scanned >= maxItems) break;
    const slotCards = readPublicZoneCards(state, zoneRef.id);
    for (const card of slotCards) {
      if (scanned >= maxItems) break;
      if (matchesCardSelector(card, cardSelector, def)) {
        return {
          kind: 'ready',
          value: scanned,
          observerPolicy: { kind: 'topNVisible' },
          visiblePrefixLength: scanned + 1,
        };
      }
      scanned += 1;
    }
  }
  return {
    kind: 'partial',
    partialKind: 'lowerBound',
    lowerBound: scanned,
    observerPolicy: { kind: 'topNVisible' },
    visiblePrefixLength: scanned,
  };
}
// Fall through to existing public-deck resolution path (unchanged).
```

Add the `readPublicZoneCards(state, zoneId)` helper. It reads `state.zones[zoneId]` in zone-declared order. Compile validation has already proven each listed zone public; no per-call observer profile resolution is needed. Place the helper in `policy-runtime.ts` adjacent to `resolveBoundaryCardDistance`, or in a sibling utility if one surfaces during implementation. Add `matchesCardSelector` if not already shared; otherwise reuse the existing spec-169 implementation.

### 2. Fallback evaluator routing in `policy-evaluation-core.ts:78-90` and `microturn-option-eval.ts:107-156`

Extend `PolicyScheduleFallback` (or whatever type covers the `onPartial` discriminator added in ticket 001) with the runtime application. When a `value` ref reads a schedule-distance resolution whose `kind === 'partial'`:

- Route through `onPartial.visiblePrefixExhausted` (NOT `onUnavailable`).
- Apply the discriminator kind:
  - `useLowerBound` → numeric value = `partial.lowerBound`.
  - `noContribution` → numeric value = 0; contribution dropped.
  - `dropConsideration` → consideration removed from the scoring sum entirely.
  - `constant: <number>` → numeric value = the declared constant.
- Set `scheduleFallbackFired` to `{ kind, reason: 'partial.lowerBound.visiblePrefixExhausted' }` on the trace row.

### 3. Trace surface in `policy-agent.ts` (and per-option eval helpers)

For `ready` resolutions under `topNVisible`, the per-option trace `inputRefs[refId]` records:

```json
{
  "status": "ready",
  "value": <n>,
  "observerPolicy": "topNVisible",
  "visiblePrefixLength": <m>
}
```

For `partial.lowerBound` resolutions, the row records the partial signal AND the applied fallback (per spec 170 §4.5):

```json
{
  "status": "partial",
  "partialKind": "lowerBound",
  "lowerBound": <n>,
  "observerPolicy": "topNVisible",
  "visiblePrefixLength": <n>,
  "fallbackApplied": { "kind": "<useLowerBound|noContribution|...>", "numericValue": <v> }
}
```

Where the consideration is dropped or scores zero, also emit the existing `scheduleFallbackFired` row with `reason: 'partial.lowerBound.visiblePrefixExhausted'`.

### 4. Test fixtures

Build a minimal synthetic GameDef fixture (no FITL coupling): a single phase with a card-draw schedule, a deck with one hidden draw zone, and either one or two public visible-prefix zones. The fixture is reused across the four new test files for shape consistency. Place fixture helper in `packages/engine/test/integration/fixtures/` per existing conventions; check sibling fixtures' shape before authoring.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify) — extend `resolveBoundaryCardDistance` with `topNVisible` branch; add `readPublicZoneCards` helper.
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — extend fallback application path to handle `partial.lowerBound` routing through `onPartial.visiblePrefixExhausted`.
- `packages/engine/src/agents/microturn-option-eval.ts` (modify) — route `partial.lowerBound` resolutions through the new evaluator path; emit `scheduleFallbackFired` rows with the partial-specific reason.
- `packages/engine/src/agents/policy-agent.ts` (modify) — extend per-option trace surface to record observerPolicy metadata + fallbackApplied on partial resolutions.
- `packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts` (new) — 5 resolver cases.
- `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts` (new) — each `onPartial.visiblePrefixExhausted` kind routed correctly.
- `packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts` (new) — golden trace pinning for both `ready` and `partial.lowerBound` rows under `topNVisible`.
- `packages/engine/test/integration/partial-visibility-no-leak.test.ts` (new) — hidden-tail leakage assertion.

## Out of Scope

- WASM opcode parity for `topNVisible` and `partial.lowerBound` — deferred to ticket 003.
- FITL data authoring (`observerPolicy` on `coupEntry`, profile `onPartial`, cookbook section) — deferred to ticket 004.
- Compiler validation diagnostics — landed in ticket 001; this ticket does not add new diagnostics.
- Schedule kinds beyond `cardDraw` — `turnCount`, `condition`, etc. remain reserved per spec 169.
- Changes to existing `unavailable: hiddenDeck` behavior for non-policy-bearing boundaries.

## Acceptance Criteria

### Tests That Must Pass

1. `partial-visibility-resolver-correctness.test.ts` — 5 cases against the synthetic fixture:
   - (a) match at index 0 → `ready: value: 0, visiblePrefixLength: 1`.
   - (b) match at index 1 → `ready: value: 1, visiblePrefixLength: 2`.
   - (c) no match across 2 occupied zones → `partial: lowerBound: 2`.
   - (d) one empty zone + one occupied non-matching → `partial: lowerBound: 1`.
   - (e) all listed zones empty → `partial: lowerBound: 0`.
2. `partial-visibility-fallback-routing.test.ts` — each `onPartial.visiblePrefixExhausted` kind (`useLowerBound`, `noContribution`, `dropConsideration`, `constant`) routes correctly; assert that `onUnavailable` is NEVER consulted when the resolution kind is `partial`.
3. `schedule-ref-consideration-trace-topNVisible.test.ts` — golden trace pins per-candidate `inputRefs[].observerPolicy`, `visiblePrefixLength`, and `fallbackApplied` for both ready and partial cases.
4. `partial-visibility-no-leak.test.ts` — for a fixture state where the hidden deck contains a coup card BEYOND the visible prefix, assert the resolver returns `partial.lowerBound: maxItems` (never the exact distance).
5. Existing suite: `pnpm turbo test` — no regressions. Spec 169 golden traces (`phase-boundary-fitl-coup-distance.test.ts`) preserved exactly (still emitting `unavailable: hiddenDeck` since FITL data does not yet declare `observerPolicy`).
6. Replay-determinism: same GameDef + seed produces identical resolver readouts across 20 turns.

### Invariants

1. **Partial-status routing is exclusive**: a `partial` resolution NEVER triggers the `onUnavailable` fallback path. The fallback evaluator dispatches by `resolution.kind` first, then by sub-discriminator.
2. **No leakage**: the resolver consults only zones whose `visibility: public` was compile-validated in ticket 001. No call site reads the hidden deck zone via this code path.
3. **Bounded computation**: scan terminates in O(maxItems) cards regardless of zone occupancy.
4. **Trace determinism**: trace output for the same GameDef + seed is byte-identical across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts` — architectural-invariant. 5 resolver cases per spec §7 Phase 1 acceptance.
2. `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts` — architectural-invariant. Each `onPartial` kind routed correctly; `onUnavailable` exclusion.
3. `packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts` — golden-trace. Pins both ready and partial trace rows.
4. `packages/engine/test/integration/partial-visibility-no-leak.test.ts` — architectural-invariant. Leakage assertion per spec §8.5.

Test class headers per `.claude/rules/testing.md`:
- `// @test-class: architectural-invariant` on resolver-correctness, fallback-routing, no-leak.
- `// @test-class: golden-trace` on schedule-ref-consideration-trace-topNVisible.

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-fallback-routing.test.ts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts`
4. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-no-leak.test.ts`
5. `pnpm -F @ludoforge/engine test packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` — regression check: spec 169 golden traces unchanged.
6. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
7. `pnpm turbo test` — full suite.

## Outcome (2026-05-13)

Outcome amended: 2026-05-13

Implemented the Spec 170 Phase 1 TypeScript runtime slice:

- Added `topNVisible` visible-prefix scanning to the schedule-distance resolver for `cardDraw`/`cards` refs. The resolver reads only declared public visible-prefix zones, scans at most `maxItems`, emits `ready` with observer metadata on matches, and emits `partial.lowerBound` when the visible prefix exhausts.
- Routed `partial.lowerBound` through `scheduleFallback.onPartial.visiblePrefixExhausted` rather than `onUnavailable`. `useLowerBound` and `constant` substitute a numeric value before weight multiplication; `noContribution` contributes zero; `dropConsideration` drops the row.
- Added deterministic trace metadata for topNVisible schedule refs: candidate `inputRefs[refId]` now records ready/partial status, observer policy, visible-prefix length, lower bound, and `fallbackApplied` for partial fallbacks. `scheduleFallbackFired` now records `reason: partial.lowerBound.visiblePrefixExhausted` for partial fallback routes.
- Kept WASM parity deferred at this ticket's closeout to `archive/tickets/170PARTVISOBS-003.md` by making topNVisible schedule-distance rows unsupported for the WASM score-row route so the TypeScript evaluator owns this ticket's behavior.
- Regenerated `packages/engine/schemas/Trace.schema.json` from `packages/engine/src/kernel/schemas-core.ts` for the trace-shape change.
- Added the four ticket-named integration witnesses plus a shared synthetic fixture helper:
  - `packages/engine/test/integration/fixtures/partial-visibility-fixtures.ts`
  - `packages/engine/test/integration/partial-visibility-resolver-correctness.test.ts`
  - `packages/engine/test/integration/partial-visibility-fallback-routing.test.ts`
  - `packages/engine/test/integration/schedule-ref-consideration-trace-topNVisible.test.ts`
  - `packages/engine/test/integration/partial-visibility-no-leak.test.ts`

Post-review correction:

- Added the missing replay-determinism acceptance witness to `partial-visibility-resolver-correctness.test.ts`: the resolver now asserts byte-identical readouts across 20 turn-indexed states for the same synthetic fixture seed.

Ticket corrections applied:

- Touched-file scope expanded beyond the draft `Files to Touch` because the live trace contract is shared through `PolicyEvaluationMetadata`, policy-agent guided microturn paths, kernel trace types, Zod schema mirrors, and generated `Trace.schema.json`.
- The `policy-agent.ts` trace deliverable is implemented through the shared candidate metadata field `inputRefs`, which is then carried by both move and microturn policy-agent paths.
- WASM behavior remains out of scope for this ticket; topNVisible schedule-distance score rows are intentionally unsupported on the WASM route until ticket 003.

Deferred sibling/spec scope:

- `archive/tickets/170PARTVISOBS-003.md` owns WASM score-row parity support.
- `archive/tickets/170PARTVISOBS-004.md` owns FITL `observerPolicy` authoring, slot-order proof, and cookbook documentation.
- Compiler validation and type declarations were already completed by `archive/tickets/170PARTVISOBS-001.md`.

Schema/artifact fallout:

- `pnpm -F @ludoforge/engine run schema:artifacts` wrote `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`; only `packages/engine/schemas/Trace.schema.json` persisted as a diff.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` passed after regeneration.

Invariant proof matrix:

| Invariant | Witness/assertion | Status | Proof lane |
| --- | --- | --- | --- |
| `topNVisible` ready matches preserve exact visible-prefix distance | index 0 and index 1 assertions with observer metadata | proven | `partial-visibility-resolver-correctness.test.ts` |
| `partial.lowerBound` is emitted when the visible prefix exhausts | occupied, empty+occupied, and all-empty cases | proven | `partial-visibility-resolver-correctness.test.ts` |
| Partial-status routing is exclusive from `onUnavailable` | `onUnavailable.constant: 99` never used for partial; each `onPartial` kind asserted | proven | `partial-visibility-fallback-routing.test.ts` |
| No hidden-tail leakage | hidden draw zone contains a coup card but resolver returns only lower bound `2` | proven | `partial-visibility-no-leak.test.ts` |
| Trace determinism shape exposes observer policy and fallback | ready and partial candidate `inputRefs` pinned; partial fallback reason pinned | proven | `schedule-ref-consideration-trace-topNVisible.test.ts` |
| Replay-determinism readouts stay stable across 20 turn-indexed states | same fixture seed and visible prefix produce byte-identical partial readouts for turn counts 0-19 | proven | `partial-visibility-resolver-correctness.test.ts` |
| Non-policy-bearing FITL boundaries preserve `unavailable: hiddenDeck` | existing FITL coup-distance golden remains green | proven | `phase-boundary-fitl-coup-distance.test.ts` |
| WASM parity not silently claimed | topNVisible schedule refs fail closed to the TypeScript evaluator | deferred to confirmed sibling | `archive/tickets/170PARTVISOBS-003.md` |

Implementation-introduced branch ledger:

| Branch/status | Classification |
| --- | --- |
| `PhaseScheduleResolution.kind === "ready"` with `observerPolicy: topNVisible` | tested |
| `PhaseScheduleResolution.kind === "partial"` / `partialKind === "lowerBound"` | tested |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "useLowerBound"` | tested |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "noContribution"` | tested |
| `scheduleFallback.onPartial.visiblePrefixExhausted === "dropConsideration"` | tested |
| `scheduleFallback.onPartial.visiblePrefixExhausted.constant` | tested |
| WASM topNVisible schedule score row | deferred to confirmed sibling 003 |

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
| --- | ---: | ---: | --- | --- | --- | --- |
| `packages/engine/src/agents/policy-runtime.ts` | 717 | 786 | no | +69 net | Resolver branch is local to the existing schedule-distance resolver; extraction would obscure the ticket seam before any second consumer exists. | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2048 | 2208 | no; preexisting over guidance | +160 net | Canonical policy evaluator hub; new helper methods keep the partial route centralized with existing fallback state. | none |
| `packages/engine/src/agents/microturn-option-eval.ts` | 180 | 190 | no | +10 net | Small trace propagation only. | none |
| `packages/engine/src/agents/microturn-option-evaluator.ts` | 296 | 310 | no | +14 net | Small trace propagation only. | none |
| `packages/engine/src/agents/policy-agent.ts` | 907 | 925 | no; preexisting over guidance | +18 net | Shared trace propagation through existing frontier structures; extraction would widen beyond this ticket. | none |
| `packages/engine/src/agents/policy-eval.ts` | 1501 | 1512 | no; preexisting over guidance | +11 net | Canonical candidate metadata serializer; small field propagation only. | none |
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1153 | 1192 | no; preexisting over guidance | +39 net | Narrow fail-closed guard for deferred sibling 003; deleting or refactoring the WASM route is outside this ticket. | `archive/tickets/170PARTVISOBS-003.md` for behavior |
| `packages/engine/src/kernel/types-core.ts` | 2289 | 2310 | no; preexisting over guidance | +21 net | Canonical trace contract hub; type addition mirrors runtime trace output. | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2717 | 2739 | no; preexisting over guidance | +22 net | Canonical Zod/schema mirror; required by generated trace schema. | none |
| `packages/engine/test/integration/fixtures/partial-visibility-fixtures.ts` | 0 | 274 | no | new file | Shared synthetic fixture keeps the four ticket witnesses consistent. | none |

Verification completed before final root lanes:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-resolver-correctness.test.js dist/test/integration/partial-visibility-fallback-routing.test.js dist/test/integration/schedule-ref-consideration-trace-topNVisible.test.js dist/test/integration/partial-visibility-no-leak.test.js` — passed initially (12 tests), then passed after post-review determinism-witness cleanup (13 tests).
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/phase-boundary-fitl-coup-distance.test.js` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — initially failed on `Trace.schema.json`, then passed after `pnpm -F @ludoforge/engine run schema:artifacts`.

Final proof:

- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed (5/5 tasks successful; engine default lane summary 77/77 files passed).
- Post-review cleanup proof: `pnpm -F @ludoforge/engine build` — passed; focused four-file partial-visibility Node test command above — passed (13 tests).

Terminal-status edit note:

- The terminal status/proof transcription above did not change implementation scope or acceptance criteria; it only records the already-completed final root lanes.
