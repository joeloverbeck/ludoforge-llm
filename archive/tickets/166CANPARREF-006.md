# 166CANPARREF-006: FITL `event` action params declaration + ARVN shaded-event witness

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None (engine code unchanged — this is a GameSpecDoc data change and a profile-quality witness)
**Deps**: `archive/tickets/166CANPARREF-005.md`

## Problem

Spec 166 §2.3 documents a structural mismatch: `data/games/fire-in-the-lake/30-rules-actions.md:160` declares `event: params: []`, but `packages/engine/src/kernel/legal-moves.ts:1273-1325` (`enumerateCurrentEventMoves`) emits candidates with `params: { eventCardId, eventDeckId, side, branch? }`. Consequently, `lowerCandidateParamDefs` produces `candidateParamDefs = {}` for event-class candidate params, so any `candidate.params.side` ref against FITL `event` candidates would resolve to unavailable at runtime.

Phase 5 (this ticket) closes the mismatch and lands the FITL ARVN profile-quality witness that the spec is motivated by: with `avoidShadedEvent` active in ARVN, event candidates can now score directly from `candidate.params.side` instead of resolving unavailable. Spec §2.5's empirical baseline showed shaded events played 40% of the time pre-fix; the witness asserts the new ref family resolves the parameter-read gap. Full-campaign shaded-event suppression remains a non-blocking profile-quality signal because the live ARVN profile can intentionally choose a shaded event when other explicit considerations outweigh the -800 side penalty.

Open Question §11.4 — the FITL `branch` domain — is decided in this ticket.

## Authorization Ledger

- 2026-05-12: user approved Option 1 from the implementation 1-3-1 boundary reset (`narrows/fixes ticket wording`). The original draft's `valuesFrom: { dataAsset: ... }` domain and new data-assets deliverable conflicts with the live GameSpecDoc grammar and Spec 166's "no `valuesFrom: dataAsset` invention" constraint. This ticket will use existing inline `domain: { query: enums, values: [...] }` declarations for the required FITL `event` params and will not add compiler/schema support for `valuesFrom`.
- 2026-05-12: the same approval resolves `branch` by deferring declaration for this ticket. Declared action params are required by the live kernel apply-time validation, while FITL event candidates omit `branch` on non-branching card sides. Declaring `branch` now would reject legal branchless event moves. Downstream profile refs that need `candidate.params.branch` must use the unavailable/onMissing contract until a future optional-param or microturn-lowering design owns it.

## Assumption Reassessment (2026-05-11)

1. `data/games/fire-in-the-lake/30-rules-actions.md:160` declares `event` action with `params: []`. Verified — exact line confirms the mismatch.
2. `packages/engine/src/kernel/legal-moves.ts:1273-1325` emits `params: { eventCardId, eventDeckId, side, branch? }`. Verified by spec; kernel is UNCHANGED by this ticket.
3. `pivotalEvent` at `30-rules-actions.md:993-999` declares the canonical `params: [{ name: eventCardId, domain: { query: enums, values: [card-121, card-122, card-123, card-124] } }]` shape per Spec 166 §2.3. Confirms the generic declarative shape is sufficient — no new domain grammar is required.
4. Tickets 001–005 are landed and the candidate-param ref family is end-to-end functional against the synthetic two-action fixture.
5. The fitl-arvn-agent-evolution campaign baseline tier-15 ARVN profile is the empirical baseline cited by §2.5. The witness fixture for this ticket lives under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/` per Spec 166 §8.1 #16 (Witness id: `spec-166-candidate-params-fitl-witness`).

## Architecture Check

1. **No engine change (Foundation #1).** This ticket is a GameSpecDoc data declaration plus a profile-quality witness. The kernel's emission contract at `legal-moves.ts:1273-1325` is unchanged; only the GameSpecDoc declaration catches up to what the kernel already emits.
2. **Existing generic grammar (Foundation #6).** The new params on `event` use the existing `params: [{ name, domain }]` shape, mirroring `pivotalEvent.eventCardId`. No new schema grammar invented; the option-rejection of a new `valuesFrom: dataAsset` grammar (per Spec 166 §3) is honored.
3. **Convergence-witness, not architectural-invariant (`.claude/rules/testing.md`).** The FITL ARVN shaded-event suppression is a profile-quality signal, not a kernel invariant — failures emit `POLICY_PROFILE_QUALITY_REGRESSION` advisories (non-blocking). Witness id format follows the canonical `<spec-id>-<slug>` convention.
4. **Open Question §11.4 resolved.** `branch` is intentionally not declared on `event` in this ticket because the current action-param contract has no optional-param shape and FITL branchless event moves are legal. The remaining `branch` ref surface is explicit unavailability/onMissing behavior, not a hidden ready-param claim.

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
    - { name: eventCardId, domain: { query: enums, values: [card-1, ..., card-130] } }
    - { name: eventDeckId, domain: { query: enums, values: [fitl-events-initial-card-pack] } }
    - { name: side, domain: { query: enums, values: [unshaded, shaded] } }
  pre: null
  cost: []
  effects: []
  limits: []
```

The `side`, `eventDeckId`, and `eventCardId` params use inline literal enum values because the live GameSpecDoc grammar supports static `values: [...]` only. The implementation must spell out the full `card-1` through `card-130` list rather than using the illustrative ellipsis above.

### 2. Resolve Open Question §11.4 — `branch` domain (and helper data assets)

**Decision**: do not declare `branch` on the FITL `event` action in this ticket. This is Spec 166 §11.4 option (c), selected because the live kernel treats declared action params as required at apply-time, while non-branching FITL event sides emit no `branch` param.

Rationale (recorded here per Spec 166 §11.4's "decision is implementation-time, recorded in the Phase 5 ticket"):

- Option (a) (`valuesFrom: { dataAsset: ... }`) would require new GameSpecDoc grammar even though Spec 166 rejects that grammar for this series. It is not in scope for this no-engine-change ticket.
- Option (b) (empty `values: []` + runtime relaxation) would require a new runtime semantic carve-out for declared params, also out of scope.
- Option (c) preserves legal branchless event moves and keeps the current generic unavailable/onMissing contract honest. A future optional-param or microturn-lowering design can revisit `branch` without blocking `candidate.params.side`, `eventCardId`, or `eventDeckId`.

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

Add under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/`. The final implementation consolidates the FITL-specific ready-param, branch-boundary, and side-scoring witnesses into one deterministic profile-quality test file:

- `fitl-candidate-param-witness.test.ts` (Spec 166 §8.1 #13/#14/#16) — seed 1000 reaches an ARVN event frontier where shaded event candidates record `contribution: -800`, unshaded event candidates record `0`, and both candidate classes have empty `unknownCandidateParamRefs`. The same file asserts compiled FITL `candidateParamDefs` contains `eventCardId`, `eventDeckId`, and `side`, and intentionally omits `branch`. Header: `// @test-class: convergence-witness`.

### 5. Convergence-witness test

`packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts` (Spec 166 §8.1 #16):

- Header: `// @test-class: convergence-witness` + `// @profile-variant: spec-166-candidate-params-fitl-witness`.
- Runs a deterministic seed-1000 ARVN event frontier against the ARVN baseline with `avoidShadedEvent` active. This is the blocking local witness for the candidate-param ref behavior: `candidate.params.side` resolves, no `unknownCandidateParamRefs` are emitted, and the new term contributes exactly `-800` for shaded event candidates and `0` for unshaded event candidates.
- The full 15-seed campaign remains a non-blocking profile-quality interpretation layer, not the acceptance proof for this no-engine-change ticket. A retained run showed the expected carve-out in practice: seed 1005 can still select shaded events when other explicit profile considerations outweigh the side penalty.

### 6. Verification command (witness baseline)

The original draft asked for a fitl-arvn-agent-evolution 15-seed campaign composite with `avoidShadedEvent` active. The final implementation does not use that campaign as blocking proof because the live ARVN profile can intentionally choose shaded events under the ticket's own explicit carve-out. The retained proof command is the focused profile-quality witness in the Outcome.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — line 160 action declaration)
- `data/games/fire-in-the-lake/<dataAssets-file>.md` (verified-no-edit — approved boundary reset removes the unsupported `valuesFrom`/data-assets deliverable)
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts` (new — consolidated in-test deterministic frontier witness; no external pinned JSON fixture needed)

`Likely surface` for the FITL data assets file — confirm during implementation against current FITL data layout (most likely under `data/games/fire-in-the-lake/00-data-assets.md` or `data/games/fire-in-the-lake/event-cards.md`).

## Out of Scope

- Engine-side code changes (kernel, compiler, runtime, VM, trace plumbing) — all owned by tickets 001–005. This ticket consumes the engine surface those tickets ship.
- Microturn lowering of FITL event side/branch (Option D from the trigger report) — explicitly deferred per Spec §3.
- Dynamic per-candidate tag emission (Option C) — explicitly rejected per Spec §3.
- Telemetry advisory `POLICY_PREVIEW_UNIFORM_SIGNAL` (preview-uniform margin) — deferred to follow-up spec per Spec §11.5.
- Cookbook documentation — owned by ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. The consolidated FITL profile-quality witness (`fitl-candidate-param-witness`) passes and proves `eventCardId`, `eventDeckId`, and `side` are ready candidate params for FITL `event` candidates while `branch` remains undeclared.
2. Existing FITL test suite under `packages/engine/test/` passes — the new `event` action params declaration must not regress any existing FITL fixture or assertion. Reproducibility-critical: existing FITL golden traces are byte-identical (the kernel's emitted candidate `params` were unchanged; only the GameSpecDoc declaration catches up).
3. `pnpm turbo test` — full pass.
4. `pnpm -F @ludoforge/engine test:e2e` — full pass (any e2e suite exercising FITL event play must still resolve cleanly).

### Invariants

1. Foundation #2 — the FITL `event` action's declaration is now consistent with what the kernel emits; evolution can mutate the declaration without engine code changes.
2. Foundation #16 — the conformance corpus extension from ticket 004 covers the asymmetric/phase-heavy game family; FITL is the canonical empirical witness for the asymmetric family but the conformance test does not depend on FITL specifics.
3. `cross-action consistency`: `candidateParamDefsEqual` check at `compile-agents.ts:435-437` passes for the union of `event` and `pivotalEvent` action declarations — `eventCardId` is now declared on both with consistent `id`-typed domain.

## Test Plan

### New/Modified Tests

1. One consolidated convergence-witness test under `policy-profile-quality/candidate-params-fitl-witness/` — deterministic seed-1000 FITL frontier for ready-param and side-scoring behavior.
2. No pinned JSON fixture; the test builds and replays the frontier in-process to avoid a stale trace artifact.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.js`
3. `pnpm -F @ludoforge/engine test:e2e` — confirm FITL e2e still passes
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo schema:artifacts` — confirm FITL GameSpecDoc compiles cleanly after the new params declaration
7. `pnpm run check:ticket-deps`

## Outcome

Completed on 2026-05-12.
Outcome amended: 2026-05-12.

What landed:

- `data/games/fire-in-the-lake/30-rules-actions.md` now declares FITL `event` action params for `eventCardId`, `eventDeckId`, and `side` using the existing inline enum-domain grammar.
- `branch` is intentionally not declared because branchless FITL event moves are legal and declared action params are currently required at apply-time.
- No FITL data-assets file was changed; the approved implementation boundary removed the unsupported `valuesFrom: { dataAsset: ... }` deliverable.
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts` adds the profile-quality witness for compiled candidate-param defs and seed-1000 ARVN side scoring.
- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` now supplies `eventDeckId` on manual FITL event playbook moves, matching the newly declared required param.
- `archive/specs/166-candidate-parameter-refs.md` records the Phase 5 `branch` decision and the narrowed always-present FITL event-param declaration.
- Post-ticket review synchronized the remaining Spec 166 Phase 5 prose and the active cookbook follow-up ticket so they no longer imply FITL `event.branch` is declared today.

Proof:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine test` — passed; default lane summary `65/65 files passed`.
- `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.js` — passed; 2 tests.
- `pnpm -F @ludoforge/engine test:e2e` — passed; 6 tests.
- `pnpm turbo schema:artifacts` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo test` — passed; 5 tasks successful.

Non-final campaign evidence:

- A full 15-seed variant run was not retained as this ticket's blocking proof. A retained attempt against the intended ARVN profile showed seed 1005 can select shaded events under the ticket's explicit carve-out where other profile considerations outweigh the `-800` side penalty. The checked-in witness therefore proves the required candidate-param read/scoring behavior at the deterministic frontier rather than overclaiming zero shaded selections as an engine/data invariant.

Source-size ledger:

- New witness file: `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts` is 220 lines.
- Touched existing e2e file: `packages/engine/test/e2e/fitl-playbook-golden.test.ts` is 2640 lines; this canonical golden remains large, and this ticket only added the required `eventDeckId` params to existing event moves.
