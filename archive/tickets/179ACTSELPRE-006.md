# 179ACTSELPRE-006: (Optional) WASM-route alignment for `outcomeGrantContinuation`

**Status**: DEFERRED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-preview-drive.ts` (or equivalent WASM-route file).
**Deps**: `archive/tickets/179ACTSELPRE-003.md`, `archive/tickets/180STDVECOBSROL-001.md`

## Problem

Spec 179 Open Question §8.4 flags WASM-route alignment as an open question. Spec 176/178's WASM preview-drive currently fails closed on complex previews and falls back to TS. This ticket either (a) mirrors the `outcomeGrantContinuation` opt-in behavior in the WASM path, or (b) explicitly documents that the WASM path falls back to TS when the opt-in is set. Operator preference (path a vs. path b) is the user-facing decision this ticket resolves.

This ticket is **optional** per spec §10 — descope path documented in Out of Scope below. The default close condition is "documented fallback (path b)" if replacement Phase 2 witness data shows the WASM path is rarely active on opt-in profiles. Ticket 007 classified the original ARVN operation witness as the wrong contract surface for `outcomeGrantResolve`, so this optional WASM decision must not rely on the old operation witness.

## Assumption Reassessment (2026-05-17)

1. The WASM preview-drive route lives at `packages/engine/src/agents/policy-wasm-preview-drive.ts` (file path inferred from Spec 178's ticket archaeology; verify during `/implement-ticket` reassessment).
2. Spec 176/178 established the TS-fallback contract — WASM fails closed on complex previews. This ticket either extends the WASM path's behavior to include the new opt-in, or formalizes the existing TS fallback for opt-in cases.
3. Ticket 005's Phase 2 witness did not classify WASM active-route percentage; its TS-only probes showed the red activation gap is not WASM-only. Ticket 007 classified the activation gap as a witness contract mismatch. Ticket 008 then found no usable production FITL event/free-operation `outcomeGrantResolve` replacement witness. Ticket 009 selected Spec 180's standing-projection successor, so this optional WASM alignment decision should wait for `archive/tickets/180STDVECOBSROL-001.md` and later Spec 180 implementation tickets to define whether WASM participates in the replacement surface.

**Gate condition**: blocked until the Spec 180 successor defines whether the replacement ordinary-operation standing-projection route has a WASM path. If the future replacement witness still uses `outcomeGrantContinuation`, close this ticket via path (b) — documented TS fallback — if replacement Phase 2 witness data shows the WASM path was active on <10% of opt-in-profile decisions. If Spec 180's standing projection owns the runtime route instead, create or update the WASM alignment ticket under the Spec 180 namespace rather than forcing this optional Spec 179 ticket to implement a stale route.

## Architecture Check

1. **Foundation 14 (No Backwards Compatibility)**: either the WASM path supports the opt-in (no divergence between TS and WASM routes), or it explicitly documents the fallback (no silent divergence). The "silent fallback" case where WASM produces different traces than TS for the same profile is forbidden.
2. **Foundation 8 (Determinism)**: if both routes support the opt-in, replay determinism MUST hold across routes - same profile + same seed -> same trace regardless of TS-vs-WASM. If only TS supports the opt-in, the route selection itself must be deterministic and documented.
3. **No engine-agnostic boundary impact** - same as ticket 003.

## What to Change

### Path (a) - Mirror the opt-in in WASM

If chosen:
1. Extend WASM-side `driveSyntheticCompletion` analog with the same `outcomeGrantContinuation` logic as ticket 003's TS implementation.
2. Add a cross-route determinism test: same profile + same seed → byte-identical trace whether TS or WASM was the active route.
3. Update `reports/179-phase-2-post-opt-in-witness.md` after the Phase 2 witness contract is reset and rerun, including WASM-active-decision percentages.

### Path (b) - Document TS fallback

If chosen:
1. Add an explicit early-return in the WASM-route entry point: when the profile's compiled `AgentPreviewConfig.outcomeGrantContinuation?.enabled === true`, fall through to the TS path before WASM begins evaluation.
2. Emit a one-line advisory in the trace (or in the `previewUsage` block) noting "fallback: outcomeGrantContinuation not supported by WASM route".
3. Update `docs/agent-dsl-cookbook.md`'s opt-in documentation with: "Note: profiles opting into `outcomeGrantContinuation` always use the TS preview-drive route. WASM acceleration is disabled for opt-in decisions."

### Default selection rule

Choose path (b) unless replacement Phase 2 witness data shows WASM was active on >= 10% of opt-in-profile decisions. If WASM is rarely active anyway, path (b) is correct and cheaper. If WASM is materially active, path (a) prevents perf regression for opt-in profiles.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify - either path)

`Likely surface` (refine during `/implement-ticket` Phase 2 reassessment): the WASM-route entry point and any cross-route trace-shape consumers. Path-specific scope determined after reading ticket 005's witness data.

## Out of Scope

- **Descope path**: If replacement Phase 2 witness data shows WASM was active on <10% of opt-in decisions AND no operator preference for path (a) is expressed, close this ticket with "Declined - TS fallback documented in the cookbook addendum; explicit WASM early-return deferred until WASM-route activity exceeds 10% on opt-in profiles." Outcome: no code change; cookbook addendum carries the operator-facing contract.
- Tuning the 10% threshold - chosen for proportionality; future specs adjust.
- Adding new WASM capabilities beyond the opt-in mirror - out of scope for this ticket.

## Acceptance Criteria

### Tests That Must Pass

**Path (a)** — if chosen:
1. Cross-route determinism: same profile + same seed -> byte-identical trace whether TS or WASM was active.
2. WASM-route post-grant-continuation differentiation test (analog of ticket 003's `post-grant-continuation-differentiates.test.ts`).
3. Engine test suite green: `pnpm -F @ludoforge/engine test`.

**Path (b)** — if chosen:
1. Profile with `outcomeGrantContinuation.enabled = true` always routes through TS, never WASM — verified by trace inspection.
2. Trace advisory present when fallback fires.
3. Engine test suite green: `pnpm -F @ludoforge/engine test`.

**Descope path** — if chosen:
1. Ticket close with "Declined" rationale matches the descope condition above.
2. The cookbook addendum carries the WASM-route documentation.

### Invariants

1. Cross-route trace determinism MUST hold whether path (a) or path (b) lands - same profile + same seed -> same trace, regardless of which route was active. The route choice itself is deterministic (no ambient state).
2. If path (b) lands, route selection for opt-in profiles is explicitly documented in the cookbook, not implicit in code-path behavior.

## Test Plan

### New/Modified Tests

Path (a): `packages/engine/test/architecture/preview-post-grant/wasm-route-post-grant-determinism.test.ts` (new).

Path (b): `packages/engine/test/architecture/preview-post-grant/wasm-route-opt-in-fallback.test.ts` (new).

Descope: no new tests.

### Commands

1. Targeted (paths a or b): `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-post-grant/wasm-route-*.test.js`
2. Full engine: `pnpm -F @ludoforge/engine test`
3. Full turbo: `pnpm turbo test`
4. Lint + typecheck: `pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-18)

Status is deferred and archive-ready. This optional WASM-route alignment ticket was scoped to `outcomeGrantContinuation`, but Spec 180 completed the production ordinary-operation opponent-standing route without relying on that opt-in.

What landed:

- No code change landed under this optional ticket.
- Spec 179's TypeScript `outcomeGrantContinuation` substrate remains historical for synthetic or future production paths that actually publish `outcomeGrantResolve`.
- The live production FITL ordinary-operation goal moved to Spec 180 and is completed through `archive/tickets/180STDVECOBSROL-001.md` through `archive/tickets/180STDVECOBSROL-007.md`.

Why no WASM work remains active:

- Ticket 005's red witness and ticket 007's contract classification showed the original ARVN operation witness does not exercise `outcomeGrantResolve`.
- Ticket 008 found no usable production event/free-operation replacement witness.
- Ticket 009 selected Spec 180's standing-projection route, and that route completed the opponent-margin AI authoring goal without requiring a WASM implementation of this optional post-grant opt-in.

Verification:

- No source or test lanes were required for this no-code deferral.
- Archival integrity is covered by `pnpm run check:ticket-deps`.
