# 161CHOOSNINNPREV-007: Hidden-info propagation test at chooseNStep continuation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes (test only) — `packages/engine/test/unit/agents/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Spec 161 claims hidden-info routing parity with the chooseOne path: per-root-option ref resolution flows through the same `resolveRefs` / `policy-surface.ts` plumbing, and `unknownHidden` propagates to `preview.option.*` refs and `outcomeBreakdown.unknownHidden` increments accordingly. The reassessment confirmed structurally that `runChooseNStepBeamPreview`'s `resolveBeamResult` calls into the same `resolveRefs` chain that `runChooseOneInnerPreview` uses. This ticket adds the architectural-invariant test that pins the property — preventing future refactors from quietly bypassing observer-projected resolution at chooseNStep continuation.

## Assumption Reassessment (2026-05-07)

1. `runChooseNStepBeamPreview` resolves refs via `resolveBeamResult` (now in `policy-preview-inner-choosenstep.ts` post Ticket 001), which calls the shared `resolveRefs` helper still hosted in `policy-preview-inner.ts`. `resolveRefs` consults `policy-surface.ts` for visibility and emits `hidden` for refs whose underlying observer-projected resolver returns hidden.
2. The chooseOne hidden-info test in Spec 160 lives at `packages/engine/test/unit/agents/policy-preview-inner-fitl-hidden-info.test.ts` (or similar; verify path during implementation) and serves as the modeling precedent for the chooseNStep variant.
3. Ticket 004 has wired the chooseNStep dispatch and the chooseN microturn evaluator now receives populated `previewOptionResolvedRefsByOptionKey`.

## Architecture Check

1. F#4 — Authoritative State and Observer Views: `preview.option.*` refs MUST honor hidden-information policy. The test pins this property.
2. F#16 — Testing as Proof: hidden-info routing is an architectural invariant; not a property to assume.
3. Engine-agnostic — test uses constructed fixtures with no game-specific identifiers. F#1 honored.

## What to Change

### 1. New unit test `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts`

`architectural-invariant`. Constructed fixture:

- Profile with `preview.inner.chooseNStep: true` and a microturn-scope consideration referencing `preview.option.victory.currentMargin.self` (or analogous hidden-resolvable ref).
- A chooseNStep microturn whose continuation beam evaluates a state branch where the underlying observer-projected resolver returns hidden for the `victory.currentMargin.self` ref.

Asserts:

- The per-root-option `resolvedRefs` for that ADD omits the hidden concrete `preview.option.victory.currentMargin.self` value and reports `preview.option.outcome: hidden`.
- `outcomeBreakdown.unknownHidden` increments for the affected drive.
- `outcome` propagates as `hidden` for the affected per-root-option result.
- A separate ADD whose continuation does NOT trigger hidden resolution returns a concrete numeric ref value with `outcome: 'ready'` — proving the routing is per-option, not whole-microturn.

## Files to Touch

- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Any source-code changes — the routing is already correct (verified during reassessment); this ticket only adds the test.
- chooseOne hidden-info coverage — already exists from Spec 160.

## Acceptance Criteria

### Tests That Must Pass

1. New: hidden-resolved per-option ref reports `outcome: hidden`, omits the hidden concrete ref value, and increments `outcomeBreakdown.unknownHidden`.
2. New: per-option resolution is independent — non-hidden ADDs in the same microturn return concrete refs.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) `preview.option.*` refs propagate `outcome: hidden` and increment `outcomeBreakdown.unknownHidden` whenever the underlying observer-projected resolver returns hidden, at chooseNStep continuation states. (Spec 161 acceptance #12; F#4.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new) — `architectural-invariant`. F#4 hidden-info enforcement at chooseNStep continuation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-08. Landed slice:

Outcome amended: 2026-05-08 — post-review archive closeout refreshed the ticket graph integrity result after moving this ticket to `archive/tickets/`.

- Added `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` as the ticket-owned `architectural-invariant`.
- The constructed chooseNStep fixture uses two legal ADDs: `safe` resolves `preview.option.victory.currentMargin.self` to the concrete numeric value `1` with `outcome: ready`; `secret` creates a token in a hidden zone, enters hidden-sampling mode for that continuation branch, omits the hidden margin ref, and reports `outcome: hidden`.
- `outcomeBreakdown` is asserted per option: `ready: 1` and `unknownHidden: 1`, proving hidden-info propagation is per-root-option rather than whole-microturn.

Semantic corrections:

- The per-option hidden-vs-ready witness uses the live observer hidden-sampling guard (`preview.visibility: public` with `allowWhenHiddenSampling: false`) rather than static `preview.visibility: hidden`; static hidden visibility would hide every option and would not prove the ticket's independent non-hidden ADD requirement.
- The live `resolveRefs` contract, matching the existing chooseOne hidden-info precedent, represents a hidden concrete ref by omitting the concrete ref value while setting `preview.option.outcome` to `hidden` and incrementing `outcomeBreakdown.unknownHidden`; it does not store an `unknownHidden` sentinel as the ref value.

Generated fallout: transient `packages/engine/dist/` only; no schema, golden, or compiled JSON artifact is owned.

Deferred sibling scope: replay/no-op, FITL canary, structural audit, cookbook, manual validation, and other Spec 161 residuals remain with Tickets 008-013.

File-size sweep: the new test is 248 lines, inside the repo's normal 200-400 line band.

Runtime surface breadth: test-only policy/agent preview invariant; no production source, kernel, schema, or package-public surface changed.

Command ledger:

- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.js | split into serial package build plus repo-root focused compiled test | build passed; focused compiled test passed after final emitted-output rerun`
- `Test Plan | pnpm turbo typecheck | run literally | passed`
- `Test Plan | pnpm turbo lint | run literally | passed`
- `Test Plan | pnpm -F @ludoforge/engine test | run literally | passed; default lane summary 65/65 files passed`

Output sequencing: final proof ran build before the focused compiled test. `pnpm turbo typecheck` rebuilt `packages/engine/dist/`, and `pnpm -F @ludoforge/engine test` consumed that refreshed output; the focused compiled hidden-info test was rerun afterward against the final emitted output.

Late-edit proof validity: after final proof started, terminal status plus exact proof transcription was applied. The final closeout sweep then corrected stale ticket wording about the hidden ref representation from an `unknownHidden` ref-value sentinel to the live omitted-value plus `outcome: hidden` contract; the focused compiled hidden-info test was rerun after that correction.

Post-review correction: removed the earlier terminal no-invalidation classification because the late acceptance wording correction was proof-affecting; the focused compiled hidden-info test rerun above is the proof-validity record for that correction.

Ticket graph integrity: `pnpm run check:ticket-deps` passed for 6 active tickets and 2274 archived tickets after archival.
