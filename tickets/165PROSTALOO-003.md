# 165PROSTALOO-003: Compiler lowering for `lookup.surface: previewOptionState` and surface-keyed fallback split

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl/compile-agents.ts`
**Deps**: `archive/tickets/165PROSTALOO-001.md`

## Problem

With ticket 165PROSTALOO-001 landing the surface union and the diagnostic code registrations, the compiler now needs to:

1. Lower author YAML that writes `lookup.surface: previewOptionState` into the compiled ref shape (Spec §5.1).
2. Reject unknown surface values via `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE` (Spec §5.1).
3. Promote a consideration's effective `costClass` to `'preview'` when its `value` contains a projected lookup, via the existing `maxCostClass` join lattice at `packages/engine/src/cnl/compile-agents.ts:3740-3748` (Spec §5.2).
4. Split the fallback-required check by surface (Spec §5.3): `lookup.surface: 'policyState'` requires `lookupFallback`; `lookup.surface: 'previewOptionState'` requires `previewFallback`. The existing helper `collectLookupRefIds` at `packages/engine/src/cnl/compile-agents.ts:3580-3618` is the refactor anchor — its ref-id encoding at line 3586 already includes `surface`, so the split is mechanical.
5. Emit `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK` when a projected lookup is missing the preview-fallback declaration (Spec §5.4).
6. Emit `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE` when a projected lookup's `key` expression transitively reads any preview-derived ref (Spec §4.4, §5.5) — implementation walks `key` with `collectPreviewOptionRefIds` and a new surface-keyed projected-lookup collector.

This ticket is compile-time only: it does not wire runtime routing (ticket 004) and does not widen deepening triggers (ticket 005). Compile-time tests are sufficient to prove the new diagnostics fire and the costClass join works.

## Assumption Reassessment (2026-05-11)

1. `packages/engine/src/cnl/compile-agents.ts:2095-2117` enforces the existing per-discriminant fallback rules (`previewOptionRefIds` and `lookupRefIds` collectors with reject-when-fallback-missing logic) — verified by inspection in Spec §2.3.
2. `collectLookupRefIds` at `compile-agents.ts:3580-3618` already encodes `surface` in the synthesized ref id at line 3586 (`lookup.${surface}.${collection}.${path.join('.')}`) — verified, so the by-surface split produces distinct ref ids automatically.
3. `maxCostClass` at `compile-agents.ts:3740-3748` defines the `state < candidate < preview` join lattice — verified, no change needed; merely ensure the `costClass` leaf for `lookup.surface: previewOptionState` is `'preview'` while `lookup.surface: 'policyState'` remains its existing class.
4. The author YAML format for the lookup ref is already defined in Spec §4.1 — `surface: previewOptionState` slots into the same parser path as `surface: policyState`.
5. Existing diagnostic `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED` is unchanged: a projected lookup that writes `onHidden: { kind: 'constant'; value }` is still rejected by the existing rule (Spec §4.7) — verified, no new code needed.
6. `collectPreviewOptionRefIds` already exists at `compile-agents.ts` (referenced in Spec §2.3 enforcement at line 2095) — its by-name signature collects any `previewOptionRef`. The new `projectedStateLookupRefIds` collector mirrors it but filters by `surface === 'previewOptionState'`. Or: parameterize the existing `collectLookupRefIds` with a surface filter — Spec §5.3 explicitly endorses either approach.
7. The new fixture for these tests can be authored inline in each test file or extracted to a small shared YAML snippet; existing Spec 163 compiler tests demonstrate the inline pattern. Decision: inline per test, mirroring existing convention.

## Architecture Check

1. **Mechanical refactor**: Spec §5.3 calls the surface split "mechanical" because `collectLookupRefIds`'s ref-id encoding already namespaces by `surface`. Splitting the collector by surface produces two disjoint sets of ref ids with no overlap — there is no risk of double-counting or missing a ref.
2. **State-source-keyed fallback contract**: Spec §4.6 establishes that the *proximate cause of unavailability* for a `previewOptionState` lookup is the preview drive, not the lookup itself. Aligning the fallback declaration with the proximate cause keeps the authoring contract intuitive — authors who already know `previewFallback` for `preview.option.*` refs do not learn a new namespace. Foundation #20 (Preview Signal Integrity) reinforced: any preview-derived unavailability flows through `previewFallback`.
3. **Compile-time validation of cyclic key dependencies** (Spec §4.4): the `key` evaluation rule says keys must be preview-free. Catching cyclic preview dependencies at compile time prevents an entire class of runtime cost-accounting surprises. Foundation #12 (Compiler-Kernel Validation Boundary): everything knowable from the spec alone is caught by the compiler.
4. **No game-specific branching** in the compiler — the lowering treats `previewOptionState` as a generic surface literal; all type-checking is via the existing zod schema (extended in ticket 001). Foundation #1 preserved.
5. **No backwards-compat shim**: the new diagnostic codes either fire or don't, no opt-in flag, no migration shim. Foundation #14.

## What to Change

### 1. Parse `lookup.surface: previewOptionState` and reject unknown surfaces

Locate the parser entry that lowers `lookup` ref expressions (the call site that today reads `surface: 'policyState'` from author YAML and emits the compiled ref). Update it to:

- Accept either `'policyState'` or `'previewOptionState'`.
- For any other value, emit `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE` with the offending value in the diagnostic message.

The compiled ref shape follows the union extension from ticket 001 — no additional fields on the projected variant; `keyType`, `key`, `path`, `onMissing`, `onHidden` remain unchanged.

### 2. Cost-class promotion

In the path that computes a leaf ref's `costClass`, ensure `lookup.surface: 'previewOptionState'` reports `'preview'` as its base cost. The existing `maxCostClass` join at line 3740-3748 escalates the consideration-level `costClass` to `'preview'` whenever any leaf is `'preview'`; this propagates upward via the existing chain at line 2121 with no new code.

Confirm via test (#7 below): an author writing `costClass: state` on a consideration whose `value` contains a projected lookup compiles with effective `costClass === 'preview'` — quiet escalation, no diagnostic.

### 3. Split fallback-required check by surface

Refactor `collectLookupRefIds` at `compile-agents.ts:3580-3618` into two callers (or one caller with a surface filter — either pattern is acceptable per Spec §5.3):

- `currentStateLookupRefIds` — refs with `surface: 'policyState'` → require `lookupFallback` (existing Spec 163 rule).
- `projectedStateLookupRefIds` — refs with `surface: 'previewOptionState'` → require `previewFallback` (new rule).

Update the enforcement block at `compile-agents.ts:2095-2117` to:

```pseudo
if (previewOptionRefIds.length + projectedStateLookupRefIds.length > 0 && previewFallback === undefined) {
  reject with CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK
  OR
  reject with CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK
  (decide which diagnostic per Spec §5.4 — when ONLY projected lookups trigger it, prefer the
   projected-lookup-specific code; when previewOptionRefs are also present, the existing code
   suffices. Implementer's call; document the chosen heuristic in the PR description.)
}
if (currentStateLookupRefIds.length > 0 && lookupFallback === undefined) {
  reject with the existing Spec 163 diagnostic
}
```

Update the diagnostic message at line 2101 to enumerate both projected-lookup refs and `preview.option.*` refs when reporting missing `previewFallback`, so authors see the full preview-derived unavailability surface.

### 4. New diagnostic — projected lookup requires preview fallback

`CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK` fires when a consideration's `value` contains at least one `lookup.surface: previewOptionState` ref AND `previewFallback` is omitted (even if `lookupFallback` is present). Suggestion text mirrors the existing `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` shape: name the projected lookup ref ids in the message.

### 5. New diagnostic — projected lookup key not preview-free

`CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE` fires when a projected lookup's `key` expression transitively reads any preview-derived ref. Implementation:

- Walk the `key` expression with `collectPreviewOptionRefIds` — if non-empty, emit.
- Walk the `key` expression with the new `projectedStateLookupRefIds` collector — if non-empty, emit (cyclic projected lookup).

The walker visits the full expression tree; the existing collectors already do this for the `value` expression and can be reused on the `key` sub-tree.

### 6. No new diagnostic for `costClass: state` written by author on projected-lookup consideration

Per Spec §5.6, the `maxCostClass` join silently escalates to `preview`. No diagnostic. Authors may write `costClass: preview` for clarity but are not required to.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — parser entry, fallback enforcement, ref-id collectors, three diagnostic emissions)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fallback-contract.test.ts` (new — Spec §8.1 #2)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-key-preview-free.test.ts` (new — Spec §8.1 #3)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-onhidden-no-override.test.ts` (new — Spec §8.1 #5)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-unknown-surface-rejected.test.ts` (new — Spec §8.2 #10)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-policystate-unchanged.test.ts` (new — Spec §8.2 #11)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-costclass-promotion.test.ts` (new — Spec §8.1 #7)

## Out of Scope

- Runtime routing (`resolveLookupRef` in `policy-evaluation-core.ts`) — ticket 165PROSTALOO-004.
- Continued-deepening trigger widening — ticket 165PROSTALOO-005.
- End-to-end fixture exercising every collection on the projected surface — ticket 165PROSTALOO-006.
- The Spec §8.1 #4 observer-visibility test, #6 gated-at-action-selection test, #1 ready-endpoint-only test, #8 collection-coverage test, #9 determinism test — those are runtime tests and attach to ticket 004.
- The Spec §8.3 deepening tests (#12, #13) — attach to ticket 005.
- The optional FITL ARVN profile-quality witness (Spec §8.5 #14).

## Acceptance Criteria

### Tests That Must Pass

1. **`projected-lookup-unknown-surface-rejected.test.ts`** — `surface: 'foo'` produces `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`.
2. **`projected-lookup-fallback-contract.test.ts`** — Three compilation attempts: (a) projected lookup with only `lookupFallback` declared → rejected with `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`; (b) projected lookup with only `previewFallback` → compiles; (c) mixed-surface composition (projected + current-state lookups in one `value`) with both `previewFallback` and `lookupFallback` → compiles. The diagnostic message names the projected lookup ref id.
3. **`projected-lookup-key-preview-free.test.ts`** — Three compilation attempts: (a) key reads `microturn.option.value` → compiles; (b) key reads a `preview.option.*` ref → rejected with `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`; (c) key reads another `lookup.surface: previewOptionState` → rejected with the same diagnostic.
4. **`projected-lookup-onhidden-no-override.test.ts`** — `onHidden: { kind: 'constant'; value: 0 }` on a projected lookup is rejected with the existing `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED` diagnostic — Spec 163's rule is not weakened.
5. **`projected-lookup-policystate-unchanged.test.ts`** — All Spec 163 round-trip tests pass byte-identically with the surface union extension and the by-surface collector split. (This is a smoke test that the split-by-surface refactor did not regress current-state lookups.)
6. **`projected-lookup-costclass-promotion.test.ts`** — An author writes `costClass: state` on a consideration whose `value` contains a projected lookup; the compiled consideration's effective `costClass === 'preview'` via the existing `maxCostClass` join. No diagnostic raised.
7. Full engine suite: `pnpm -F @ludoforge/engine test` green.
8. Build/typecheck/lint: `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` green.

### Invariants

1. **Surface-keyed fallback partition**: every consideration whose `value` contains at least one `lookup.surface: previewOptionState` ref MUST declare `previewFallback`; every consideration whose `value` contains at least one `lookup.surface: 'policyState'` ref MUST declare `lookupFallback`. A consideration whose `value` mixes both surfaces MUST declare both. Spec 163's existing rule for `surface: 'policyState'` is preserved byte-identically.
2. **Cyclic-key prevention**: no projected lookup's `key` may transitively read any preview-derived ref (either `previewOptionRef` or another projected lookup).
3. **Cost-class join honesty**: a consideration containing any projected lookup compiles with effective `costClass === 'preview'`.
4. **No game-specific compiler branches**: the new diagnostics and lowering steps treat `previewOptionState` as a generic surface literal, identical in shape to `policyState`. Foundation #1.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fallback-contract.test.ts` — Spec §8.1 #2: enforces state-source-keyed fallback partition.
2. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-key-preview-free.test.ts` — Spec §8.1 #3: enforces cyclic-key prevention.
3. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-onhidden-no-override.test.ts` — Spec §8.1 #5: preserves Spec 163's onHidden rule.
4. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-unknown-surface-rejected.test.ts` — Spec §8.2 #10: enforces surface literal whitelist.
5. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-policystate-unchanged.test.ts` — Spec §8.2 #11: parity smoke test for the split-by-surface refactor.
6. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-costclass-promotion.test.ts` — Spec §8.1 #7: confirms `maxCostClass` join.

### Commands

1. `node --test packages/engine/dist/test/architecture/lookup-refs-projected/*.test.js` — run the six new compiler tests after `pnpm turbo build`.
2. `pnpm -F @ludoforge/engine test` — full engine suite.
3. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` — gates.
4. `pnpm run check:ticket-deps` — Deps validation.
