# 196ROLECONROUTE-004: P4A — FITL ARVN Transport route constraint migration and witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — FITL profile data file edits + author FITL `routeGraph` dataAsset + new architectural-invariant tests
**Deps**: `tickets/196ROLECONROUTE-004A.md`

## Problem

Spec 196's primary use case is the FITL ARVN Transport authoring need: a Transport move must reach a destination via authored land routes, and later same-family work must express origin-control preservation as admissibility rather than a guardrail demote. Today, FITL expresses the route choice through the `arvn.transportDestination` selector and separately scores origin-control loss through the `arvn.doNotLoseOriginControlByTransport` guardrail demote-penalty (`data/games/fire-in-the-lake/92-agents.md:1855-1866`).

This ticket migrates the ARVN Transport plan template (`92-agents.md:1020-1025`) to use the new `reachable` and `distinctOriginDestination` constraints from tickets 001-003, authors the FITL `routeGraph` data asset (land/trail/highway route classes; FITL zone-edge graph), and adds focused witnesses proving that unreachable or same-origin/destination Transport bindings are rejected by role-constraint admissibility rather than deferred to plan scoring.

`196ROLECONROUTE-005` owns the narrower missing primitive needed before this series can truthfully claim origin-control preservation as constraint admissibility: a generic set/predicate/post-state control constraint surface that does not invent fake zone ids or game-specific engine logic.

## Assumption Reassessment (2026-05-26)

1. The current FITL ARVN Transport template is at `data/games/fire-in-the-lake/92-agents.md:1020-1025`:
   ```yaml
   arvn.trainTransportCompound:
     traceLabel: "ARVN Train then Transport"
     root: { actionTags: [train], compound: { specialTags: [transport], timing: after } }
     postureHook: arvn.preserveAidAndMargin
     roles:
       trainSpace: { selector: arvn.trainSpaceForControlOrPacification, required: true }
       transportRoute: { selector: arvn.transportDestination, required: true, constraints: [{ notEqual: role.trainSpace }] }
   ```
2. The current origin-control guardrail at `:1855-1866`:
   ```yaml
   arvn.doNotLoseOriginControlByTransport:
     scopes: [move]
     when:
       and:
         - { ref: candidate.tag.transport }
         - lt: [{ ref: feature.projectedSelfMarginDelta }, 0]
     severity: demote
     penalty: 550
     onUnavailable: noFire
   ```
3. The reassessment confirmed FITL authors only `notEqual` constraints today (7 occurrences); migrating ARVN Transport adds the first object-valued constraint usage in FITL profile data.
4. No FITL `routeGraph` data asset exists today (verified by exhaustive grep). This ticket authors it.
5. FITL zone adjacency exists at `ZoneDef.adjacentTo` (per `game-spec-doc.ts:75-80`) — the new `routeGraph` adds route-class-labeled edges on top of the same underlying zone topology. The implementation will likely cross-reference the existing FITL zone definitions to ensure `routeGraph.edges[].from` and `:to` zone ids align with existing `ZoneDef.id` values; mismatches must fail compile (covered by ticket 002's schema validation).
6. Live reassessment on 2026-05-26 corrected the draft boundary: `locatedIn` compares a bound role to a literal zone id or another bound role's zone. It cannot express "origin is in the authored set of ARVN-controlled population centers" or "origin remains controlled after the Transport" without a new generic set/predicate/post-state constraint surface. Authoring `zone.arvnControlledPopulationCenter` would be a fake zone id and would violate Foundations #12, #14, and #15. The user approved narrowing this ticket to route/destination admissibility and moving origin-control admissibility to `tickets/196ROLECONROUTE-005.md`.
7. Live reassessment also confirmed `arvn.transportOrigin` already exists in `92-agents.md`, but `arvn.transportDestination` currently uses `routePairs` and emits composite `origin|destination` selected ids. Because `reachable` and `distinctOriginDestination` evaluate zone-resolvable role bindings, this ticket must restructure the Transport plan role selectors so `transportOrigin` and `transportDestination` bind separate zone ids.
8. A second live reassessment on 2026-05-26 found a compiler/runtime contract mismatch: the runtime constraint evaluator can resolve the current candidate role, but validator role-precedence logic rejects constraints that reference the constrained role itself. `tickets/196ROLECONROUTE-004A.md` owns that prerequisite so this ticket can remain the FITL routeGraph/template migration rather than mixing generic compiler validation changes into the data migration.

## Architecture Check

1. **Authored labels stay in data (Foundation 1)**: Route class identifiers (`land`, `trail`, `highway`) live in the FITL `routeGraph` payload. The engine sees only generic route classes; the labels are FITL's authoring choice.
2. **Evolution-first (Foundation 2)**: The FITL `routeGraph` is GameSpecDoc-resident — route classes, edges, and `defaultMaxHops` are first-class evolution targets. Future game profiles author their own routeGraph independently.
3. **Architecturally complete route migration (Foundation 14 + 15)**: ARVN Transport's reachable-destination and origin/destination-distinct requirements migrate from selector/scoring convention into constraint admissibility. Origin-control preservation remains a real requirement, but this ticket does not fake it through a zone id or guardrail claim; `196ROLECONROUTE-005` owns the missing generic semantic primitive.
4. **Constraint witness as proof (Foundation 16)**: Tests cover route/destination admissibility directly: unreachable Transport bindings and same-origin/destination bindings are rejected by the role-constraint pass, while a legal land-reachable distinct destination remains admitted.
5. **No engine changes**: All work is data authoring + test authoring; the engine surface is unchanged from tickets 001-003.
6. **Prerequisite alignment**: Current-role references in `reachable` and `distinctOriginDestination` are expected to compile because `196ROLECONROUTE-004A` aligns compiler validation with the runtime current-candidate binding contract.

## What to Change

### 1. FITL routeGraph data asset

Author a new `dataAssets:` entry in the FITL GameSpecDoc (`data/games/fire-in-the-lake/` — locate the existing dataAssets-bearing file, or add to `92-agents.md` if dataAssets are author-collocated with the relevant agents; verify the FITL file layout at implementation time):

```yaml
- id: fitl.routeGraph
  kind: routeGraph
  payload:
    routeClasses:
      - { id: land, label: Land routes }
      - { id: trail, label: Trail }
      - { id: highway, label: Highway }
    edges:
      # Authored against the existing FITL zone topology — cross-reference ZoneDef.adjacentTo
      # to ensure every land/highway edge corresponds to an existing zone adjacency.
      - { from: zone.<X>, to: zone.<Y>, classes: [land, highway] }
      # ... (one edge per zone pair, classified by route type)
    defaultMaxHops: 3
```

The full edge list is derived from the FITL zone adjacency map. Reference FITL doctrine for which connections are highway, trail, and land; capture each authored choice as a comment if non-obvious.

### 2. ARVN Transport template migration

Replace the existing template at `92-agents.md:1020-1025`:

```yaml
arvn.trainTransportCompound:
  traceLabel: "ARVN Train then Transport"
  root: { actionTags: [train], compound: { specialTags: [transport], timing: after } }
  postureHook: arvn.preserveAidAndMargin
  roles:
    trainSpace:
      selector: arvn.trainSpaceForControlOrPacification
      required: true
    transportOrigin:
      selector: arvn.transportOrigin
      required: true
    transportDestination:
      selector: arvn.transportDestination
      required: true
      constraints:
        - { reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }
        - { distinctOriginDestination: { origin: role.transportOrigin, destination: role.transportDestination } }
        - { notEqual: role.trainSpace }
```

`arvn.transportOrigin` already exists in `92-agents.md`; verify it still returns zone ids. If the existing `arvn.transportDestination` selector still implies origin-by-context through composite `routePairs` identity, restructure to separate zone-id selectors (`arvn.transportOrigin`, `arvn.transportDestination`) so the constraints can name and evaluate them independently.

The `notEqual: role.trainSpace` constraint is preserved (transport destination must differ from the trained space).

### 3. Guardrail reduction

Leave `arvn.doNotLoseOriginControlByTransport` behavior intact as the current projected-margin posture guardrail. Add a short YAML comment explaining that origin-control admissibility is intentionally deferred to `196ROLECONROUTE-005`; do not claim this guardrail is the primary or replacement admissibility mechanism.

### 4. Tests

- **Route constraint witness** (architectural-invariant): A FITL scenario is constructed where an unreachable ARVN Transport binding is rejected by constraint admissibility.
- **Migration regression** (architectural-invariant): A FITL scenario whose legal ARVN Transport binding has a land-reachable destination that differs from origin and trainSpace is correctly admitted.
- **Determinism**: Replay test — same GameDef + initial state + seed + actions → canonical serialized state byte-identical (Foundation 8 + 16). Verifies the new constraints do not introduce non-determinism.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — ARVN Transport template migration (`:1020-1025` area); guardrail comment update (`:1855-1866` area); potentially new `arvn.transportOrigin` selector authoring
- `data/games/fire-in-the-lake/<routeGraph-bearing-file>` (modify or new) — FITL `routeGraph` data asset; file location depends on FITL's dataAssets convention (verify at implementation time)
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (new) — convergence witness + migration regression + determinism

## Out of Scope

- **NVA route logistics migration** (`reports/fitl-competent-agent-ai.md` §3 NVA requirements) — uncommitted in this ticket; the route-graph machinery enables it (`via: routeClass.trail`), but the spec scopes ARVN Transport as the exemplar. NVA migration is a separate follow-up if authoring need is confirmed.
- **VC underground positioning** — same as NVA: enabled but out of scope.
- **Other FITL profile migrations** to new constraint kinds — uncommitted until a concrete authoring need surfaces.
- **Origin-control preservation as role-constraint admissibility** — deferred to `tickets/196ROLECONROUTE-005.md`, because the currently landed generic constraints cannot express zone-set membership or post-move control preservation truthfully.
- **Multi-hop route cost / weighted shortest path** — explicitly uncommitted per spec §11.
- **Hidden / partial route observability per observer** — uncommitted per spec §11; current scope assumes the route graph is public game data.

## Acceptance Criteria

### Tests That Must Pass

1. Route constraint witness: an ARVN Transport binding scenario where the destination is not land-reachable from the selected origin is rejected at the constraint admissibility pass.
2. Migration regression: an ARVN Transport binding satisfying `reachable` land route and `distinctOriginDestination` plus the preserved `notEqual` against trainSpace is correctly admitted.
3. Plan-trace replay: same GameDef + seed + actions → byte-identical canonical state across two runs (Foundation 8 + 16).
4. `pnpm turbo build` produces byte-identical FITL GameDef across two runs after the migration (compiler determinism, Foundation 8).
5. Existing FITL convergence and policy-quality witnesses continue to pass (no regression).
6. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. ARVN Transport bindings rejected by route/destination constraint admissibility never reach the scoring pass.
2. The retained `arvn.doNotLoseOriginControlByTransport` guardrail still emits its demote-penalty for legal-but-margin-degraded bindings (no regression in projected-margin posture signaling); it is not claimed as an admissibility proof until `196ROLECONROUTE-005`.
3. FITL `routeGraph` payload is byte-identical across two compilations (Foundation 8 + 16).
4. No game-specific identifiers leak into engine code as a result of this migration — `land`, `trail`, and `highway` remain authored labels (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (new) — architectural-invariant + convergence witness. Covers acceptance criteria 1-4. The test file is structured with one architectural-invariant block (admissibility property, determinism property) and one convergence-witness block (FITL-specific ARVN scenarios); both blocks declare their `@test-class:` headers per `.claude/rules/testing.md`. If splitting into two files is cleaner for the test-class taxonomy, split accordingly at implementation time.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. Determinism spot check: `pnpm turbo build` twice; `diff` the FITL GameDef JSON output — must be byte-identical
