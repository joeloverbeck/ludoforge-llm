# Spec 196 — Generic Role Constraints and Authored Route/Map Semantics

**Status**: PROPOSED
**Priority**: High — the only landed role constraint is `notEqual`, which is insufficient for the FITL competence report's ARVN Transport origin-control / NVA route logistics / VC underground positioning requirements. Spec 191 §2 explicitly deferred new constraint kinds "as a follow-up justified by a concrete authoring need"; the second-iteration audit and the FITL competence requirements together supply that need.
**Complexity**: M–L — extends the compiler validator and runtime constraint evaluator, adds a generic authored-route/map data-asset reader, and migrates the FITL profile to use the new constraints where they replace existing guardrail/quality workarounds. No new selector sources, no game-specific engine kinds.
**Date**: 2026-05-26
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan templates, role selectors, execution controller)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED — posture + relationship metadata)
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED — `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` registry that this spec extends; compile-time metadata enforcement)

**Trigger report**:
- `reports/ai-agent-policy-overhaul-second-iteration.md` (ChatGPT-Pro second iteration, 2026-05-26). This spec adopts the audit's verified concrete gaps (richer role constraints, authored route/map semantics) and rejects the framing that they require a new "DPRT-P" architecture — see §11. The competence requirements in `reports/fitl-competent-agent-ai.md` for ARVN Transport, NVA route logistics, and VC underground positioning supply the concrete authoring need that Spec 191 §2 set as the gate for this follow-on.

**Ticket namespace**: `196ROLECONROUTE` (proposed)

---

## 1. Goal

Close the role-constraint expressiveness gap that Spec 191 deferred, while keeping the engine game-agnostic per Foundation #1. Concretely:

1. **Extend the supported role-constraint kinds** beyond `notEqual` with: `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`. Each is a generic, observer-safe constraint over already-bound roles and authored map/graph data; none names a game-specific concept.
2. **Introduce an engine-generic authored-route/map data-asset** that game authors populate to express adjacency, route classes, and movement reachability. The engine reads the data; the kernel does not know what "LoC" or "Trail" mean — those remain authored labels on the generic graph.
3. **Wire the new constraints into the runtime evaluator and compiler validator** so a constraint like `{ reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }` is compile-validated against the authored route data and runtime-enforced.
4. **Migrate the FITL ARVN Transport templates** to use `reachable` + `distinctOriginDestination` instead of the current guardrail-penalty workaround (`agents.md:1855-1866`), demonstrating the architecture on the concrete authoring need.

## 2. Non-Goals

- **No game-specific engine kinds.** "LoC", "Trail", "Patronage", "Support" stay in authored data (Foundation #1). The engine learns "route" and "adjacency"; game authors label routes with their game-meaningful tags via `dataAssets`.
- **No structured composite-target identity restructuring.** Pipe-delimited composite identities (`origin|destination`) remain stable identity primitives per Spec 186 / verification. Whether to restructure them is a separate deferred concern (source proposal #2; see §11).
- **No new selector source kinds.** `routePairs` and `subset` enumeration shape is unchanged. Constraints filter the enumerated set; they do not introduce new selector machinery.
- **No doctrine reframe or selection-tier changes.** Spec 197 owns doctrine-gated plan-template eligibility; this spec owns role-target legality.
- **No kernel/legality changes.** Constructibility, the published frontier, and the microturn protocol are unchanged. Constraints are evaluated within the proposer's role-binding pass; the kernel sees only the resulting bound role values.

## 3. Context (verified against codebase, 2026-05-26)

- **Constraint registry (Spec 191 P1 outcome)** — `packages/engine/src/kernel/plan-role-constraints.ts:1`:
  ```ts
  export const SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS = ['notEqual'] as const;
  ```
  `constraintsSatisfied` in `plan-proposal.ts:426-444` switches on `constraint.kind === 'notEqual'` and otherwise throws via `isSupportedPlanRoleConstraintKind`. The registry is the single source of truth and the extension seam for this spec.
- **Pre-authored `locatedIn` surface (Spec 191 P1 leftover)** — `packages/engine/src/kernel/types-core.ts:1216-1218` already carries the union variant:
  ```ts
  export type CompiledPlanRoleConstraint =
    | { readonly kind: 'notEqual'; readonly role: string }
    | { readonly kind: 'locatedIn'; readonly role: string };
  ```
  Mirrored by the schema (`schemas-core.ts:1436`), the YAML-side shape (`game-spec-doc.ts:799`: `{ readonly locatedIn: string }`), and the lowering (`compile-agent-plan-templates.ts:151`). Spec 191 P1 deliberately left this surface in place and used the registry to compile-reject it (`archive/specs/191-plan-role-semantic-integrity.md:135` and `:145`). Spec 196's work on `locatedIn` lifts the rejection and restructures the payload; it does not introduce a new union slot.
- **YAML constraint parser shape** — `parsePlanRoleConstraint` at `validate-agent-plan-templates.ts:114-124` currently handles only single-string-valued keys (`{ notEqual: <ref> }`, `{ locatedIn: <ref> }`). Object-valued payloads (for `reachable`, `distinctOriginDestination`, `adjacent`, and the restructured `locatedIn`) require extending this parser, the GameSpecDoc YAML union at `game-spec-doc.ts:799`, and the lowering function below.
- **Compiler lowering seam** — `lowerRoleConstraints` at `compile-agent-plan-templates.ts:144-153` is the spec→GameDef seam for constraints; each new kind needs a branch here alongside its validator and runtime evaluator. Current shape lowers to `{ kind, role: <normalized> }`; new kinds need per-shape lowering branches.
- **Authored constraint usage in FITL** — `data/games/fire-in-the-lake/92-agents.md:1025` shows the ARVN Transport template:
  ```yaml
  constraints: [{ notEqual: role.trainSpace }]
  ```
  Only `notEqual` is authored across all FITL templates (verification confirmed; Spec 191 §3 also recorded `locatedIn`×0).
- **Origin-control preservation today (the gap)** — `data/games/fire-in-the-lake/92-agents.md:1855-1866`:
  ```yaml
  arvn.doNotLoseOriginControlByTransport:
    when:
      and:
        - { ref: candidate.tag.transport }
        - lt: [{ ref: feature.projectedSelfMarginDelta }, 0]
    severity: demote, penalty: 550
  ```
  This is a guardrail demote-penalty, not a hard role constraint. It allows the move to remain legal but suppressed — adequate for self-interested ARVN behaviour, but inadequate as the architecture's expression of "destination must be reachable from origin" or "origin must retain control after Transport."
- **Adjacency in conditions but not constraints** — `packages/engine/src/kernel/types-ast.ts` defines `{ query: 'adjacentZones', zone: ZoneRef }` and `{ op: 'adjacent', left: ZoneSel, right: ZoneSel }` for the condition/expression AST. These are usable in `when`/guardrails but are NOT plumbed into the role-constraint evaluator. The query-side machinery this spec needs exists; the constraint-side plumbing is missing.
- **Zone adjacency metadata** — `game-spec-doc.ts:75-80` declares `adjacentTo?: ReadonlyArray<{ to, direction, category }>` on ZoneDef. This is the authored adjacency data; the route layer this spec adds extends it to multi-hop reachability and route-class tagging.
- **Authored `dataAssets`** — `packages/engine/src/kernel/types-core.ts` and `game-spec-doc.ts` define the generic `dataAssets: [{ id, kind, payload }]` mechanism. Route/map data lands as a `dataAssets` entry with a generic `kind: 'routeGraph'` payload schema; no per-game schema file (Foundation #6).
- **Selector source surface** — `compile-agent-selector-sources.ts:42` enumerates the supported source kinds; `policy-selector-eval.ts:145-188` evaluates them. No change to this surface; constraints filter the enumerated sets at role-binding time.
- **Spec 191's deferral gate** — `archive/specs/191-plan-role-semantic-integrity.md:30`: "No new selector sources or constraint kinds. … New constraint kinds are a follow-up justified by a concrete authoring need." This spec is that follow-up; the concrete authoring need is the FITL ARVN Transport / NVA logistics requirement from `reports/fitl-competent-agent-ai.md` §3 (ARVN requirements: "Transport origin/destination pairs," "Avoiding origin control loss after Transport"; NVA requirements: "route/origin/destination reasoning").

## 4. Architecture

### 4.1 Constraint registry extension

Extend `plan-role-constraints.ts`:

```ts
export const SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS = [
  'notEqual',
  'locatedIn',
  'distinctOriginDestination',
  'reachable',
  'adjacent',
] as const;
```

`locatedIn` is already a `CompiledPlanRoleConstraint` union variant from Spec 191 P1 (registry-rejected, runtime-unimplemented) with payload `{ role: string }`; this spec lifts the registry rejection AND restructures the payload to carry the container reference. The other three (`distinctOriginDestination`, `reachable`, `adjacent`) are net-new union variants.

Compiled payload shapes in `CompiledPlanRoleConstraint` (`kernel/types-core.ts`):

- `{ kind: 'locatedIn', role, container }` — bound target is positioned within the named zone or within the zone bound to another role. **Restructured from existing `{ role: string }`**; the existing slot has no authored consumers in any game profile, so payload migration is type/schema/lowering-only (Foundation #14: no compat shim).
- `{ kind: 'distinctOriginDestination', origin, destination }` — both roles bound, and `origin.zone ≠ destination.zone` (the common case for movement actions; cheaper-to-author than two `notEqual` permutations against composite role values).
- `{ kind: 'reachable', from, to, via?, maxHops? }` — destination is graph-reachable from origin under the authored route graph, optionally restricted to a route class and a hop budget. `maxHops` defaults to the route data's authored `defaultMaxHops`; absence of route data fails compilation.
- `{ kind: 'adjacent', a, b }` — single-hop adjacency in the authored route graph (a degenerate `reachable` with `maxHops: 1`, surfaced as a separate kind for authoring clarity).

All compiled ref fields (`role`, `container`, `origin`, `destination`, `from`, `to`, `a`, `b`, `via`) are `string`-typed in the compiled artifact, consistent with the existing `CompiledPlanRoleConstraint.role: string` shape. The pseudo-types `RoleRef`, `ZoneRef`, and `RouteClassRef` used in payload prose are presentational labels documenting the authored namespace expected at each position — they are not branded types. Branded-type uplift (Foundation #17) for role/zone/route-class refs is uncommitted and out of scope; if needed later it travels across all role-binding refs uniformly, not constraint-by-constraint.

**Authored YAML shape per kind** (handled by `parsePlanRoleConstraint` and `lowerRoleConstraints`):

- `notEqual: role.X` — single string (existing, unchanged).
- `locatedIn: { role: role.X, container: zone.Y | role.Z }` — object; the existing single-string `locatedIn: role.X` authoring shape is removed in the same change (no authored consumers exist).
- `distinctOriginDestination: { origin: role.X, destination: role.Y }` — object.
- `reachable: { from: role.X, to: role.Y, via?: routeClass.Z, maxHops?: <positive integer> }` — object.
- `adjacent: { a: role.X, b: role.Y }` — object.

The GameSpecDoc YAML union at `game-spec-doc.ts:799` is widened from the closed string-valued shape to admit the object-valued payloads above.

**Extension sites** (per new/restructured kind):

- `plan-role-constraints.ts` — registry entry in `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS`.
- `kernel/types-core.ts` — union member with typed payload.
- `kernel/schemas-core.ts` — zod schema for the union member.
- `cnl/game-spec-doc.ts` — authored YAML union widening.
- `cnl/validate-agent-plan-templates.ts` — `parsePlanRoleConstraint` extension, plus per-kind shape checks (roles exist, container/route references resolve, `maxHops` is positive integer) emitting role/template-named diagnostics (Foundation #12).
- `cnl/compile-agent-plan-templates.ts` — `lowerRoleConstraints` per-kind branch.
- `agents/plan-proposal.ts` — `constraintsSatisfied` per-kind branch (see §4.3 for the contract change).

### 4.2 Authored route/map data asset

Introduce a generic `dataAssets` entry kind `routeGraph` with payload schema:

```yaml
- id: fitl.routeGraph
  kind: routeGraph
  payload:
    routeClasses:
      - { id: land, label: Land routes }
      - { id: trail, label: Trail }
      - { id: highway, label: Highway }
    edges:
      - { from: zone.saigon, to: zone.binhDuong, classes: [land, highway] }
      - { from: zone.binhDuong, to: zone.tayNinh, classes: [land] }
      # ...
    defaultMaxHops: 3
```

The engine reads this payload through a new `RouteGraphProvider` interface that compiles into immutable graph indices at GameDef-compile time (Foundation #8 — deterministic compilation; Foundation #13 — recorded in artifact identity via the GameDef hash). The provider exposes only generic queries (`adjacent(a, b, class?)`, `reachable(a, b, class?, maxHops?)`) — no game-specific named queries.

Game authors label route classes ("trail", "highway", "LoC") as authored data; the engine does not know what a "trail" means.

The kind name `routeGraph` is added to the typed `KNOWN_DATA_ASSET_KINDS` registry at `kernel/types-core.ts:1540` (currently `['map', 'scenario', 'pieceCatalog', 'seatCatalog']`) and to its corresponding schema entry in `kernel/schemas-core.ts`. Adding it to the typed registry preserves Foundation #17 for `DataAssetRef.kind` consumers (`types-core.ts:1715`).

### 4.3 Runtime constraint evaluation

`constraintsSatisfied` (`plan-proposal.ts:426-444`) is restructured. The existing function entry-points with `const other = existing[constraint.role]; if (other === undefined) return true;` — this early-return and the single-field `constraint.role` access are `notEqual`-specific and are folded into the `notEqual` branch. Each new-kind branch resolves its own role refs from the constraint payload independently (e.g., `reachable` resolves `existing[from]` and `existing[to]`; `locatedIn` resolves `existing[role]` and dispatches on whether `container` names a zone literal or a role binding). The function signature stays `(binding, constraints, existing) -> boolean`; only its internal contract changes. Role-precedence (Spec 191 P1) already guarantees that every role referenced by a constraint is bound before evaluation; the new branches rely on that guarantee rather than re-implementing the vacuous-pass shortcut.

Per-kind evaluators consult observer-safe state already available to the proposer:

- `locatedIn` reads `state.tokenPositions[role.boundTarget]` (or the zone-containment for zone-typed targets) and compares against the bound container.
- `distinctOriginDestination` is a one-line role-pair compare.
- `reachable` and `adjacent` invoke `RouteGraphProvider` against the GameDef-compiled graph indices, with `maxHops` bounded per Foundation #10.

All evaluators are pure functions of `(state, roleBindings, constraint)`; no side effects, no hidden-state reads.

### 4.4 FITL ARVN Transport migration

Migrate the ARVN Transport template in `92-agents.md` to express origin-control and reachability as constraints, demoting the existing `arvn.doNotLoseOriginControlByTransport` guardrail to a complement (still useful for the projected-margin posture, but no longer the only enforcement of "preserve origin control"):

```yaml
roles:
  - id: transportOrigin
    selectorId: arvn.transportOrigin
    constraints:
      - { locatedIn: zone.arvnControlledPopulationCenter }   # generic — "controlled" is authored zone metadata
  - id: transportDestination
    selectorId: arvn.transportDestination
    constraints:
      - { reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }
      - { distinctOriginDestination: { origin: role.transportOrigin, destination: role.transportDestination } }
```

The `routeClass.land` reference is an authored label on the route graph, not a game-specific engine kind. The same architecture supports NVA logistics (`via: routeClass.trail`), VC underground movement (a separate `routeClass`), and future games' route taxonomies without engine changes.

## 5. Determinism and replay (Foundations #8, #16)

- Route graph compilation is pure over the GameSpecDoc YAML; `pnpm turbo build` twice produces byte-identical GameDef.
- `RouteGraphProvider` queries return deterministic ordered results (stable hop-by-hop enumeration; ties broken by zone identifier sort order).
- Plan traces with the new constraints replay byte-identically across runs.

## 6. Edge cases

- **Missing route graph asset** — a `reachable` or `adjacent` constraint with no authored `routeGraph` data asset fails compilation with a template/role-named diagnostic. The fallback "reachability via zone `adjacentTo` only" is deliberately not provided — implicit fallback would mask authoring omissions (Foundation #14: no shims).
- **Cyclic route graphs** — supported; `reachable` BFS is hop-bounded so cycles do not unbound traversal (Foundation #10).
- **Multiple route classes per edge** — supported; `via` filters; absence of `via` means any class.
- **Hidden-information zones** — `locatedIn` against a hidden zone is observer-unsafe. The compiler rejects constraints that reference roles whose binding is observer-restricted at the agent's observer scope (Foundation #4 + #20). The check slots into `validate-agent-plan-templates.ts` alongside the existing role-precedence and unsupported-kind checks; observer-scope metadata is sourced from the agent declaration (consistent with Spec 191's existing `targetKind` validation site).
- **Constraint references unbound role** — `reachable: { from: role.A, to: role.B }` where role A is bound after role B in role iteration: the validator enforces constraint role-precedence (Spec 191 P1 already validates this; the new constraints reuse the same precedence machinery).

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Constraint registry extension (§4.1) | `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` extended; per-kind payload typed in `kernel/types-core.ts`; compiler validates shape (role refs resolve, `maxHops` positive); a fixture template with each new kind compiles; an unsupported kind fails compile; determinism preserved | S–M |
| **P2** | Authored route/map dataAsset (§4.2) | `routeGraph` `dataAssets` kind defined; schema validated at compile time; `RouteGraphProvider` interface + immutable graph index; deterministic compilation byte-identical across two runs; fixture FITL `routeGraph` authored; queries (`adjacent`, `reachable(maxHops)`) tested with golden traversal results | M |
| **P3** | Runtime constraint evaluation (§4.3) | `constraintsSatisfied` evaluates each new kind purely; FITL fixture exercises each constraint; observer-safe state-read contract preserved; plan-trace replay byte-identical | M |
| **P4** | FITL ARVN Transport migration (§4.4) | ARVN Transport template uses `reachable` + `distinctOriginDestination` + `locatedIn` constraints; the existing `arvn.doNotLoseOriginControlByTransport` guardrail is reduced to projected-margin-only complement (not removed entirely, since margin signal is independent); witness test proves illegal-transport bindings are rejected by constraint, not relegated to guardrail penalty | M |

## 8. Test plan

- **Compiler error corpus** (architectural-invariant): unsupported constraint kind; missing route graph for `reachable`; `locatedIn` with hidden-info container at agent scope; `maxHops` non-positive; role precedence violation. Each fails with template/role-named diagnostic that replays byte-identically.
- **Route graph determinism** (architectural-invariant): same authored `routeGraph` payload compiled twice produces byte-identical graph indices; `reachable(a, b, maxHops)` returns the same hop-sorted result deterministically.
- **Runtime architectural-invariant**: each new constraint kind, when violated, removes the candidate from the role-binding result set; when satisfied, includes it.
- **FITL convergence witness**: ARVN Transport scenarios where origin-control would be lost by the destination choice fail constraint admissibility (rather than being demoted by guardrail). Use existing FITL convergence-witness machinery.
- **Determinism**: `pnpm turbo build` twice byte-identical; plan-trace golden replay preserved.

## 9. Foundation alignment

#1 (engine learns generic "route" and "adjacency", not "LoC" or "Trail") · #2 (`routeGraph` payload is GameSpecDoc-resident and evolvable via the standard YAML mutation surface; route classes and edges are first-class evolution targets) · #6 (no per-game schema; `routeGraph` is generic `dataAssets` kind) · #10 (`maxHops` bounded, BFS finite) · #12 (compiler validates everything knowable from spec — route refs, role refs, payload shape) · #14 (constraint registry is single source of truth; no compatibility fallback for missing route data; `locatedIn` payload migration happens in the same change as the registry registration, no compat shim) · #15 (root-cause: closes the constraint-expressiveness gap Spec 191 deferred) · #16 (witness-tested across compiler + runtime + FITL migration) · #17 (compiled refs remain `string`-typed consistent with existing `CompiledPlanRoleConstraint.role`; `RoleRef`/`ZoneRef`/`RouteClassRef` in this spec are presentational, not branded-type uplift, which is out of scope).

## 10. Reassessment of source proposal (`reports/ai-agent-policy-overhaul-second-iteration.md`)

**Adopted (this spec's slice):**
- §3 (proposal #4: richer role constraints — `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`) → §4.1 + §4.3.
- §3 (proposal #5: authored route/map semantics) → §4.2 with the corrected framing that engine sees only generic `route`/`adjacency`; "LoC", "Trail" are authored labels.
- §3 (proposal #3: typed target-role schemas) — partially landed via Spec 191's `targetKind` validation; this spec extends per-constraint typing for new kinds in §4.1.

**Corrected:**
- The audit cites `locatedIn` as "parsed but rejected" — stale citation; Spec 191 P1 added `locatedIn` to the `CompiledPlanRoleConstraint` union (`types-core.ts:1216-1218`), schema (`schemas-core.ts:1436`), YAML shape (`game-spec-doc.ts:799`), and lowering (`compile-agent-plan-templates.ts:151`), then used the registry to compile-reject it (`archive/specs/191-plan-role-semantic-integrity.md:135` and `:145`). This spec lifts the registry rejection AND restructures the payload from `{ role: string }` to `{ role, container }` to carry the container reference — which is the work the Spec 191 deferral named.
- The audit's framing that this work requires a "DPRT-P" reframe is rejected — these are constraint-expressiveness additions to the existing architecture, not architectural replacement.

**Deferred (named follow-ups, not in this spec):**
- Structured composite target identity (proposal #2) — pipe-strings preserved; trace-quality concern revisitable when explainability requirements surface.
- Doctrine-gated plan-template eligibility (proposal #1's load-bearing core) — Spec 197.
- Cross-game conformance + observer-safety proofs (proposals #8, #10, #11) — Spec 198.
- Compound availability at root proposal (proposal #7) — Spec 199.
- Cookbook conceptual rewrite (proposal #9) — routed to `reassess-agent-dsl-cookbook` skill (Spec 191 §11 deferral, now triggered post-Spec-190).

**Rejected (with rationale):**
- "Promote doctrine to first-class layer" (proposal #1 reframe) — Spec 191 §11 already rejected this as Foundation #14 churn; the load-bearing decoupling gap is owned by Spec 197 in its smaller, targeted form.
- Game-specific kinds in the engine ("LoC", "Trail") — Foundation #1; route classes stay as authored labels.

## 11. Out of scope (named follow-on / sibling)

- **Spec 197** — doctrine-gated plan-template eligibility (mutually independent).
- **Spec 198** — cross-game conformance corpus + observer-safety proofs (mutually independent).
- **Spec 199** — compound availability at root proposal (mutually independent).
- Multi-hop route cost (weighted shortest path) — uncommitted until a profile needs it.
- Hidden/partial route observability per observer — uncommitted; current scope assumes route graph is public game data (zone connectivity in FITL is public).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-26:

- [`archive/tickets/196ROLECONROUTE-001.md`](../archive/tickets/196ROLECONROUTE-001.md) — P1 — Constraint registry extension and compile-time surface for new role-constraint kinds (covers §4.1 / §7 P1)
- [`archive/tickets/196ROLECONROUTE-002.md`](../archive/tickets/196ROLECONROUTE-002.md) — P2 — Authored routeGraph data asset and RouteGraphProvider (covers §4.2 / §7 P2)
- [`tickets/196ROLECONROUTE-003.md`](../tickets/196ROLECONROUTE-003.md) — P3 — Runtime constraint evaluation and constraintsSatisfied contract restructure (covers §4.3 / §7 P3)
- [`tickets/196ROLECONROUTE-004.md`](../tickets/196ROLECONROUTE-004.md) — P4 — FITL ARVN Transport constraint migration and convergence witness (covers §4.4 / §7 P4)
