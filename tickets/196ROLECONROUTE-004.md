# 196ROLECONROUTE-004: P4 — FITL ARVN Transport constraint migration and convergence witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — FITL profile data file edits + author FITL `routeGraph` dataAsset + new architectural-invariant + convergence-witness tests
**Deps**: `tickets/196ROLECONROUTE-003.md`

## Problem

Spec 196's primary use case is the FITL ARVN Transport authoring need: a Transport move must (a) preserve origin population control, and (b) reach a destination via land routes. Today, FITL expresses this through a `arvn.doNotLoseOriginControlByTransport` guardrail demote-penalty (`data/games/fire-in-the-lake/92-agents.md:1855-1866`) — adequate for self-interested ARVN behavior but inadequate as the architectural expression of "destination must be reachable from origin" or "origin must retain control after Transport".

This ticket migrates the ARVN Transport plan template (`92-agents.md:1020-1025`) to use the new `locatedIn`, `reachable`, and `distinctOriginDestination` constraints from tickets 001-003, authors the FITL `routeGraph` data asset (land/trail/highway route classes; FITL zone-edge graph), and adds a convergence-witness test proving that illegal-transport bindings are rejected by the constraint admissibility check rather than relegated to guardrail penalty.

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
6. The guardrail `arvn.doNotLoseOriginControlByTransport` is reduced (not removed) — projected-margin signal remains independently useful as a posture complement, but it is no longer the only enforcement of "preserve origin control" (spec §4.4).

## Architecture Check

1. **Authored labels stay in data (Foundation 1)**: Route class identifiers (`land`, `trail`, `highway`) live in the FITL `routeGraph` payload. The engine sees only generic route classes; the labels are FITL's authoring choice.
2. **Evolution-first (Foundation 2)**: The FITL `routeGraph` is GameSpecDoc-resident — route classes, edges, and `defaultMaxHops` are first-class evolution targets. Future game profiles author their own routeGraph independently.
3. **Architecturally complete migration (Foundation 14 + 15)**: ARVN Transport's "origin control + reachable destination" requirement migrates from a guardrail demote-penalty (symptom-level signal that the move was suboptimal) to constraint admissibility (the move is not legal in the first place when origin would be lost or destination is unreachable). Guardrail signal is preserved for the posture surface but no longer carries the architectural enforcement.
4. **Convergence witness as proof (Foundation 16)**: A test scenario is authored where the ARVN Transport binding would lose origin control by the destination choice — the test asserts the binding is rejected by the constraint admissibility pass, not just demoted in scoring.
5. **No engine changes**: All work is data authoring + test authoring; the engine surface is unchanged from tickets 001-003.

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
      constraints:
        - { locatedIn: { role: role.transportOrigin, container: zone.arvnControlledPopulationCenter } }
    transportDestination:
      selector: arvn.transportDestination
      required: true
      constraints:
        - { reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }
        - { distinctOriginDestination: { origin: role.transportOrigin, destination: role.transportDestination } }
        - { notEqual: role.trainSpace }
```

Note that `arvn.transportOrigin` is a new selector that may not yet exist in `92-agents.md`; the spec implies it ("zone.arvnControlledPopulationCenter" is also an authored zone metadata tag). If either is missing, author them as part of this ticket using existing FITL selector and zone-metadata conventions. If the existing `arvn.transportDestination` selector already implies origin-by-context (composite identity), restructure to two distinct selectors (`arvn.transportOrigin`, `arvn.transportDestination`) so the constraints can name them independently.

The `notEqual: role.trainSpace` constraint is preserved (transport destination must differ from the trained space).

### 3. Guardrail reduction

Update `arvn.doNotLoseOriginControlByTransport` at `:1855-1866` to a *complement* of the constraint admissibility (no longer the architectural enforcement). The guardrail remains useful for projected-margin posture signaling — leave the `when`/`severity`/`penalty` as-is, but add a comment (in the YAML) explaining that the constraint admissibility check is now the primary mechanism, and this guardrail is retained for projected-margin-only signaling.

### 4. Tests

- **Convergence witness** (architectural-invariant): A FITL scenario is constructed where every ARVN Transport binding whose destination would lose origin control is rejected by constraint admissibility. The witness asserts that the bindings appear in the *enumerated illegal* set at the role-binding pass, not in the legal-but-demoted set. Use existing FITL convergence-witness infrastructure.
- **Migration regression** (architectural-invariant): A FITL scenario whose legal ARVN Transport binding (origin retains control after; destination is land-reachable; destination differs from origin and trainSpace) is correctly admitted.
- **Determinism**: Replay test — same GameDef + initial state + seed + actions → canonical serialized state byte-identical (Foundation 8 + 16). Verifies the new constraints do not introduce non-determinism.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — ARVN Transport template migration (`:1020-1025` area); guardrail comment update (`:1855-1866` area); potentially new `arvn.transportOrigin` selector authoring
- `data/games/fire-in-the-lake/<routeGraph-bearing-file>` (modify or new) — FITL `routeGraph` data asset; file location depends on FITL's dataAssets convention (verify at implementation time)
- `data/games/fire-in-the-lake/<zones-bearing-file>` (modify, if needed) — `zone.arvnControlledPopulationCenter` metadata tag if not already present
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (new) — convergence witness + migration regression + determinism

## Out of Scope

- **NVA route logistics migration** (`reports/fitl-competent-agent-ai.md` §3 NVA requirements) — uncommitted in this ticket; the route-graph machinery enables it (`via: routeClass.trail`), but the spec scopes ARVN Transport as the exemplar. NVA migration is a separate follow-up if authoring need is confirmed.
- **VC underground positioning** — same as NVA: enabled but out of scope.
- **Other FITL profile migrations** to new constraint kinds — uncommitted until a concrete authoring need surfaces.
- **Multi-hop route cost / weighted shortest path** — explicitly uncommitted per spec §11.
- **Hidden / partial route observability per observer** — uncommitted per spec §11; current scope assumes the route graph is public game data.

## Acceptance Criteria

### Tests That Must Pass

1. Convergence witness: an ARVN Transport binding scenario where origin control would be lost by the destination choice is rejected at the constraint admissibility pass (not legal-but-demoted).
2. Migration regression: an ARVN Transport binding satisfying all three new constraints (`locatedIn` origin control, `reachable` land route, `distinctOriginDestination`) plus the preserved `notEqual` against trainSpace is correctly admitted.
3. Plan-trace replay: same GameDef + seed + actions → byte-identical canonical state across two runs (Foundation 8 + 16).
4. `pnpm turbo build` produces byte-identical FITL GameDef across two runs after the migration (compiler determinism, Foundation 8).
5. Existing FITL convergence and policy-quality witnesses continue to pass (no regression).
6. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. ARVN Transport bindings rejected by constraint admissibility never reach the scoring pass — the architectural property the spec set out to prove.
2. The reduced `arvn.doNotLoseOriginControlByTransport` guardrail still emits its demote-penalty for legal-but-margin-degraded bindings (no regression in projected-margin posture signaling).
3. FITL `routeGraph` payload is byte-identical across two compilations (Foundation 8 + 16).
4. No game-specific identifiers leak into engine code as a result of this migration — `land`, `trail`, `highway`, `arvnControlledPopulationCenter` all remain authored labels (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (new) — architectural-invariant + convergence witness. Covers acceptance criteria 1-4. The test file is structured with one architectural-invariant block (admissibility property, determinism property) and one convergence-witness block (FITL-specific ARVN scenarios); both blocks declare their `@test-class:` headers per `.claude/rules/testing.md`. If splitting into two files is cleaner for the test-class taxonomy, split accordingly at implementation time.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. Determinism spot check: `pnpm turbo build` twice; `diff` the FITL GameDef JSON output — must be byte-identical
