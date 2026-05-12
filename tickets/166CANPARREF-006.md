# 166CANPARREF-006: FITL `event` action params declaration + ARVN shaded-event witness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None (engine code unchanged — this is a GameSpecDoc data change and a profile-quality witness)
**Deps**: `archive/tickets/166CANPARREF-005.md`

## Problem

Spec 166 §2.3 documents a structural mismatch: `data/games/fire-in-the-lake/30-rules-actions.md:160` declares `event: params: []`, but `packages/engine/src/kernel/legal-moves.ts:1273-1325` (`enumerateCurrentEventMoves`) emits candidates with `params: { eventCardId, eventDeckId, side, branch? }`. Consequently, `lowerCandidateParamDefs` produces `candidateParamDefs = {}` for event-class candidate params, so any `candidate.params.side` ref against FITL `event` candidates would resolve to unavailable at runtime.

Phase 5 (this ticket) closes the mismatch and lands the FITL ARVN convergence-witness that the spec is motivated by: with `avoidShadedEvent` active in ARVN, shaded event selections drop to zero across the 15-seed campaign unless no unshaded alternative is legal. Spec §2.5's empirical baseline showed shaded events played 40% of the time pre-fix; the witness asserts the new ref family resolves the gap.

Open Question §11.4 — the FITL `branch` domain — is decided in this ticket.

## Assumption Reassessment (2026-05-11)

1. `data/games/fire-in-the-lake/30-rules-actions.md:160` declares `event` action with `params: []`. Verified — exact line confirms the mismatch.
2. `packages/engine/src/kernel/legal-moves.ts:1273-1325` emits `params: { eventCardId, eventDeckId, side, branch? }`. Verified by spec; kernel is UNCHANGED by this ticket.
3. `pivotalEvent` at `30-rules-actions.md:993-999` declares the canonical `params: [{ name: eventCardId, domain: { query: enums, values: [card-121, card-122, card-123, card-124] } }]` shape per Spec 166 §2.3. Confirms the generic declarative shape is sufficient — no new domain grammar is required.
4. Tickets 001–005 are landed and the candidate-param ref family is end-to-end functional against the synthetic two-action fixture.
5. The fitl-arvn-agent-evolution campaign baseline tier-15 ARVN profile is the empirical baseline cited by §2.5. The witness fixture for this ticket lives under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/` per Spec 166 §8.1 #16 (Witness id: `spec-166-candidate-params-fitl-witness`).

## Architecture Check

1. **No engine change (Foundation #1).** This ticket is a GameSpecDoc data declaration plus a profile-quality witness. The kernel's emission contract at `legal-moves.ts:1273-1325` is unchanged; only the GameSpecDoc declaration catches up to what the kernel already emits.
2. **Existing generic grammar (Foundation #6).** The four new params on `event` use the existing `params: [{ name, domain }]` shape, mirroring `pivotalEvent.eventCardId`. No new schema grammar invented; the option-rejection of a new `valuesFrom: dataAsset` grammar (per Spec 166 §3) is honored.
3. **Convergence-witness, not architectural-invariant (`.claude/rules/testing.md`).** The FITL ARVN shaded-event suppression is a profile-quality signal, not a kernel invariant — failures emit `POLICY_PROFILE_QUALITY_REGRESSION` advisories (non-blocking). Witness id format follows the canonical `<spec-id>-<slug>` convention.
4. **Open Question §11.4 resolved.** The `branch` param domain decision is documented in this ticket's "What to Change" §2 below and applied to the GameSpecDoc declaration.

## What to Change

### 1. Declare `event` action params

`data/games/fire-in-the-lake/30-rules-actions.md:160` — change:

```yaml
- { id: event, tags: [event-play], actor: active, executor: 'actor', phase: [main],
    capabilities: [cardEvent], params: [], pre: null, cost: [], effects: [], limits: [] }
```

to (block-form for readability; equivalent flow form is also acceptable):

```yaml
- id: event
  tags: [event-play]
  actor: active
  executor: 'actor'
  phase: [main]
  capabilities: [cardEvent]
  params:
    - { name: eventCardId, domain: { query: enums, valuesFrom: { dataAsset: 'fitlEventCardIds' } } }
    - { name: eventDeckId, domain: { query: enums, valuesFrom: { dataAsset: 'fitlEventDeckIds' } } }
    - { name: side, domain: { query: enums, values: [unshaded, shaded] } }
    - { name: branch, domain: { query: enums, valuesFrom: { dataAsset: 'fitlEventBranchIds' } } }
  pre: null
  cost: []
  effects: []
  limits: []
```

The `side` param uses inline literal values because the enumeration is small and stable. The `eventCardId`, `eventDeckId`, and `branch` params use `valuesFrom: { dataAsset: ... }` referring to small embedded GameSpecDoc data assets enumerating the valid ids (see §2 below).

### 2. Resolve Open Question §11.4 — `branch` domain (and helper data assets)

**Decision**: declare `branch` as `domain: { query: enums, valuesFrom: { dataAsset: 'fitlEventBranchIds' } }` per Open Question §11.4 option (a) — use a single data asset enumerating every branch id across all FITL event cards.

Rationale (recorded here per Spec 166 §11.4's "decision is implementation-time, recorded in the Phase 5 ticket"):

- Option (b) (empty `values: []` + runtime relaxation) would require a new schema-level semantic carve-out that no other action declares; it weakens the cross-game generic guarantee (Foundation #6).
- Option (c) (leave `branch` undeclared; consumers handle via `onMissing: { kind: constant, value: __absent__ }`) shifts the work to every consideration that references `branch` and silently degrades type discrimination at compile time.
- Option (a) requires a one-time enumeration of all branch ids across `data/games/fire-in-the-lake/event-cards/` (or wherever cards are authored). This enumeration is mechanical and derivable from existing card data; bundling it as a small data asset keeps the GameSpecDoc declaratively complete.

Add three new data assets to the FITL GameSpecDoc (location: alongside the existing FITL dataAssets, typically in `data/games/fire-in-the-lake/00-data-assets.md` or the canonical dataAssets file — confirm during implementation):

- `fitlEventCardIds` (kind: `idList`, payload: enumerated card ids — derived from existing event card definitions).
- `fitlEventDeckIds` (kind: `idList`, payload: e.g., `['early-war', 'mid-war', 'late-war']` or whatever the canonical deck-id set is — verify against current FITL data during implementation).
- `fitlEventBranchIds` (kind: `idList`, payload: union of all distinct branch ids across `unshaded.branches[]` and `shaded.branches[]` of every event card).

If during implementation it becomes clear that maintaining the `fitlEventBranchIds` enumeration is materially more burdensome than the ref-family ergonomics gain — for example, if branch ids are not centrally cataloged today — fall back to option (c) per Spec 166 §11.4: leave `branch` undeclared on the `event` action declaration (so it does not appear in `candidateParamDefs`), and document for downstream considerations that a `candidate.params.branch` ref will resolve unavailable. Record the fallback decision in this ticket's Outcome on archival. Either option (a) or (c) is an acceptable spec-compliant resolution; option (a) is preferred.

The `fitlEventCardIds` and `fitlEventDeckIds` assets should already be straightforward to enumerate from existing card data; if they exist under different names, reuse the existing assets and update the `valuesFrom` references accordingly.

### 3. Profile fixture exercising `avoidShadedEvent`

Add an ARVN profile variant (under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/`) including:

```yaml
avoidShadedEvent:
  scopes: [move]
  weight: -800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.params.side }
        - shaded
  candidateParamFallback:
    onUnavailable: noContribution
```

The fixture uses the tier-15 ARVN baseline from `fitl-arvn-agent-evolution` per Spec §2.5 with `avoidShadedEvent` added.

### 4. Golden-trace tests (FITL-specific)

Add under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/`:

- `candidate-params-fitl-seed-1001-side.test.ts` (Spec 166 §8.1 #13) — seed 1001 turn N: card-78 shaded candidate records `contribution: -800`; unshaded candidate records `0`; both candidates have empty `unknownCandidateParamRefs`. Pinned trace fixture file. Header: `// @test-class: golden-trace`.

- `candidate-params-optional-branch-missing.test.ts` (§8.1 #14) — card-event candidate without `branch` resolves through `onMissing: { kind: constant, value: __absent__ }` fallback and records `status: 'missing'` with `resolvedValue: '__absent__'`. Trace does NOT route through `unknownCandidateParamRefs`. Header: `// @test-class: golden-trace`.

- `candidate-params-pivotal-event-id.test.ts` (§8.1 #15) — `candidate.params.eventCardId` reads each of card-121..card-124 as a branded card id; `in` and `eq` operators compose correctly against card literals. Header: `// @test-class: golden-trace`.

### 5. Convergence-witness test

`packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-arvn-shaded-event-suppression.test.ts` (Spec 166 §8.1 #16):

- Header: `// @test-class: convergence-witness` + `// @witness: spec-166-candidate-params-fitl-witness`.
- Runs the 15-seed campaign (seeds 1000–1014) against the ARVN baseline with `avoidShadedEvent` active. Asserts shaded event selections drop to zero across the campaign, MODULO the explicit carve-out: when no unshaded alternative is legal at a given frontier, OR when another explicit profile consideration overwhelms the -800 penalty.
- Failures emit `POLICY_PROFILE_QUALITY_REGRESSION` (non-blocking CI summary), not a blocking failure (per Foundation appendix / `.claude/rules/testing.md`).

### 6. Verification command (witness baseline)

Before archival, run the fitl-arvn-agent-evolution baseline command to capture the expected campaign composite score with `avoidShadedEvent` active. Reference Spec §2.5 — baseline composite was -3.8 (pre-`preferEvent` boost); with the new ref family resolving the discrimination gap, the campaign composite should hold or improve at -3.8 or better. Document the captured composite in the Outcome.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — line 160 action declaration)
- `data/games/fire-in-the-lake/<dataAssets-file>.md` (modify — add `fitlEventCardIds`, `fitlEventDeckIds`, `fitlEventBranchIds` data assets; exact file path confirmed during implementation)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/avoid-shaded-event-fixture.yaml` (new — ARVN profile variant)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/candidate-params-fitl-seed-1001-side.test.ts` (new)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/candidate-params-optional-branch-missing.test.ts` (new)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/candidate-params-pivotal-event-id.test.ts` (new)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-arvn-shaded-event-suppression.test.ts` (new)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/seed-1001-card-78-trace.json` (new — pinned golden trace)

`Likely surface` for the FITL data assets file — confirm during implementation against current FITL data layout (most likely under `data/games/fire-in-the-lake/00-data-assets.md` or `data/games/fire-in-the-lake/event-cards.md`).

## Out of Scope

- Engine-side code changes (kernel, compiler, runtime, VM, trace plumbing) — all owned by tickets 001–005. This ticket consumes the engine surface those tickets ship.
- Microturn lowering of FITL event side/branch (Option D from the trigger report) — explicitly deferred per Spec §3.
- Dynamic per-candidate tag emission (Option C) — explicitly rejected per Spec §3.
- Telemetry advisory `POLICY_PREVIEW_UNIFORM_SIGNAL` (preview-uniform margin) — deferred to follow-up spec per Spec §11.5.
- Cookbook documentation — owned by ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. The four new FITL golden-trace tests (`candidate-params-fitl-seed-1001-side`, `candidate-params-optional-branch-missing`, `candidate-params-pivotal-event-id`, plus the convergence-witness `fitl-arvn-shaded-event-suppression`).
2. Existing FITL test suite under `packages/engine/test/` passes — the new `event` action params declaration must not regress any existing FITL fixture or assertion. Reproducibility-critical: existing FITL golden traces are byte-identical (the kernel's emitted candidate `params` were unchanged; only the GameSpecDoc declaration catches up).
3. `pnpm turbo test` — full pass.
4. `pnpm -F @ludoforge/engine test:e2e` — full pass (any e2e suite exercising FITL event play must still resolve cleanly).

### Invariants

1. Foundation #2 — the FITL `event` action's declaration is now consistent with what the kernel emits; evolution can mutate the declaration without engine code changes.
2. Foundation #16 — the conformance corpus extension from ticket 004 covers the asymmetric/phase-heavy game family; FITL is the canonical empirical witness for the asymmetric family but the conformance test does not depend on FITL specifics.
3. `cross-action consistency`: `candidateParamDefsEqual` check at `compile-agents.ts:435-437` passes for the union of `event` and `pivotalEvent` action declarations — `eventCardId` is now declared on both with consistent `id`-typed domain.

## Test Plan

### New/Modified Tests

1. Three golden-trace tests under `policy-profile-quality/candidate-params-fitl-witness/` — pinned FITL traces for side/branch/pivotal.
2. One convergence-witness test — non-blocking profile-quality assertion for 15-seed ARVN shaded-event suppression.
3. Pinned trace fixture JSON for seed 1001 card-78.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params-fitl`
3. `pnpm -F @ludoforge/engine test:e2e` — confirm FITL e2e still passes
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo schema:artifacts` — confirm FITL GameSpecDoc compiles cleanly after the new params declaration
7. `pnpm run check:ticket-deps`
