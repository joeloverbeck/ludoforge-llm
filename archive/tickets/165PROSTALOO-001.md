# 165PROSTALOO-001: Extend `lookup.surface` union, export `LookupStateProvenance`, register new diagnostic codes

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `kernel/types-core.ts`, `kernel/schemas-core.ts`, `cnl/compiler-diagnostic-codes.ts`
**Deps**: `specs/165-projected-state-lookup-refs.md`

## Problem

Spec 165 §4.1 closes the empty matrix cell "bounded synthetic-completion endpoint, keyed per-object" by extending the existing `lookup` ref discriminant's `surface` union from `'policyState'` to `'policyState' | 'previewOptionState'`. Today the surface is fixed to `'policyState'` in both the compiled type (`packages/engine/src/kernel/types-core.ts:430-442`) and the zod schema (`packages/engine/src/kernel/schemas-core.ts:706`). Without the union extension, the downstream resolver refactor, compiler lowering, runtime routing, and continued-deepening work cannot compile against a real ref shape.

This ticket also exports the `LookupStateProvenance` discriminated union (Spec §4.2) so that later phases can attach `{ kind: 'currentState' }` vs `{ kind: 'previewOptionState'; depth; capClass; completionPolicy }` provenance to lookup resolutions for trace auditability (Foundation #9). And it registers the three new compile-time diagnostic codes that Phase 2 (ticket 165PROSTALOO-003) will emit:

- `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`
- `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`
- `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`

No behavioral change lands in this ticket — the new surface is type-reachable but not yet emitted by the compiler, not yet routed at runtime, and not yet exercised by the deepening triggers. Downstream tickets fill those in.

## Assumption Reassessment (2026-05-11)

1. `packages/engine/src/kernel/types-core.ts:430-442` defines `CompiledAgentPolicyRef`'s `lookup` discriminant with `surface: 'policyState'` only — verified by inspection.
2. `packages/engine/src/kernel/schemas-core.ts:706` mirrors the restriction via `surface: z.literal('policyState')` — verified.
3. `packages/engine/src/cnl/compiler-diagnostic-codes.ts` is the central diagnostic registry; existing codes like `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED` and `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` live there — verified by `grep`.
4. Spec dependencies (162, 163, 164, 158) are all archived/closed — verified by `ls archive/specs/`. No upstream ticket prerequisite remains; this ticket cites the spec file as its root reference.
5. `LookupStateProvenance` does not exist in the codebase today — its export site is `packages/engine/src/agents/policy-lookup-surface.ts` per Spec §4.2 (where the resolver refactor in ticket 002 consumes it). Spec is silent on whether it lives in `kernel/types-core.ts` (compiled-type adjacent) or `policy-lookup-surface.ts` (resolver adjacent). Decision: define and export it from `policy-lookup-surface.ts` since the resolver is the sole consumer; `types-core.ts` reserves space for *compiled artifact* types, not runtime resolver context types.

## Architecture Check

1. **Surface union extension is the minimum-surface-area change** — adding a literal to a union is the canonical TypeScript pattern for "another valid value of an existing kind"; no new ref discriminant, no parallel branch, no opt-in flag. Foundation #14 (No Backwards Compatibility): no `lookup_v2`, no shim layer; downstream code paths still handle `surface: 'policyState'` byte-identically.
2. **Generic boundary preserved**: the new `'previewOptionState'` literal carries no game-specific semantic — it points at a generic `GameState` (specifically `DriveResult.state`) walked by the same generic resolver. Foundations #1 (Engine Agnosticism) and #6 (Schema Ownership Stays Generic) are upheld.
3. **Diagnostic codes registered up-front** so that downstream tickets that emit them do not also have to land registry plumbing as a side effect, keeping their diffs focused.
4. **No alias paths or compatibility shims** — the existing `surface: 'policyState'` semantics are preserved unchanged; authors who wrote that today continue to work without modification.

## What to Change

### 1. Extend `CompiledAgentPolicyRef.lookup.surface` union

In `packages/engine/src/kernel/types-core.ts:430-442`, change:

```ts
readonly surface: 'policyState';
```

to:

```ts
readonly surface: 'policyState' | 'previewOptionState';
```

All other fields (`collection`, `keyType`, `key`, `path`, `onMissing`, `onHidden`) remain identical.

### 2. Mirror the union in the zod schema

In `packages/engine/src/kernel/schemas-core.ts:706`, change:

```ts
surface: z.literal('policyState'),
```

to:

```ts
surface: z.union([
  z.literal('policyState'),
  z.literal('previewOptionState'),
]),
```

### 3. Export `LookupStateProvenance` from `policy-lookup-surface.ts`

In `packages/engine/src/agents/policy-lookup-surface.ts` (near the existing `PolicyLookupResolutionContext` interface around line 21), add:

```ts
export type LookupStateProvenance =
  | { readonly kind: 'currentState' }
  | {
      readonly kind: 'previewOptionState';
      readonly depth: number;
      readonly capClass: string;
      readonly completionPolicy: PolicyPreviewDriveTrace['completionPolicy'];
    };
```

Import `PolicyPreviewDriveTrace` from the existing preview-trace types module (search the codebase for the canonical location — likely `packages/engine/src/agents/policy-preview-inner.ts` or a dedicated trace types file). No consumer wires up `LookupStateProvenance` in this ticket — ticket 165PROSTALOO-002 attaches it via `LookupStateSource`, ticket 004 attaches it at the routing call site.

### 4. Register three new diagnostic codes

In `packages/engine/src/cnl/compiler-diagnostic-codes.ts`, append (alphabetized within the existing pattern) the three codes:

- `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE` — fires when a `lookup` ref's `surface` value is not `'policyState'` or `'previewOptionState'`.
- `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK` — fires when a consideration's `value` contains a `lookup.surface: previewOptionState` ref AND `previewFallback` is omitted (even if `lookupFallback` is present).
- `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE` — fires when a projected lookup's `key` expression transitively reads any preview-derived ref.

Code constants only; emission lives in ticket 003. Message strings/suggestion strings follow the existing diagnostic naming/shape conventions of neighboring entries.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — extend surface union)
- `packages/engine/src/kernel/schemas-core.ts` (modify — extend zod schema)
- `packages/engine/src/agents/policy-lookup-surface.ts` (modify — export `LookupStateProvenance`)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — register three new codes)

## Out of Scope

- The resolver refactor that consumes `LookupStateProvenance` (ticket 165PROSTALOO-002).
- Compiler-side emission of `surface: 'previewOptionState'` from author YAML and the new diagnostics' firing logic (ticket 165PROSTALOO-003).
- Runtime routing in `resolveLookupRef` (ticket 165PROSTALOO-004).
- Continued-deepening trigger widening (ticket 165PROSTALOO-005).
- Cookbook recipe and fixture (ticket 165PROSTALOO-006).
- Any change to `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` — Spec §3 and §10 explicitly state the scalar preview ref enum is UNCHANGED.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — TypeScript compilation succeeds across all packages with the new surface literal and the exported `LookupStateProvenance`.
2. `pnpm turbo typecheck` — strict-mode typecheck across the workspace.
3. `pnpm -F @ludoforge/engine test` — full engine test suite passes; Spec 163's existing `lookup` ref tests continue to pass byte-identically (no behavioral drift from the union extension alone).
4. Spot-check: importing `LookupStateProvenance` from `packages/engine/src/agents/policy-lookup-surface.ts` in a sibling module typechecks.

### Invariants

1. The compiled `CompiledAgentPolicyRef` `lookup` discriminant's `surface` field accepts exactly two string literals — `'policyState'` and `'previewOptionState'` — at the type level and at the zod validation layer. Other strings are rejected by zod (today, before ticket 003's compiler diagnostic catches them earlier).
2. The diagnostic code registry contains the three new entries; no production code path emits them yet (ticket 003 wires emission).
3. No behavioral change: every Spec 163 invariant for `surface: 'policyState'` lookups holds byte-identically.

## Test Plan

### New/Modified Tests

This ticket carries no new behavioral tests — the surface extension and code registration are infrastructure for downstream tickets. Verification is via the existing engine suite continuing to pass plus typecheck/build.

### Commands

1. `pnpm turbo build` — full build.
2. `pnpm turbo typecheck` — strict typecheck.
3. `pnpm turbo lint` — lint pass.
4. `pnpm -F @ludoforge/engine test` — engine test suite (architectural invariants, Spec 163 lookup-refs tests).
5. `pnpm run check:ticket-deps` — verify this ticket's Deps path resolves.

## Outcome

**Completion date**: 2026-05-11

Outcome amended: 2026-05-11 — post-completion archived-ticket outcome normalization and dependency-integrity marker repair.

**Status target**: COMPLETED after final verification.

**What landed**:
- Extended `CompiledAgentPolicyRef` lookup refs to accept exactly `surface: 'policyState' | 'previewOptionState'`.
- Mirrored the same two-literal union in `CompiledAgentPolicyRefSchema`.
- Exported `LookupStateProvenance` from `packages/engine/src/agents/policy-lookup-surface.ts`, using `PolicyPreviewDriveTrace['completionPolicy']` from the kernel trace types as the canonical completion-policy type.
- Registered `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`, `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`, and `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE` as diagnostic-code constants only. Emission is owned by `archive/tickets/165PROSTALOO-003.md`.

**Owned generated/artifact fallout**:
- `packages/engine/schemas/GameDef.schema.json` is expected owned fallout because `packages/engine/src/kernel/schemas-core.ts` changed the compiled `lookup` ref schema.
- `packages/engine/schemas/Trace.schema.json` and `packages/engine/schemas/EvalReport.schema.json` were regenerated by the same command and remained byte-identical.

**Ticket/spec corrections applied**:
- `specs/165-projected-state-lookup-refs.md` now records `LookupStateProvenance` as resolver-adjacent in `policy-lookup-surface.ts`, matching Spec §4.2 and this ticket.
- The spec's follow-on ticket list now uses the live `165PROSTALOO-*` ticket ids rather than the placeholder `165PROJLOOKUP-*` namespace.

**Deferred sibling/spec scope**:
- `archive/tickets/165PROSTALOO-002.md` owns `LookupStateSource` and `resolveLookupAgainstState`.
- `archive/tickets/165PROSTALOO-003.md` owns compiler lowering and diagnostic emission.
- `archive/tickets/165PROSTALOO-004.md` owns runtime routing.
- `tickets/165PROSTALOO-005.md` owns continued-deepening trigger widening.
- `tickets/165PROSTALOO-006.md` owns the cookbook and end-to-end fixture.

**Touched-file scope**:
- Ticket-named source files modified: `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/src/agents/policy-lookup-surface.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`.
- Additional owned fallout: `packages/engine/schemas/GameDef.schema.json`, `specs/165-projected-state-lookup-refs.md`.

**File-size ledger**:
- `packages/engine/src/kernel/types-core.ts`: 2185 -> 2185 lines; preexisting canonical contract hub over guidance; active growth is one literal in an existing union. Extraction would widen the ticket seam. Residual owner: none.
- `packages/engine/src/kernel/schemas-core.ts`: 2600 -> 2603 lines; preexisting canonical schema hub over guidance; active growth is one existing schema mirror union. Extraction would widen the ticket seam. Residual owner: none.
- `packages/engine/src/agents/policy-lookup-surface.ts`: 347 -> 357 lines; resolver-adjacent provenance export remains in the existing lookup surface module. Residual owner: `archive/tickets/165PROSTALOO-002.md`.
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts`: 369 -> 372 lines; central diagnostic-code registry remains the canonical owner for compiler diagnostic constants. Residual owner: `archive/tickets/165PROSTALOO-003.md`.

**Post-review cleanup**:
- Normalized the completion notes to the archive-required `## Outcome` section and made the source-size ledger exact. Markdown-only; no source, schema, test, fixture, or generated artifact was changed.

**Command ledger before terminal status**:
- `pnpm -F @ludoforge/engine build` — intermediate package build, green before schema regeneration.
- `pnpm -F @ludoforge/engine run schema:artifacts` — regenerated schema artifacts; only `GameDef.schema.json` persisted as a diff.
- `pnpm turbo build` — final acceptance lane, green.
- `pnpm turbo typecheck` — final acceptance lane, green.
- `pnpm turbo lint` — final acceptance lane, green.
- `pnpm -F @ludoforge/engine test` — final acceptance lane, green; includes `schema:artifacts:check` and default engine tests.
- `pnpm run check:ticket-deps` — ticket graph/status integrity lane, green for 6 active tickets and 2296 archived tickets.

**Late-edit proof validity**:
- No-invalidation: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.
