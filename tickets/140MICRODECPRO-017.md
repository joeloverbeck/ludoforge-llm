# 140MICRODECPRO-017: Retire staged `UNSUPPORTED_*_THIS_TICKET` microturn error surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — microturn publication/apply/advance runtime-contract error surfaces
**Deps**: `docs/FOUNDATIONS.md`, `archive/specs/140-microturn-native-decision-protocol.md`, `archive/tickets/140MICRODECPRO-005.md`, `archive/tickets/140MICRODECPRO-015.md`

## Problem

The shared microturn core still exposes staged developer-facing error strings from the original Spec-140 ticket wave:

- `UNSUPPORTED_CONTEXT_KIND_THIS_TICKET` remains in `packages/engine/src/kernel/microturn/publish.ts`
- `UNSUPPORTED_CONTEXT_KIND_THIS_TICKET` remains in `packages/engine/src/kernel/microturn/apply.ts`
- `UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET` remains in `packages/engine/src/kernel/microturn/advance.ts`

Those strings were truthful while the ticket series was still widening context coverage, but they are no longer architecturally appropriate now that the relevant contexts have landed. In the current code, the remaining throws mean one of three things:

1. an impossible internal microturn state was reached
2. the current publication/apply contract is still narrower than the microturn architecture claims
3. a bounded auto-resolve limit was exceeded

Using stale ticket-stage wording in shared runtime code obscures which of those cases actually happened and weakens the kernel's permanent contract surface.

## Assumption Reassessment (2026-04-22)

1. Live source grep confirms the staged strings still exist in `packages/engine/src/kernel/microturn/publish.ts`, `packages/engine/src/kernel/microturn/apply.ts`, and `packages/engine/src/kernel/microturn/advance.ts`.
2. Archived ticket `140MICRODECPRO-005` truthfully describes those names as temporary staging surfaces for partial-context coverage. That staging rationale is now stale for the current shared kernel boundary.
3. Archived ticket `140MICRODECPRO-015` replaced the old authority seam with `microturn/continuation.ts`, but it did not retire the leftover staged error vocabulary in the microturn core itself.
4. This is narrower than reopening the broader microturn authority or runtime-boundary tickets: the owned work here is shared error-surface cleanup plus any tiny direct fallout tests that pin the corrected contract.

## Architecture Check

1. This is a contract-cleanup ticket, not a behavior-expansion ticket. The clean boundary is to replace stale staged wording with permanent runtime-contract errors that describe the actual invariant violation or boundedness failure.
2. This preserves Foundations `#5`, `#10`, `#15`, and `#18` better than leaving historical ticket wording in the shared kernel. The microturn core should report permanent protocol invariants, not rollout-era staging language.
3. No backwards-compatibility aliasing is needed. The old staged names should be deleted rather than retained as synonyms.

## What to Change

### 1. Replace staged microturn error names with permanent contract surfaces

In the shared microturn kernel:

- remove `UNSUPPORTED_CONTEXT_KIND_THIS_TICKET`
- remove `UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET`
- replace each remaining throw site with the narrowest truthful permanent error message or runtime-contract surface

Expected classes include:

- impossible or corrupted decision-stack / context-state combinations
- unbridgeable publication/apply states that indicate a kernel constructibility bug
- bounded auto-resolve exhaustion that should be reported as a budget/invariant failure rather than a ticket-stage omission

### 2. Reassess each remaining throw site

For every current throw using the staged names, decide which of these is correct:

- keep as a permanent defensive invariant failure with corrected wording
- replace with a more specific runtime-contract error
- prove unreachable and delete the branch entirely

Do not merely rename constants without reassessing the branch semantics.

### 3. Pin the corrected surface with focused regression coverage

Add or update the narrowest tests needed to prove:

- shared microturn publication/apply no longer exposes stale ticket-stage wording
- any remaining defensive throws correspond to stable runtime-contract failures
- auto-resolve exhaustion, if still represented by a throw, uses truthful permanent wording

## Files to Touch

- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `packages/engine/src/kernel/microturn/apply.ts` (modify)
- `packages/engine/src/kernel/microturn/advance.ts` (modify)
- focused unit tests adjacent to the changed surfaces (modify or add)

## Out of Scope

- New context-kind support beyond the current live microturn contract
- Runtime cache/run-boundary ownership work in Spec 141
- Broader free-operation grant lifecycle redesign

## Acceptance Criteria

### Tests That Must Pass

1. `rg -n "UNSUPPORTED_CONTEXT_KIND_THIS_TICKET|UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET" packages/engine/src/kernel/microturn` returns zero hits.
2. `pnpm -F @ludoforge/engine build`
3. Focused microturn unit proof for the changed surface passes.
4. Existing suite: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js`

### Invariants

1. Shared microturn publication/apply/advance code no longer uses rollout-era staged error wording as part of its live contract surface.
2. Any remaining defensive throw in these seams describes a permanent runtime invariant or budget failure, not “this ticket” staging.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/microturn-publication.test.ts` — pin the corrected publication-side contract/error surface when proportionate.
2. Focused adjacent microturn apply/advance unit coverage — prove any retained defensive throw uses permanent invariant wording.

### Commands

1. `rg -n "UNSUPPORTED_CONTEXT_KIND_THIS_TICKET|UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET" packages/engine/src/kernel/microturn`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js`
