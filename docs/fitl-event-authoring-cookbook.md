# FITL Event Authoring Cookbook

This document is the canonical authoring reference for Fire in the Lake event cards.

It describes the current production contract for GameSpecDoc YAML authoring:

- canonical binder naming and scoping
- replacement and routing patterns already used in production cards
- current decision-ownership behavior
- depletion and no-op expectations validated by integration tests

It does not introduce new engine primitives, backwards-compatibility aliases, or FITL-specific runtime logic.

## Authoring Boundary

Keep FITL behavior in FITL YAML and FITL-local macros.

- Prefer existing macros in `data/games/fire-in-the-lake/20-macros.md` when they already encode the rule.
- If no macro exists yet, follow an existing production card pattern rather than inventing a new shape.
- Treat this document as the durable reference for event authoring; Spec 29 is not the long-term home for cookbook guidance.
- Archived Spec 29 may still be used as a historical fidelity cross-check when a live card block looks incomplete or placeholder-like, but rules reports, playbook notes, and production cookbook guidance are authoritative.
- For FITL behavior, treat production action/macro data plus rules reports as authoritative. Verbalization, tooltip, and modifier-summary text must stay synchronized, but should not be used as the behavioral source of truth.

## Testing Selector-Driven Cards

Selector-heavy FITL event tests should control the whole relevant legality surface, not just the named example spaces.

- If a card targets broad predicates such as "any city", "supported spaces", or "outside Saigon", neutralize the relevant support/opposition slice first and then apply explicit overrides.
- Do not assume untouched production defaults outside the spaces named in the assertion. Hidden legal spaces can turn a correct implementation into a false-negative test.
- Prefer shared FITL test helpers for support/opposition normalization over ad hoc per-test copies.

## Rules Phrases That Change Implementation Shape

Some recurring FITL phrases carry more implementation weight than they first appear to.

- Treat `piece` literally. If the rules or playbook say `piece`, include Bases unless the source text narrows the set further.
- Treat `place` literally. For FITL faction force placement, Rule 1.4.1 may require type-based sourcing from the map when the desired force type is unavailable in `Available`.
- Treat `toward Passive Support` and `toward Passive Opposition` literally. These are not interchangeable with a raw one-step support lattice shift. Author the exact target behavior from every reachable starting state.
- Treat playbook fidelity notes as behavioral constraints when they clarify a rules term or edge case rather than mere prose commentary.

Canonical example:

- Card 89 (`Tam Chau`) requires all four of the above: Base-as-piece handling, Rule 1.4.1 type fallback, Saigon base-cap respect, and exact passive-target support routing.

## Query Authoring Limits

Prefer supported selector/query shapes over overly compressed filters.

- Use `let` plus outer `if` branching when legality depends on aggregate state such as base caps, available counts, or other board-wide conditions.
- Use `prioritized` queries when the rule is "source from Available first, then from the map" or when the rule is type-sensitive.
- Do not try to encode aggregate legality tests directly inside token-query filters unless a production example already shows that shape working.
- When a query starts accumulating availability checks, aggregate counts, per-type fallback, and zone exclusions all at once, stop and refactor into staged bindings.

Production references:

- `place-from-available-or-map` macro for Rule 1.4.1 sourcing shape
- Card 87 (`Nguyen Chanh Thi`) for `prioritized` source selection
- Card 89 (`Tam Chau`) for state-gated `prioritized` piece selection

## FITL Event Test Checklist

For nontrivial FITL events, cover the rule text as a checklist rather than with one happy-path assertion.

- Exact card text, metadata, and executable payload shape
- Boundary support/opposition states, especially for `toward Passive X`, `toward Neutral`, and max-state no-overshoot behavior
- Track clamps such as Patronage, Aid, Resources, and Trail
- `piece` semantics when Bases are legally included
- Stacking caps and location-specific placement restrictions
- Available-versus-map sourcing behavior when Rule 1.4.1 applies
- Post-placement posture/property changes such as Underground Guerrillas or tunnel loss on sourced Bases
- Legal no-op or reduced-effect outcomes when depletion or restrictions prevent the full printed effect

## Canonical Binder Contract

Declared binders use canonical `$name` identifiers.

- `chooseOne.bind`
- `chooseN.bind`
- `forEach.bind`
- `let.bind`
- `rollRandom.bind`

Use the exact declared binder name when reading it back through `{ ref: binding, name: ... }` or `query: binding`.

```yaml
- chooseN:
    bind: $selectedPieces
    options:
      query: tokensInZone
      zone: some-space:none
- forEach:
    bind: $selectedPiece
    over:
      query: binding
      name: $selectedPieces
    effects:
      - moveToken:
          token: $selectedPiece
          from:
            zoneExpr:
              ref: tokenZone
              token: $selectedPiece
          to: available-VC:none
```

### Dynamic binder names

When a nested choice must stay unique per outer iteration, interpolate the outer binder into the inner binder name.

```yaml
- forEach:
    bind: $piece
    over:
      query: binding
      name: $pieces
    effects:
      - chooseOne:
          bind: '$destination@{$piece}'
          options:
            query: mapSpaces
      - moveToken:
          token: $piece
          from:
            zoneExpr:
              ref: tokenZone
              token: $piece
          to:
            zoneExpr:
              ref: binding
              name: '$destination@{$piece}'
```

Use this pattern for per-token destinations. Card 90 (`Walt Rostow`) is the production reference.

## Choice And Iteration Patterns

### `chooseOne`

Use `chooseOne` when the event selects exactly one legal option and the event should become pending until that choice is supplied.

Production references:

- `select-laos-cambodia-province` macro
- Card 68 (`Green Berets`) province targeting
- Card 81 (`CIDG`) shaded Highland selection

### `chooseN`

Use `chooseN` for token subsets or bounded multi-select choices. Prefer explicit `min` and `max` derived from legal counts rather than assuming the requested amount exists.

Architecture note:

- `chooseN` authoring remains game-rule data in `GameSpecDoc`.
- The interaction protocol for interactive multi-selection is being redesigned under [Spec 62b](/home/joeloverbeck/projects/ludoforge-llm/specs/62b-incremental-choice-protocol.md).
- Do not assume the old runner-local "submit one final array" behavior is the intended long-term contract for new prioritized or stepwise legality features.

Production references:

- Card 81 (`CIDG`) unshaded VC-guerrilla selection
- `place-from-available-or-map` macro source-space selection
- Card 73 (`Great Society`) chooser-owned removal

### `forEach`

Use `forEach` to consume a previously bound collection or to iterate over a finite query. Do not re-query a mutable set when you already have the chosen subset bound; iterate over the binding instead.

Production references:

- Card 81 replacement loop after `chooseN`
- Card 90 per-piece destination loop
- `place-from-available-or-map` macro

## State Capture Before Mutation

Selector queries are live. If an effect mutates the board and a later effect re-runs the same query, the later effect sees the post-mutation state, not the earlier eligibility set.

That is often correct, but it is a common source of authoring bugs when the event text means:

1. identify a set of spaces or pieces
2. change the board
3. continue working from the originally identified set

When that sequencing matters, snapshot the set into a binding before any mutation and consume the binding later.

Canonical pattern:

```yaml
- chooseN:
    bind: $capturedSpaces
    options:
      query: mapSpaces
      filter: ...
    min:
      aggregate:
        op: count
        query:
          query: mapSpaces
          filter: ...
    max:
      aggregate:
        op: count
        query:
          query: mapSpaces
          filter: ...
- forEach:
    bind: $capturedSpace
    over:
      query: binding
      name: $capturedSpaces
    effects:
      - ...
- chooseN:
    bind: $laterChoice
    options:
      query: binding
      name: $capturedSpaces
```

Use this whenever later choices mean "from the spaces that qualified earlier" rather than "from whatever qualifies now".

Production references:

- Card 81 (`CIDG`) unshaded source-zone capture before replacement
- Card 84 (`To Quoc`) shaded capture of spaces where ARVN must remove cubes, then later VC placement into that captured set

## Dynamic Scoped Variable Names

When an earlier choice determines which declared variable to read or mutate later, pass the variable name through a binding or grant context and use that symbol directly in the scoped-var surface.

Canonical pattern:

```yaml
- chooseN:
    bind: $tracks
    options:
      query: enums
      values: [aid, patronage, arvnResources]
    n: 2
- forEach:
    bind: $track
    over:
      query: binding
      name: $tracks
    effects:
      - addVar:
          scope: global
          var:
            ref: binding
            name: $track
          delta: 2
```

The same `var:` expression shape works across:

- `ref: gvar`, `ref: pvar`, `ref: zoneVar`
- `setVar`
- `addVar`
- `transferVar.from.var`
- `transferVar.to.var`
- `intsInVarRange.var`

Keep the expression narrow and symbolic.

- Use a literal string when the variable name is fixed.
- Use `{ ref: binding, name: $varName }` when an earlier effect selected the variable.
- Use `{ ref: grantContext, key: someKey }` when a free-operation or grant pipeline passes the variable name in execution context.
- Do not build variable names with `concat` or other arbitrary `ValueExpr` string construction.

## Replacement Semantics

Replacement is a sequence, not a primitive.

The current robust pattern is:

1. Bind the pieces to replace.
2. Capture each source zone with `let` plus `ref: tokenZone`.
3. Compute available replacement count.
4. If replacements exist, choose or source the replacement token.
5. Move the replacement into the captured source zone.
6. Apply any posture/property adjustments to the replacement.
7. Move the removed original piece to its destination.

Card 81 (`CIDG`) unshaded is the production reference for this sequence. The important architectural point is that source-zone capture happens before any move, so later effects are not reading a token zone that has already changed.

### Available-pool depletion

Do not fail the event if the replacement pool is empty unless the rules explicitly require illegality.

Current production expectation:

- If no replacement token is available, the original piece can still be removed if the card text calls for removal.
- The event remains legal when the effect collapses to a smaller result.

Card 81 unshaded and its integration test cover this exact behavior.

## Routing Removed Pieces

Route removed pieces to their rule-correct boxes explicitly. Today this is usually open-coded in the card, not hidden behind one generic routing macro.

Current production examples:

- US Irregulars -> `available-US:none`
- ARVN Rangers / Police -> `available-ARVN:none`
- VC Guerrillas removed by CIDG -> `available-VC:none`

When routing depends on the removed token's faction or type, use a `zoneExpr.if` branch keyed from `ref: tokenProp`.

```yaml
to:
  zoneExpr:
    if:
      when:
        op: ==
        left:
          ref: tokenProp
          token: $removedPiece
          prop: faction
        right: US
      then: available-US:none
      else: available-ARVN:none
```

Card 81 shaded is the production reference.

This part of the authoring surface is still more verbose than ideal. That is why later tickets add dedicated routing/replacement macros instead of pushing FITL rules into the engine.

## Posture Changes On Placed Or Replaced Pieces

Set posture after the replacement or placement token is moved into the destination space.

- Rangers and Irregulars placed by CIDG unshaded are set to `activity: underground`.
- Police remain active and therefore should not receive the underground assignment.
- VC Guerrillas placed by CIDG shaded are set to `activity: underground`.

Use a conditional `setTokenProp` only when posture depends on the replacement type.

Production references:

- Card 81 (`CIDG`) unshaded for conditional posture
- Card 81 (`CIDG`) shaded for unconditional VC underground posture

## Terrain, Country, And Occupant Filtering

Prefer predicates over hard-coded space lists.

Useful current patterns:

- South Vietnam filter:
  `zoneProp country == southVietnam`
- Highland filter:
  `zonePropIncludes terrainTags highland`
- Province/city filters:
  `zoneProp category == province|city`
- Occupant predicates:
  aggregate count over `tokensInZone` with faction/type filters

Examples:

```yaml
spaceFilter:
  op: ==
  left:
    ref: zoneProp
    zone: $zone
    prop: country
  right: southVietnam
```

```yaml
filter:
  op: and
  args:
    - op: zonePropIncludes
      zone: $zone
      prop: terrainTags
      value: highland
    - op: ">"
      left:
        aggregate:
          op: count
          query:
            query: tokensInZone
            zone: $zone
            filter: ...
      right: 0
```

Production references:

- Card 81 South Vietnam and Highland filtering
- Card 90 destination filtering
- `fitl-space-coin-controlled`
- `fitl-space-coin-controlled-city`
- `fitl-arvn-redeploy-destination-no-bases`
- `select-laos-cambodia-province`

## Marker Shift Legality

Use `markerStateAllowed` and `markerShiftAllowed` for different jobs.

- `markerStateAllowed` is for absolute target-state legality such as "this space may legally be Active Support".
- `markerShiftAllowed` is for relative transition legality such as "shifting this marker by 1 would actually produce a legal state change".

For support/opposition events that mean "shift one level toward Support/Opposition", prefer `markerShiftAllowed` instead of pairing `markerStateAllowed` with an extra current-state exclusion.

```yaml
- chooseN:
    bind: $spaces
    options:
      query: mapSpaces
      filter:
        condition:
          op: and
          args:
            - conditionMacro: fitl-space-coin-controlled
              args:
                spaceExpr: $zone
            - op: markerShiftAllowed
              space: $zone
              marker: supportOpposition
              delta: 1
```

## Chooser Ownership And Pending Decisions

By default, event decisions surface as pending choices for the event executor. Override that only when the rules say another faction/player owns the choice.

Use `chooser` on the choice effect when ownership is rule-driven.

Testing note:

- Default executor-owned choices may not surface an explicit `decisionPlayer` override in pending-choice objects.
- Choices with `chooser` should surface the overridden owner explicitly and should be tested as such.

Production references:

- Card 73 (`Great Society`) uses `chooser: { id: 0 }` so US owns the removal choice even when another faction executes the event.
- Card 42 (`Chou En Lai`) integration coverage verifies that the NVA-owned choice stays routed to player 2 through discovery and completion.

Authoring expectation:

- `legalMoves` exposes the event move.
- `legalChoicesEvaluate` or decision-sequence helpers surface a pending `chooseOne` / `chooseN`.
- The pending request should target the correct `decisionPlayer`.

If your event text implies another faction chooses, add chooser ownership explicitly and cover it with an integration test.

## Depletion, Fallback, And No-Op Behavior

Model legal fallback behavior inside the event rather than by making the whole event illegal.

Current production patterns:

- Clamp counts with `min(requested, available)`.
- Guard optional branches with `if count > 0`.
- Allow a legal no-op when the card remains playable but no eligible target exists.

Production references:

- Card 81 unshaded:
  removal count is `min(die roll, eligible VC guerrillas)`
- Card 81 shaded:
  event remains legal and becomes a no-op if no Highland contains Rangers, Police, or Irregulars
- Card 42 unshaded:
  resource penalty still applies even if no NVA troops are available to remove

This is the current architecture worth preserving: encode fallback behavior declaratively in YAML instead of teaching the engine card-specific exceptions.

## Current Macro Reference

Use these existing macros before open-coding the same behavior:

- `shift-support-opposition`
  Use for direct support/opposition shifts.
- `remove-support-from-space`
  Use when text says to remove Support from a specific space.
- `select-laos-cambodia-province`
  Use for one-province Laos/Cambodia targeting.
- `place-from-available-or-map`
  Use when FITL Rule 1.4.1 sourcing applies and the piece can come from Available first, then from map.
- `fitl-space-coin-controlled`
  Use as a condition macro for control-based destination or legality filters.
- `fitl-space-coin-controlled-city`
  Use when the rule is city-specific.
- `fitl-arvn-redeploy-destination-no-bases`
  Use for the Card 90 redeploy exception instead of duplicating the destination logic.

Patterns still open-coded today:

- faction-aware routing of removed pieces
- piece-for-piece replacement from mixed Available pools
- replacement plus posture assignment
- Highland-space selection plus occupant-specific purge
- pre-mutation snapshotting of later target spaces when a card must keep working from an earlier eligibility set

For those, use the current production card pattern, especially Card 81, until the dedicated macro tickets land.

## Geography-Sensitive Event Targeting

When playbook or rules text narrows a nominal adjacency concept to a specific set of spaces, encode the target space set explicitly rather than relying on the engine's raw adjacency queries.

- If the rules say "adjacent to Can Tho" but the playbook clarifies that only certain adjacent spaces qualify, author one `zoneFilter` per qualifying space. Do not use an unfiltered adjacency query and hope the engine matches the intended subset.
- Test both inclusion and exclusion for disputed or easy-to-misread spaces. A space that is geographically adjacent on the map but excluded by the rules must be tested as absent from the target set.
- When a card grants per-space free operations (e.g., one Sweep or Assault in each target space), author one grant per space with an explicit zone filter rather than a single grant with a multi-zone query. This makes test isolation straightforward and prevents ambiguity about which spaces are in scope.

Production reference:

- Card 92 (`SEALORDS`) encodes 7 ARVN and 7 US per-space grants, each with an explicit `zoneFilter` matching exactly one target space. `loc-saigon-can-tho:none` is geographically adjacent but excluded, and integration tests assert both its absence from grants and its untouched state after event execution.

## Ordered Free-Op Event Testing

For events that issue ordered free-operation grants (e.g., "ARVN then US"), test runtime grant surfacing and resolved board state rather than making assumptions about which grants appear immediately.

Preferred testing patterns:

- Assert on `pendingFreeOperationGrants` for readiness and sequence windows. After an ordered event fires, only the current step's grants should be active.
- Use `withIsolatedFreeOperationGrant` from `test/helpers/turn-order-helpers` to install a single grant in isolation, setting the active player and providing all metadata (zoneFilter, executionContext, viabilityPolicy, etc.) without inline hand-rolling.
- Assert on resolved board state (token positions, zone contents) for effect correctness rather than on intermediate move params.
- Use `normalizeDecisionParamsForMove` or `applyMoveWithResolvedDecisionIds` from `test/helpers/decision-param-helpers` to drive the move through the decision sequence.

Patterns to avoid:

- Asserting on unresolved `legalMoves(...).params` for ordered free-op windows unless the move shape itself is the subject under test. Grant ordering means some grants may not yet be surfaced.
- Using large multi-grant event windows when a single isolated grant fixture would test the behavior more directly. Isolate the grant under test rather than replaying the full event card.

Production reference:

- Card 92 (`SEALORDS`) integration tests demonstrate both patterns: the full-event test verifies ordered grant surfacing and single-grant activation, while isolated-grant tests verify in-place Sweep restrictions and US no-followup behavior independently.

## Monsoon-Restricted Free-Operation Grants

When a FITL event grants a free operation during Monsoon, author against the declared turn-flow restriction contract, not against trial-and-error runtime behavior.

Use `turnOrder.config.turnFlow.monsoon.restrictedActions` as the source of truth for which actions are Monsoon-restricted. In current production FITL data, that list includes `sweep`, `march`, `airStrike`, and `airLift`, with additional turn-flow parameters on some actions to cap spaces during Monsoon. Do not hardcode this list mentally and assume it will never change; inspect the authored turn-flow config when adding or reviewing a Monsoon-sensitive grant.

Per FITL rule 5.1.1, Events override Monsoon restrictions. When an event card issues a `freeOperationGrant` whose `actionIds` include a Monsoon-restricted action, the grant must set `allowDuringMonsoon: true`.

```yaml
freeOperationGrants:
  - seat: us
    operationClass: operation
    actionIds: [airLift]
    allowDuringMonsoon: true
```

Why this matters:

- Historically, omitting `allowDuringMonsoon: true` caused the runtime Monsoon window filter to remove the move, which could leave `legalMoves` with no usable grant and cause required grant chains to expire unusably.
- Today, the compiler rejects that authored content earlier via shared cross-validation. Treat the flag as part of the authoring contract, not as an optional runtime tweak.

Canonical production reference:

- Card 62 (`Cambodian Civil War`) grants ordered US and ARVN `airLift` then `sweep` operations into Cambodia. Those grants set `allowDuringMonsoon: true` because the sequence must remain legal even when the lookahead card makes the current event a Monsoon turn. If the opening `airLift` grant omitted the flag, the sequence would fail at step 0 and the downstream `sweep` follow-up would never surface.

Relevant automated proof:

- `packages/engine/test/unit/cross-validate.test.ts` rejects event grants that target Monsoon-restricted actions without `allowDuringMonsoon: true`.
- `packages/engine/test/unit/kernel/legal-moves.test.ts` covers the runtime Monsoon filtering behavior with and without explicit grant allowance.
- FITL production integration tests for cards 44 (`Ia Drang`) and 62 (`Cambodian Civil War`) exercise real Monsoon-sensitive event grant flows.

## Global Variable Window Lifecycle

When a card sets a global variable "window" (e.g., `fitl_airStrikeWindowMode`) and grants a free operation that depends on it, follow this lifecycle pattern:

1. **Set the window variable** in `lastingEffects.setupEffects` — runs during event application, before grants resolve.
2. **Use `effectTiming: afterGrants`** so the card's main `effects` run after the free operation resolves.
3. **Reset the window variable** in the card's main `effects` — immediate cleanup after the grant completes.
4. **Also reset** in `lastingEffects.teardownEffects` — safety net for end-of-turn cleanup.

If the card also has pre-grant effects (e.g., Agent Orange guerrilla activation), place those in `setupEffects` alongside the window variable setup. The `setupEffects` array always runs during event application regardless of `effectTiming`.

```yaml
unshaded:
  effectTiming: afterGrants
  freeOperationGrants:
    - seat: us
      operationClass: operation
      actionIds: [airStrike]
  lastingEffects:
    - id: evt-window
      duration: turn
      setupEffects:
        - setVar: { scope: global, var: fitl_airStrikeWindowMode, value: N }
        # Optional: pre-grant effects (e.g., guerrilla activation) go here
      teardownEffects:
        - setVar: { scope: global, var: fitl_airStrikeWindowMode, value: 0 }
  effects:
    - setVar: { scope: global, var: fitl_airStrikeWindowMode, value: 0 }
```

**Why the explicit reset matters**: `duration: turn` teardown fires at end of turn, not after grant resolution. Without the afterGrants reset, the window variable persists for the rest of the turn, potentially corrupting subsequent Air Strike legality checks.

Production references: Card 6 (Aces, mode 1), Card 30 (USS New Jersey, mode 2), Card 111 (Agent Orange, mode 3).

## Operation-Context-Only Bindings

The built-in bindings `__freeOperation` and `__actionClass` are injected by the kernel only during **operation pipeline** execution. They are **not available** inside event card effects.

This matters when an event card reuses a macro that was originally written for an operation profile. If that macro (or any sub-macro it calls) references `__freeOperation` or `__actionClass`, the compiler will emit `CNL_COMPILER_BINDING_UNBOUND` — even if the reference is inside a conditional branch that would never execute at runtime. The compiler validates all branches statically.

**Fix**: When adding a "free" or "skip cost" variant to an operation macro for use in events, inline the cost logic instead of delegating to sub-macros that reference operation-context bindings.

Production reference: `insurgent-terror-resolve-space` uses a `free` parameter with inlined cost logic rather than delegating to `per-province-city-cost` (which references `__freeOperation`).

## Testing Pivotal Events With Play Conditions

Pivotal Event cards have play conditions that require specific board state (e.g., Card 124 requires `leaderBoxCardCount >= 2` AND `>20 VC guerrillas in SV`). When testing with `clearAllZones`, the board is empty and these conditions must be satisfied explicitly.

**Filler guerrilla activity state matters.** When placing filler guerrillas to meet a count-based play condition:

- Use **active** guerrillas for filler pieces. Active guerrillas count for presence/count checks but do not trigger underground-specific filters (e.g., the Tet Offensive terror `chooseN` only matches underground VC).
- Using **underground** filler guerrillas makes them eligible for effects like terror, which adds them to mandatory `chooseN` selections and forces execution in spaces whose production marker defaults may cause `shiftMarker` runtime errors.

**`clearAllZones` does not clear markers.** Production spaces retain their scenario-defined `supportOpposition` states even after `clearAllZones`. The kernel resolves marker states from the compiled GameDef, not from `state.markers`. When an event effect applies `shiftMarker` to a space that was never explicitly configured in the test, the production default may be incompatible with the shift direction. Always set `supportOpposition: 'neutral'` explicitly for any space the event may shift.

**Mandatory `chooseN` cardinality.** When a `chooseN` computes `min` = `max` = eligible count, the test override must supply ALL eligible spaces. You cannot select a subset. Control eligibility through token placement (activity state, faction), not through the override value.

Production reference: Card 124 (`Tet Offensive`) test infrastructure uses active filler guerrillas and explicit marker setup.

## Practical Checklist

Before considering a new FITL event complete, verify:

1. All declared binders use canonical `$...` names.
2. Nested choices use dynamic bind names when they are per-iteration.
3. Replacement flows capture source zones before moving tokens.
4. Removed pieces route to explicit FITL boxes.
5. Replacement posture is set after placement.
6. Filters use space properties and occupant predicates, not brittle hand-built lists.
7. Decision ownership matches the rules text.
8. Depletion and zero-target cases resolve to the intended fallback or no-op behavior.
9. An integration test covers any nontrivial chooser, replacement, routing, or fallback behavior.
10. Geography-sensitive cards encode explicit target sets and test both inclusion and exclusion.
11. Ordered free-op events test grant surfacing sequence and use isolated grant helpers for per-grant behavior.
12. Every `freeOperationGrant` whose `actionIds` include a Monsoon-restricted action sets `allowDuringMonsoon: true`.
