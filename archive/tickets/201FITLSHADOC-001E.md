# 201FITLSHADOC-001E: Active-card tag refs compile as booleans

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic agent policy compiler typing
**Deps**: `archive/tickets/201FITLSHADOC-001D.md`

## Problem

Ticket `201FITLSHADOC-002` needs the FITL shared lifecycle state feature `monsoonNow`:

```yaml
monsoonNow:
  type: boolean
  expr:
    ref: activeCard.hasTag.monsoon
```

Live FITL production compilation rejects this feature because `compile-agents.ts` currently types generic `activeCard.hasTag.*` surface refs as `number`. The runtime surface itself is boolean-like tag presence, and the authored ref name is explicitly `hasTag`; the compiler typing is the gap.

Changing `monsoonNow` to `number` would make the authored doctrine lie about the semantic type. Deferring the feature would leave the shared lifecycle scaffold incomplete. This prerequisite fixes the generic compiler contract before ticket 002 resumes as a data-only YAML change.

## Assumption Reassessment (2026-05-28)

1. `packages/engine/src/agents/policy-surface.ts` parses `activeCard.hasTag.<tag>` as the generic `activeCardTag` surface family.
2. `packages/engine/src/cnl/compile-agents.ts` currently assigns surface ref types by family and falls back to `number`; `activeCardTag` is not special-cased, so it compiles as `number`.
3. FITL production data compilation fails only on the new `monsoonNow` feature with `CNL_COMPILER_AGENT_POLICY_TYPE_INVALID`: type `boolean` versus compiled expression type `number`.
4. Existing observer and runtime surfaces already treat active-card tags as scalar visibility-controlled refs; this ticket changes compile-time policy value typing only, not FITL-specific runtime behavior.

## Architecture Check

1. Foundation #2: lifecycle state remains declarative GameSpecDoc YAML instead of being coerced into profile-specific numeric workaround data.
2. Foundation #12: the compiler statically validates the semantic type of `activeCard.hasTag.*` refs.
3. Foundation #15: this fixes the generic policy-surface typing gap exposed by Spec 201 instead of papering over it in FITL data.
4. Foundation #1 and #6: the change is game-agnostic and does not introduce FITL-specific schema or runtime branches.
5. Foundation #14: no compatibility alias or dual typing path is introduced.

## What to Change

### 1. Type active-card tag surface refs as booleans

Update the shared policy compiler surface type mapping so current and preview `activeCard.hasTag.*` refs compile as `boolean`.

### 2. Add focused compiler coverage

Add or extend focused compiler tests proving:

- a state feature over `activeCard.hasTag.<tag>` may declare `type: boolean`;
- a preview candidate feature over `preview.activeCard.hasTag.<tag>` may declare `type: boolean` and still requires explicit preview fallback when preview-derived.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — generic surface type mapping)
- Focused compiler test under `packages/engine/test/unit/` (modify/new)

## Out of Scope

- Authoring FITL `monsoonNow` or other Spec 201 features in `92-agents.md` (owned by ticket 002 after this prerequisite lands).
- FITL-specific compiler or runtime behavior.
- Observer visibility semantics for active-card tags.
- Numeric scoring conversions; consumers can still use `boolToNumber` where numeric scoring is required.

## Acceptance Criteria

### Tests That Must Pass

1. Current `activeCard.hasTag.*` refs compile as boolean policy expressions.
2. Preview `preview.activeCard.hasTag.*` refs compile as boolean policy expressions and retain Foundation #20 fallback enforcement.
3. FITL production compilation accepts `monsoonNow` once ticket 002 resumes.
4. `pnpm -F @ludoforge/engine build` passes.

### Invariants

1. No game-specific ids, tags, or FITL branches are introduced in engine code.
2. `activeCard.id` / `activeCard.deckId` remain id-typed, and `activeCard.metadata.*` remains unknown-typed.
3. Preview-derived candidate features still require explicit `previewFallback` when they reference preview active-card tags.

## Test Plan

### New/Modified Tests

1. Focused compiler test under `packages/engine/test/unit/` — proves current and preview active-card tag refs lower with boolean typing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled node test for the changed unit file
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js`
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-28)

Completed the generic active-card tag typing prerequisite for Spec 201:

1. Added shared compiler surface-type mapping so current and preview `activeCard.hasTag.*` refs compile as boolean policy expressions.
2. Preserved existing id typing for active-card identity/global markers and unknown typing for active-card metadata.
3. Added focused compiler coverage proving current and preview active-card tag refs lower as boolean refs.
4. Added focused coverage proving preview active-card tag candidate features still require explicit preview fallback.
5. Confirmed FITL production compilation accepts the pending `monsoonNow` YAML from ticket 002 once this generic prerequisite is present.

Source-size decision:

| path | before lines | after lines | crossed cap? | active growth | decision |
| --- | ---: | ---: | --- | ---: | --- |
| `packages/engine/src/cnl/compile-agents.ts` | 6104 | 6104 | no; preexisting oversize | 0 | Net-neutral helper extraction; no deferral needed. |
| `packages/engine/test/unit/cnl/active-card-tag-policy-typing.test.ts` | 0 | 118 | no | +118 | New focused test file under the repo cap. |
| `packages/engine/test/unit/compile-agents-authoring.test.ts` | 3308 | 3308 | no; preexisting oversize | 0 | Temporary local edits were moved into the focused test file; no retained growth. |

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/active-card-tag-policy-typing.test.js dist/test/unit/compile-agents-authoring.test.js` — passed, 58 tests.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js` — passed, 3 tests.
