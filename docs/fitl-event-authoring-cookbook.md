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
