# 196ROLECONROUTE-001: P1 — Constraint registry extension and compile-time surface for new role-constraint kinds

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel/plan-role-constraints.ts` registry; `kernel/types-core.ts` `CompiledPlanRoleConstraint` union; `kernel/schemas-core.ts` zod schema; `cnl/game-spec-doc.ts` authored YAML union; `cnl/validate-agent-plan-templates.ts` parser + per-kind shape checks; `cnl/compile-agent-plan-templates.ts` lowering
**Deps**: `specs/196-generic-role-constraints-and-authored-route-semantics.md`

## Problem

Spec 191 P1 established `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS = ['notEqual']` and added an unused `locatedIn` type-union variant that is compile-rejected at the registry. The constraint expressiveness gap blocks FITL ARVN Transport (origin-control, destination reachability) and NVA/VC route-logistics authoring, which the FITL competence requirements name as the concrete authoring need that Spec 191 §2 set as the gate for this follow-on. This ticket extends the compile-time surface to admit `locatedIn` (restructured payload), `distinctOriginDestination`, `reachable`, and `adjacent`. Runtime and route-graph machinery land in subsequent tickets.

## Assumption Reassessment (2026-05-26)

1. `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` is declared at `packages/engine/src/kernel/plan-role-constraints.ts:1` with `['notEqual']` and the `isSupportedPlanRoleConstraintKind` guard at `:5-9` — confirmed by reassessment.
2. `CompiledPlanRoleConstraint` already carries the `locatedIn` variant with payload `{ role: string }` (`types-core.ts:1216-1218`), schema mirror at `schemas-core.ts:1436`, lowering at `compile-agent-plan-templates.ts:151`, YAML shape at `game-spec-doc.ts:799` (`{ readonly locatedIn: string }`), parser at `validate-agent-plan-templates.ts:120-121`. This work *restructures* the existing `locatedIn` variant (from `{ role }` to `{ role, container }`) and adds three new variants — it does not introduce a new union slot.
3. `parsePlanRoleConstraint` (`validate-agent-plan-templates.ts:114-124`) only recognizes single-string-valued YAML keys today; widening to object-valued payloads (for `reachable`/`distinctOriginDestination`/`adjacent`/restructured `locatedIn`) is part of this ticket.
4. `lowerRoleConstraints` (`compile-agent-plan-templates.ts:144-153`) currently lowers to `{ kind, role: <normalized> }` for both `notEqual` and `locatedIn`. New per-kind lowering branches are required.
5. FITL authors only `notEqual` constraints today (7 occurrences across `data/games/fire-in-the-lake/92-agents.md`, all `{ notEqual: role.X }`); no existing authored consumers depend on the current `locatedIn` payload shape, so its restructuring carries no authored-data migration (Foundation 14, no compat shim).
6. Route-ref resolution validation (does `routeClass.X` resolve against an authored `routeGraph`?) requires the routeGraph parser, which lives in ticket 002. This ticket validates payload shape (roles exist via existing precedence machinery; `maxHops` is a positive integer; required object fields are present), not route-ref resolution.

## Architecture Check

1. **Single source of truth preserved (Foundation 14)**: The registry `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` remains the registration point; runtime and validator both consult it via `isSupportedPlanRoleConstraintKind`. The existing single-source pattern is extended, not duplicated.
2. **Engine agnostic (Foundation 1)**: The new kinds describe generic graph/zone relationships (`locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`). No game-specific identifiers (`LoC`, `Trail`, `Patronage`) enter the engine — those remain authored labels on the route classes that ticket 002 introduces.
3. **Compile-time validation completeness (Foundation 12)**: Per-kind payload shape checks emit role/template-named diagnostics on malformed payloads, so authoring errors fail compile rather than reaching runtime.
4. **Payload restructure without compat shim (Foundation 14)**: The existing `locatedIn` payload `{ role: string }` is replaced by `{ role, container }` in the same change. Type, schema, lowering, and YAML shape all migrate together; no fallback path is left.
5. **Mechanical uniformity across six extension sites**: Although six files change, each change is a small per-kind branch (registry entry; union variant; schema entry; YAML union widening; parser branch; lowering branch). The coordinated edits form one architectural surface — separating them would produce tickets that individually break the build.

## What to Change

### 1. Registry extension (`packages/engine/src/kernel/plan-role-constraints.ts`)

Extend the tuple to:

```ts
export const SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS = [
  'notEqual',
  'locatedIn',
  'distinctOriginDestination',
  'reachable',
  'adjacent',
] as const;
```

The `SupportedPlanRoleConstraintKind` derived type and `isSupportedPlanRoleConstraintKind` guard automatically pick up the new members.

### 2. Compiled union (`packages/engine/src/kernel/types-core.ts:1216-1218`)

Replace the existing two-variant union with five variants. Compiled ref fields stay `string`-typed (consistent with the existing `role: string` shape — pseudo-types `RoleRef`/`ZoneRef`/`RouteClassRef` from the spec are presentational only):

```ts
export type CompiledPlanRoleConstraint =
  | { readonly kind: 'notEqual'; readonly role: string }
  | { readonly kind: 'locatedIn'; readonly role: string; readonly container: string }
  | { readonly kind: 'distinctOriginDestination'; readonly origin: string; readonly destination: string }
  | { readonly kind: 'reachable'; readonly from: string; readonly to: string; readonly via?: string; readonly maxHops?: number }
  | { readonly kind: 'adjacent'; readonly a: string; readonly b: string };
```

Use existing branded `ZoneId`/`RoleId`-style types only if already declared adjacent; otherwise `string`. Branded uplift is explicitly out of scope (§4.1 of the spec).

### 3. Zod schema (`packages/engine/src/kernel/schemas-core.ts:1436`)

Extend the union to validate each new variant:

```ts
const CompiledPlanRoleConstraintSchema = z.union([
  z.object({ kind: z.literal('notEqual'), role: StringSchema }).strict(),
  z.object({ kind: z.literal('locatedIn'), role: StringSchema, container: StringSchema }).strict(),
  z.object({ kind: z.literal('distinctOriginDestination'), origin: StringSchema, destination: StringSchema }).strict(),
  z.object({ kind: z.literal('reachable'), from: StringSchema, to: StringSchema, via: StringSchema.optional(), maxHops: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal('adjacent'), a: StringSchema, b: StringSchema }).strict(),
]);
```

### 4. Authored YAML union widening (`packages/engine/src/cnl/game-spec-doc.ts:799`)

Replace the closed string-valued union with the new shapes:

- `{ readonly notEqual: string }` — unchanged single-string shape.
- `{ readonly locatedIn: { readonly role: string; readonly container: string } }` — restructured to object. The previous single-string shape `{ readonly locatedIn: string }` is removed; no authored consumers exist.
- `{ readonly distinctOriginDestination: { readonly origin: string; readonly destination: string } }` — new.
- `{ readonly reachable: { readonly from: string; readonly to: string; readonly via?: string; readonly maxHops?: number } }` — new.
- `{ readonly adjacent: { readonly a: string; readonly b: string } }` — new.

### 5. Parser extension (`packages/engine/src/cnl/validate-agent-plan-templates.ts:114-124`)

Extend `parsePlanRoleConstraint` to recognize object-valued payloads and emit per-kind shape checks. Each branch:

- Returns `{ kind, refs }` where `refs` is the array of role refs this constraint references for the existing role-precedence check (currently only `ref: string`; widen the helper's return type to `refs: readonly string[]`).
- `notEqual` → refs = [normalized role].
- `locatedIn` → refs = [role]; emit a shape diagnostic if `container` is missing or not a string starting with `zone.` or `role.`.
- `distinctOriginDestination` → refs = [origin, destination]; require both as `role.*` strings.
- `reachable` → refs = [from, to]; require both as `role.*`; if `maxHops` present, require positive integer (diagnose otherwise); `via` is optional but if present must be a string starting with `routeClass.` (resolution to an authored route class is deferred to ticket 002).
- `adjacent` → refs = [a, b]; require both as `role.*`.

Update the existing single-`ref` consumer (the `referencedRole` precedence loop) to iterate over `refs` and emit a separate diagnostic per unbound referenced role.

### 6. Lowering extension (`packages/engine/src/cnl/compile-agent-plan-templates.ts:144-153`)

Add a per-kind branch in `lowerRoleConstraints` for each new variant. Each branch calls `normalizeRoleRef` for role-valued refs and `normalizeZoneRef`/`normalizeRouteClassRef` (introduce alongside `normalizeRoleRef` if not present) for zone and route-class refs. Output the typed payload matching the union shape from change 2.

### 7. Compile error fixtures and tests

Author architectural-invariant test files exercising the compiler error corpus (Foundation 16):

- An unsupported kind authored as `{ unknownKind: role.X }` → fails compile with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED` (existing behavior verified intact).
- Each new kind authored correctly compiles in a fixture template.
- `reachable` with `maxHops: 0` or `maxHops: -1` fails compile with a `maxHops must be a positive integer` diagnostic.
- `locatedIn` with `container` missing fails compile.
- A role referenced before binding (precedence violation, per the existing Spec 191 P1 mechanism) fails compile across each kind that references multiple roles (`distinctOriginDestination`, `reachable`, `adjacent`).

## Files to Touch

- `packages/engine/src/kernel/plan-role-constraints.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify) — at and around `:1216-1218`
- `packages/engine/src/kernel/schemas-core.ts` (modify) — at and around `:1436`
- `packages/engine/src/cnl/game-spec-doc.ts` (modify) — at and around `:799`
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify) — at and around `:76-124`
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify) — at and around `:144-153`
- `packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts` (new)
- `packages/engine/test/unit/cnl/plan-role-constraint-lowering.test.ts` (new)

## Out of Scope

- **Route-ref resolution validation** (does `routeClass.X` resolve against an authored `routeGraph`?) — deferred to ticket 002, which lands the `routeGraph` dataAsset and provider. This ticket's validator accepts `via: routeClass.X` strings as well-formed without checking that the route class exists.
- **`KNOWN_DATA_ASSET_KINDS` extension** for `routeGraph` — owned by ticket 002.
- **Runtime constraint evaluation** — owned by ticket 003. `constraintsSatisfied` is untouched here; it remains the existing `notEqual`-only shape until ticket 003 restructures it.
- **FITL profile migration** — owned by ticket 004. No `data/games/**` edits in this ticket.
- **Hidden-info zone observer-scope rejection** (spec §6 edge case) — deferred to ticket 002 alongside the other compile-time route-ref machinery; observer-scope metadata wiring is naturally adjacent to routeGraph parsing.
- **Branded-type uplift** for `RoleRef`/`ZoneRef`/`RouteClassRef` — explicitly out of scope per §4.1; refs remain `string`-typed.

## Acceptance Criteria

### Tests That Must Pass

1. Fixture plan template authoring each of `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent` (with at least one valid payload per kind) compiles without diagnostics — given a sibling `routeGraph` dataAsset fixture for the route-bearing kinds (ticket 002 provides the parser; this ticket's tests can stub the dataAsset to bypass the deferred route-ref check).
2. Unsupported kind authored as `{ unknownKind: role.X }` fails compile with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED`.
3. `reachable` with `maxHops: 0` fails compile with a `maxHops must be a positive integer` diagnostic.
4. `locatedIn` with `container` missing fails compile with a `locatedIn requires a container reference` diagnostic.
5. Role precedence violation across each new kind (e.g., `distinctOriginDestination` referencing a role not yet bound) fails compile with the existing precedence diagnostic.
6. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS`, `CompiledPlanRoleConstraint`, `CompiledPlanRoleConstraintSchema`, the YAML union in `game-spec-doc.ts`, `parsePlanRoleConstraint`, and `lowerRoleConstraints` enumerate the same five kinds. Adding a sixth kind in the future requires changes at every one of these sites — drift between them must remain a type or schema error, not a silent runtime fallback.
2. Compiled `CompiledPlanRoleConstraint` ref fields remain `string`-typed (Foundation 17 alignment per spec §9 — no branded uplift in this spec's scope).
3. Determinism: compiling the same `GameSpecDoc` with new-kind plan templates twice produces byte-identical `GameDef` (Foundation 8 + 16).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts` (new) — architectural-invariant test class. Covers acceptance criteria 1-5 above. Compile-error fixtures use the existing diagnostics framework.
2. `packages/engine/test/unit/cnl/plan-role-constraint-lowering.test.ts` (new) — architectural-invariant. Asserts the compiled-payload shape per kind matches the spec's restructured types; specifically that `locatedIn` lowers to `{ kind, role, container }` not `{ kind, role }`.

Both new files declare `// @test-class: architectural-invariant` per `.claude/rules/testing.md`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-validation.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-lowering.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
