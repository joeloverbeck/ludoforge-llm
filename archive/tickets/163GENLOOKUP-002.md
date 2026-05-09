# 163GENLOOKUP-002: Compiler lowering for `lookup` ref + compile-time diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl/compile-agents.ts` (lowering for the new `value.lookup` shape and the new `lookupFallback` shape)
**Deps**: `archive/tickets/163GENLOOKUP-001.md`

## Problem

With the static type surface from ticket 001 in place, the compiler must lower YAML `value: { lookup: ... }` blocks into `CompiledAgentLookupRef`, parse the parallel `lookupFallback` field on considerations, and emit two compile-time diagnostics that enforce Foundation #20 (required fallback) and Foundation #4 (no override of `onHidden`). Profile authors get cleaner compile-time feedback than runtime errors.

## Assumption Reassessment (2026-05-09)

1. `previewFallback` is lowered by `lowerPreviewFallback` at `compile-agents.ts:1850-1877`; its shape validation lives at `:3056-3085` — confirmed during reassessment.
2. The required-fallback diagnostic for previews is emitted at `compile-agents.ts:1857-1865` when `previewOptionRefIds.length > 0 && previewFallback === undefined` — confirmed.
3. The compiled consideration is constructed at `:1869-1880` and includes `hasPreviewRef: previewOptionRefIds.length > 0` at `:1875` plus the conditional spread `...(previewFallback === undefined ? {} : { previewFallback })` at `:1877` — confirmed.
4. `microturn.option.value` is the canonical key ref for chooseN target options; it lowers via the existing `microturnOptionIntrinsic` ref kind in `agents/policy-expr.ts:901`.
5. No `microturn-option-type catalog` exists in `packages/engine/src/`; the static-keyType-check path is intentionally NOT implemented (Spec 163 §5 step 2, dropped during reassessment).

## Architecture Check

1. **Foundation #20 (Preview Signal Integrity)**: extending the integrity contract to the lookup family. Just as Spec 162 mandates `previewFallback`, this ticket mandates `lookupFallback` for any consideration whose value AST contains a lookup ref. Unavailable lookups never silently coerce to numeric contributions.
2. **Foundation #4 (Authoritative State and Observer Views)**: the `onHidden` override-rejection diagnostic enforces at compile time the invariant that hidden state cannot be coerced to a public value via authoring sleight-of-hand. Profile authors cannot circumvent observer routing.
3. **Foundation #12 (Compiler-Kernel Validation Boundary)**: both diagnostics catch authoring bugs at compile time — the kernel never sees malformed lookup refs.
4. **No game-specific branching**: lowering is purely structural — `surface`, `collection`, `keyType`, `key`, `path`, `onMissing`, `onHidden` validation operates over the abstract DSL grammar.

## What to Change

### 1. `lowerLookupValue` parser

New helper alongside the existing preview lowering. Accept a YAML node of shape `{ lookup: { surface, collection, keyType, key, path, onMissing, onHidden? } }`. Validate:

- `surface` MUST be the literal `'policyState'` (only allowed value; future surfaces are out of scope).
- `collection` MUST be one of `zones | tokens | players | globals`.
- `keyType` MUST be one of `ZoneId | TokenId | PlayerId | string`. (No `GlobalVarId`.)
- `key` MUST be a compileable policy expression (delegate to existing expression lowering).
- `path` MUST be a non-empty array of strings.
- `onMissing` MUST be `'unavailable'` or `{ kind: 'constant', value }` literal (number/string/boolean).
- `onHidden` MUST be absent or the literal `'unavailable'`. Anything else emits `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED` (path: `<consideration-path>.value.lookup.onHidden`).

Returns a `CompiledAgentLookupRef` or `null` (with diagnostics pushed).

### 2. `lowerLookupFallback` parser

Mirror `lowerPreviewFallback` (`compile-agents.ts:1850-1877`). Accept `{ onUnavailable: 'noContribution' | { constant: N } }`. Validate shape (mirror `:3056-3085` for `previewFallback` shape validation). Returns an `AgentLookupFallback` or `null`.

### 3. Required-fallback diagnostic

After lowering the consideration's `value`, walk the resulting AST to detect lookup refs. If any are present AND `lookupFallback` is undefined, emit:

```ts
{
  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK,
  path: `${path}.lookupFallback`,
  severity: 'error',
  message: `Consideration "${considerationId}" references a lookup ref but does not declare lookupFallback.onUnavailable.`,
  suggestion: 'Add either lookupFallback: { onUnavailable: noContribution } or lookupFallback: { onUnavailable: { constant: 0 } }.',
}
```

Mirror the structure at `:1857-1865`.

### 4. Compiled consideration shape construction

Extend the compiled consideration build at `:1869-1880`:

- Add `hasLookupRef: lookupRefIds.length > 0` (parallel to `hasPreviewRef` at `:1875`).
- Add `...(lookupFallback === undefined ? {} : { lookupFallback })` (parallel to the `previewFallback` spread at `:1877`).

### 5. Helper: `collectLookupRefIds`

Mirror the existing `collectPreviewOptionRefIds` helper used at `:1856`. Walk the value AST and return all lookup-ref identifiers (or a count) for the required-fallback check.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — add `lowerLookupValue`, `lowerLookupFallback`, `collectLookupRefIds`; emit two diagnostics; extend compiled consideration shape)
- `packages/engine/test/architecture/lookup-refs/lookupfallback-required-diagnostic.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-hidden-override-rejected.test.ts` (new)

## Out of Scope

- **No runtime resolver** — `policy-lookup-surface.ts` lands in ticket 003.
- **No dispatch wiring** — `case 'lookup':` in the resolver switch is in ticket 003.
- **No consideration-level fallback consumption** — the `evaluateConsideration` branch lands in ticket 004.
- **No static `keyType` mismatch diagnostic** — dropped during spec reassessment (no microturn-option-type catalog exists). Runtime `typeMismatch` is the sole enforcement path (ticket 003).
- **No fixture migration** — no existing fixtures use lookup refs (Spec 163 §8.3).

## Acceptance Criteria

### Tests That Must Pass

1. `lookupfallback-required-diagnostic.test.ts` — authoring a consideration whose `value` is a lookup ref without `lookupFallback` produces `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK`. Authoring with `lookupFallback: { onUnavailable: noContribution }` compiles cleanly. Authoring with both `lookupFallback` and legacy `unknownAs` compiles (the runtime branch in ticket 004 ignores `unknownAs` for lookup refs).
2. `lookup-hidden-override-rejected.test.ts` — authoring `onHidden: { constant: 0 }` (or any non-`'unavailable'` value) produces `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`.
3. Existing compiler tests pass unchanged: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. A consideration with a lookup ref AND no `lookupFallback` MUST fail compilation with `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` — never compile silently.
2. An `onHidden` override (anything other than the literal `'unavailable'`) MUST fail compilation — never compile to a runtime override.
3. The compiled consideration shape MUST surface `hasLookupRef: boolean` exactly when the value AST contains at least one lookup ref. This flag drives the runtime fallback dispatch in ticket 004.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs/lookupfallback-required-diagnostic.test.ts` — `// @test-class: architectural-invariant` — covers the required-fallback contract for the lookup family.
2. `packages/engine/test/architecture/lookup-refs/lookup-hidden-override-rejected.test.ts` — `// @test-class: architectural-invariant` — covers Foundation #4 enforcement at compile time.

Both test files mirror the structure of `packages/engine/test/architecture/preview-integrity/previewfallback-required-diagnostic.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/lookup-refs/lookupfallback-required-diagnostic.test.js dist/test/architecture/lookup-refs/lookup-hidden-override-rejected.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed 2026-05-09.

- Landed compiler lowering for authored `value: { lookup: ... }` expressions into `CompiledAgentLookupRef`.
- Landed `lookupFallback` parsing with `onUnavailable: noContribution` and exact integer constant fallback support.
- Landed compile-time enforcement for:
  - missing `lookupFallback` on lookup-valued considerations via `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK`;
  - rejected `onHidden` overrides via `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`.
- Landed `hasLookupRef` propagation on lowered compiled considerations so ticket 004 can distinguish lookup-valued considerations from non-lookup values.
- Added the two ticket-named architecture tests under `packages/engine/test/architecture/lookup-refs/`.
- Additional owned fallout beyond the original `Files to Touch`: `game-spec-doc.ts` gained authored `lookupFallback` typing; `policy-expr.ts` gained the delegated `lookup` expression hook; `lower-agent-considerations.ts`, `types-core.ts`, `schemas-core.ts`, `GameDef.schema.json`, and exact-shape unit/schema tests were updated for the new compiled `hasLookupRef` field.
- Generated fallout: `packages/engine/schemas/GameDef.schema.json` changed to require `hasLookupRef` beside `hasPreviewRef`; `Trace.schema.json` and `EvalReport.schema.json` were regenerated byte-identical by `pnpm turbo schema:artifacts`.
- Source-size ledger: `compile-agents.ts`, `policy-expr.ts`, and `game-spec-doc.ts` are preexisting oversized shared compiler/contract files. The active growth is a surgical staged compiler-lowering addition; a larger extraction would obscure the current ticket seam, so no separate extraction owner is created.
- Deferred sibling scope remains unchanged: 003 owns runtime resolver/observer routing; 004 owns lookup fallback consumption and trace; 005 owns cookbook and canonical fixture profile.
- Final proof:
  - `pnpm -F @ludoforge/engine build` — passed
  - `node --test packages/engine/dist/test/architecture/lookup-refs/lookupfallback-required-diagnostic.test.js packages/engine/dist/test/architecture/lookup-refs/lookup-hidden-override-rejected.test.js` — passed
  - `pnpm turbo schema:artifacts` — passed
  - `pnpm -F @ludoforge/engine test:unit` — passed
  - `pnpm turbo build` — passed
  - `pnpm turbo test` — passed
  - `pnpm turbo lint` — passed
  - `pnpm turbo typecheck` — passed
  - final post-`typecheck` focused lookup test rerun — passed
  - `pnpm run check:ticket-deps` — passed
- No-invalidation: terminal status/proof/touched-file transcription only; no scope, acceptance, command, follow-up, or dependency change after the final proof lanes.
