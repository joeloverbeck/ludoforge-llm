# 196ROLECONROUTE-002: P2 — Authored routeGraph data asset and RouteGraphProvider

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel/types-core.ts` `KNOWN_DATA_ASSET_KINDS` extension; `kernel/schemas-core.ts` routeGraph payload schema; new `kernel/route-graph-provider.ts` module; `cnl/validate-agent-plan-templates.ts` route-ref resolution validator (completes ticket 001's deferral); `cnl/game-spec-doc.ts` routeGraph dataAsset typing
**Deps**: `archive/tickets/196ROLECONROUTE-001.md`

## Problem

Spec 196's `reachable` and `adjacent` role constraints require an engine-generic authored route graph that the kernel can query. Ticket 001 admitted the constraint kinds at the compile-time surface but deferred route-ref resolution (does `routeClass.X` resolve to an authored route class?) until the routeGraph parser exists. This ticket adds:

1. A new `routeGraph` data-asset kind registered in `KNOWN_DATA_ASSET_KINDS` (preserves Foundation 17 typed ref).
2. The schema for the `routeGraph` payload (`routeClasses`, `edges`, `defaultMaxHops`).
3. A `RouteGraphProvider` interface and immutable graph indices compiled at GameDef-compile time, exposing generic `adjacent(a, b, class?)` and `reachable(a, b, class?, maxHops?)` queries.
4. The completion of ticket 001's validator with route-ref resolution against the parsed `routeGraph`.
5. Compile-time rejection of `locatedIn` constraints whose role binding is observer-restricted at the agent's observer scope (spec §6).

## Assumption Reassessment (2026-05-26)

1. `KNOWN_DATA_ASSET_KINDS` is `['map', 'scenario', 'pieceCatalog', 'seatCatalog']` at `packages/engine/src/kernel/types-core.ts:1540`. `DataAssetRef.kind` uses the derived `KnownDataAssetKind` type (`:1715`), so a `routeGraph` ref will not type-check until the registry is extended.
2. `DataAssetEnvelope` (`:1659-1663`) and `GameSpecDataAsset` (`cnl/game-spec-doc.ts:247-252`) accept arbitrary `kind: string` — the `routeGraph` payload is layered onto the existing dataAsset infrastructure without changing its envelope.
3. No `routeGraph` references exist anywhere in the repo today (verified by exhaustive grep in the reassessment). FITL currently authors zero `dataAssets:` entries — ticket 002 introduces the first authored data-asset payload that the FITL profile will consume (ticket 004 authors the FITL routeGraph; ticket 002 ships a fixture routeGraph for tests).
4. The condition AST already supports an `adjacentZones` query (`kernel/eval-query.ts:1287`) and `ZoneDef.adjacentTo` metadata (`game-spec-doc.ts:75-80`). The route-graph provider is a *separate* indexing surface — it composes route classes (a route-class-labeled graph) on top of the zone-adjacency graph; the existing `adjacentZones` evaluator continues to expose zone-level adjacency unchanged.
5. Ticket 001's `parsePlanRoleConstraint` extension accepts `via: routeClass.X` strings as well-formed but does not check that the route class exists. That deferred check lands in this ticket.
6. Observer-scope metadata is sourced from the agent declaration; the existing Spec 191 `targetKind` validation site in `validate-agent-plan-templates.ts` is the natural insertion point for the hidden-info `locatedIn` rejection (spec §6).

## Architecture Check

1. **Engine-agnostic generic queries (Foundation 1)**: `RouteGraphProvider` exposes only `adjacent(a, b, class?)` and `reachable(a, b, class?, maxHops?)`. Game-meaningful labels like `trail`, `highway`, `LoC` enter the engine only as authored string identifiers on edges and route classes — the kernel does not know what a "trail" means.
2. **Generic dataAsset schema (Foundation 6)**: The `routeGraph` payload joins the existing `dataAssets` mechanism with a schema entry in `schemas-core.ts`. No per-game schema file is introduced.
3. **Strongly typed identifiers (Foundation 17)**: Adding `'routeGraph'` to `KNOWN_DATA_ASSET_KINDS` keeps `DataAssetRef.kind` typed-narrowly. The route graph's `routeClassId` and `edge` references remain `string`-typed in compiled form, consistent with ticket 001's `string`-typed compiled refs.
4. **Deterministic compilation (Foundation 8 + 16)**: The compiled graph indices are sorted by stable identifier order (route-class id ascending; edge endpoints in lexicographic zone-id pair order). BFS reachability traversal enumerates neighbors in deterministic order. Two builds of the same GameSpecDoc produce byte-identical graph indices and byte-identical query results.
5. **Bounded computation (Foundation 10)**: `reachable` BFS is hop-bounded by `maxHops` (per-query argument or per-asset `defaultMaxHops`). Cycles are supported (BFS visits each node at most once at each hop level).
6. **No compatibility fallback for missing route data (Foundation 14)**: A `reachable` or `adjacent` constraint authored without a `routeGraph` data asset in the same GameSpecDoc fails compilation with a template/role-named diagnostic. There is no implicit fallback to `ZoneDef.adjacentTo` zone adjacency — implicit fallback would mask authoring omissions.

## What to Change

### 1. Data-asset kind registration

Extend `packages/engine/src/kernel/types-core.ts:1540`:

```ts
export const KNOWN_DATA_ASSET_KINDS = ['map', 'scenario', 'pieceCatalog', 'seatCatalog', 'routeGraph'] as const;
```

Add a corresponding payload type:

```ts
export interface RouteGraphPayload {
  readonly routeClasses: readonly { readonly id: string; readonly label?: string }[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly classes: readonly string[] }[];
  readonly defaultMaxHops: number; // positive integer
}
```

### 2. Schema

Add a schema entry in `packages/engine/src/kernel/schemas-core.ts` for `RouteGraphPayload` validating:

- `routeClasses`: non-empty array of `{ id: string, label?: string }`, `id` matches a `routeClassRef` shape.
- `edges`: array of `{ from, to, classes }`; `from` and `to` are valid `ZoneId`-shaped strings; `classes` is a non-empty array of route-class ids that must exist in the same `routeClasses` array.
- `defaultMaxHops`: positive integer.
- Schema-level cross-references: every `classes` entry resolves to a `routeClasses[].id`.

The schema is selected at GameSpecDoc parse time when `kind === 'routeGraph'`. Author the schema selection alongside other `dataAssets` kind-dispatching code (locate the existing dispatcher and add the `routeGraph` branch).

### 3. RouteGraphProvider module

New file `packages/engine/src/kernel/route-graph-provider.ts`:

```ts
export interface RouteGraphProvider {
  adjacent(a: string, b: string, routeClass?: string): boolean;
  reachable(a: string, b: string, routeClass?: string, maxHops?: number): boolean;
  readonly defaultMaxHops: number;
}

export function compileRouteGraphProvider(payload: RouteGraphPayload): RouteGraphProvider;
```

`compileRouteGraphProvider` builds two immutable indices:

- `adjacencyByClass`: `Map<routeClassId | '*', Map<zoneId, Set<zoneId>>>` — `'*'` is the any-class index (union of all classes per edge).
- The `'*'` index is materialized at compile time, not derived at query time, to avoid set-union allocation per query.

Both indices use insertion order derived from sorting `routeClasses` by id ascending and sorting edges by (`from`, `to`, joined route-class id list) lexicographic. Each `Set<zoneId>` is materialized from a sorted array (deterministic iteration order).

`adjacent(a, b, routeClass?)` is `indices[routeClass ?? '*'].get(a)?.has(b) ?? false`.

`reachable(a, b, routeClass?, maxHops?)` is BFS:
- Cap = `maxHops ?? defaultMaxHops`.
- Visit order: neighbors enumerated from the deterministic-iteration `Set<zoneId>`.
- Stop early when `b` reached; return `true`. Return `false` if frontier exhausts before hop cap.

### 4. Route-ref resolution validator (completes ticket 001's deferral)

In `packages/engine/src/cnl/validate-agent-plan-templates.ts`, after the per-kind shape checks ticket 001 added:

- For `reachable` constraints with a `via: routeClass.X` field, verify the `routeGraph` data asset is present in the GameSpecDoc AND that `X` resolves to a `routeClasses[].id`. Missing `routeGraph` → diagnostic `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING`. Missing route class → diagnostic `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_CLASS_UNRESOLVED`.
- For `adjacent` constraints, same `routeGraph`-presence check (no `via` field to resolve, but the kind itself requires the route-graph machinery).
- Author both diagnostic codes alongside ticket 001's `CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED`.

### 5. Hidden-info observer-scope rejection (`locatedIn` edge case)

In the same validator, after the per-kind shape checks, add a check for `locatedIn` constraints: if the `container` ref names a role whose binding selector is observer-restricted at the agent's observer scope (sourced from the agent declaration's existing scope metadata, the same site that drives `targetKind` validation), emit `CNL_COMPILER_AGENT_PLAN_TEMPLATE_LOCATED_IN_HIDDEN_CONTAINER`. Foundation 4 + 20.

### 6. Tests

New architectural-invariant tests:

- Compile-time: `reachable` constraint without `routeGraph` data asset → `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING`. `reachable` with `via: routeClass.nonexistent` → `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_CLASS_UNRESOLVED`. `locatedIn` with observer-restricted container role → `CNL_COMPILER_AGENT_PLAN_TEMPLATE_LOCATED_IN_HIDDEN_CONTAINER`.
- `routeGraph` schema rejects: empty `routeClasses`; edge referencing missing route class; non-positive `defaultMaxHops`.
- `RouteGraphProvider` queries: golden-trace test fixture exercises `adjacent` and `reachable(maxHops)` against a hand-authored small graph (a 5-zone fixture with two route classes), asserting deterministic boolean results across a small grid of queries.
- Determinism: same `routeGraph` payload compiled twice produces byte-identical graph indices (compare serialized form or hash of compiled indices); deterministic hop-by-hop traversal across runs.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — `KNOWN_DATA_ASSET_KINDS` at `:1540`; new `RouteGraphPayload` interface
- `packages/engine/src/kernel/schemas-core.ts` (modify) — new `RouteGraphPayloadSchema`; dispatcher branch for `kind === 'routeGraph'`
- `packages/engine/src/kernel/route-graph-provider.ts` (new) — interface + `compileRouteGraphProvider`
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify) — route-ref resolution check; hidden-info `locatedIn` rejection
- `packages/engine/src/cnl/game-spec-doc.ts` (modify) — optional typed surface for `routeGraph` payloads if the existing dataAsset type machinery surfaces them; otherwise no change here
- `packages/engine/test/unit/kernel/route-graph-provider.test.ts` (new) — provider behavior + determinism
- `packages/engine/test/unit/cnl/plan-role-constraint-route-resolution.test.ts` (new) — route-ref resolution diagnostics
- `packages/engine/test/unit/cnl/plan-role-constraint-hidden-container.test.ts` (new) — observer-scope rejection

## Out of Scope

- **FITL `routeGraph` authoring** — owned by ticket 004. This ticket ships a *fixture* `routeGraph` payload (5-zone toy graph) for unit tests; real game profiles author their own routeGraph data asset.
- **Runtime constraint evaluation** — owned by ticket 003. The provider is constructed at GameDef-compile time and held by the runtime, but ticket 002 does not modify `constraintsSatisfied`.
- **Multi-hop route cost / weighted shortest path** — explicitly uncommitted per spec §11 (only unweighted `reachable` with hop cap is in scope).
- **Hidden / partial route observability per observer** — uncommitted per spec §11. The current scope assumes the route graph is public game data.

## Acceptance Criteria

### Tests That Must Pass

1. A `reachable` constraint in a plan template, compiled without a sibling `routeGraph` data asset, fails compile with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING`.
2. A `reachable` constraint with `via: routeClass.X` referencing an unauthored route class fails compile with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_CLASS_UNRESOLVED`.
3. A `locatedIn` constraint whose `container` role is observer-restricted at the agent's scope fails compile with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_LOCATED_IN_HIDDEN_CONTAINER`.
4. `RouteGraphProvider.adjacent` and `RouteGraphProvider.reachable` return correct boolean results on a fixture 5-zone graph with two route classes, across a hand-authored grid of queries (golden test).
5. Compiling the same `routeGraph` payload twice produces byte-identical compiled graph indices.
6. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. `RouteGraphProvider` exposes only generic queries (`adjacent`, `reachable`); no game-specific named queries.
2. `adjacent` and `reachable` return deterministic results across runs given the same compiled graph and arguments.
3. `reachable` BFS is hop-bounded; cycles do not cause unbounded traversal (Foundation 10).
4. `'routeGraph'` joins `KNOWN_DATA_ASSET_KINDS` as a typed-literal kind; no game-specific schema file is added (Foundation 6).
5. Compile-time refusal of constraints with missing `routeGraph`, unresolved `routeClass`, or observer-restricted `locatedIn` containers is observable as a CNL diagnostic — no runtime fallback.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/route-graph-provider.test.ts` (new) — architectural-invariant. Golden queries against a 5-zone fixture graph; determinism assertion (byte-identical indices across two compilations).
2. `packages/engine/test/unit/cnl/plan-role-constraint-route-resolution.test.ts` (new) — architectural-invariant. Missing routeGraph + unresolved routeClass diagnostics.
3. `packages/engine/test/unit/cnl/plan-role-constraint-hidden-container.test.ts` (new) — architectural-invariant. Observer-scope rejection of `locatedIn` against hidden roles.

All declare `// @test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/kernel/route-graph-provider.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-route-resolution.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-hidden-container.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-05-26.

Implemented scope:

- Added `'routeGraph'` to `KNOWN_DATA_ASSET_KINDS` and introduced the generic `RouteGraphPayload` type in `packages/engine/src/kernel/types-core.ts`.
- Added `RouteGraphPayloadSchema` in `packages/engine/src/kernel/schemas-gamespec.ts`, selected by the existing data-asset validation dispatcher when `kind === 'routeGraph'`.
- Added `packages/engine/src/kernel/route-graph-provider.ts` with deterministic immutable adjacency indices, `adjacent`, `reachable`, `defaultMaxHops`, payload validation, and a serializable snapshot used by determinism tests.
- Added focused plan-role constraint route validation in `packages/engine/src/cnl/validate-agent-plan-route-constraints.ts`, then wired `validate-agent-plan-templates.ts` to reject missing routeGraph assets, unresolved routeClass refs, and observer-restricted `locatedIn` container roles.
- Added focused architectural-invariant tests for routeGraph provider behavior, route-ref diagnostics, hidden-container diagnostics, routeGraph payload rejection, and P1 lowering/validation compatibility.

Deviations:

- The schema entry landed in `schemas-gamespec.ts`, which is the existing source module exported through `kernel/schemas.js`; there was no separate routeGraph branch needed in `schemas-core.ts`.
- `cnl/game-spec-doc.ts` required no edit because `GameSpecDataAsset.payload` is already the generic typed surface for data assets.
- Hidden-container validation uses the current generic selector/zone visibility metadata to reject zone selectors that can expose hidden zones as role containers. Runtime hidden/partial route observability remains out of scope as the ticket states.

Source-size ledger:

| path | before lines | after lines | active growth | crossed cap? | ledger status |
| --- | ---: | ---: | ---: | --- | --- |
| `packages/engine/src/cnl/validate-agent-plan-templates.ts` | 845 | 668 | -177 | no | extracted route/constraint parsing helpers into `validate-agent-plan-route-constraints.ts` |
| `packages/engine/src/cnl/validate-agent-plan-route-constraints.ts` | 0 | 308 | +308 | no | new focused module, below cap |
| `packages/engine/src/kernel/types-core.ts` | 2936 | 2953 | +17 | preexisting oversize, still over | user-approved option 1 defers splitting the required registry/type addition because extracting the entire shared type surface would widen the ticket |
| `packages/engine/src/kernel/route-graph-provider.ts` | 0 | 226 | +226 | no | new focused module, below cap |

Verification:

- `pnpm -F @ludoforge/engine build` — passed after source-size extraction.
- `node --test packages/engine/dist/test/unit/kernel/route-graph-provider.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-route-resolution.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-hidden-container.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-validation.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-lowering.test.js` — passed after source-size extraction.
- `pnpm -F @ludoforge/engine test` — passed after source-size extraction (`171/171 files passed`).
- `pnpm turbo build` — passed.
- `pnpm turbo test` — passed (`5 successful, 5 total`; engine lane `171/171 files passed`).
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm run check:ticket-deps` — passed before archive and after archive/reference repair.
- `git diff --check` — passed before archive and after archive/reference repair.
