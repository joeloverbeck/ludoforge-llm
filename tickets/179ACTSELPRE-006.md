# 179ACTSELPRE-006: (Optional) WASM-route alignment for `outcomeGrantContinuation`

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-preview-drive.ts` (or equivalent WASM-route file).
**Deps**: `archive/tickets/179ACTSELPRE-003.md`

## Problem

Spec 179 Open Question §8.4 flags WASM-route alignment as an open question. Spec 176/178's WASM preview-drive currently fails closed on complex previews and falls back to TS. This ticket either (a) mirrors the `outcomeGrantContinuation` opt-in behavior in the WASM path, or (b) explicitly documents that the WASM path falls back to TS when the opt-in is set. Operator preference (path a vs. path b) is the user-facing decision this ticket resolves.

This ticket is **optional** per spec §10 — descope path documented in Out of Scope below. The default close condition is "documented fallback (path b)" if the repaired witness data from ticket 007 shows the WASM path is rarely active on opt-in profiles.

## Assumption Reassessment (2026-05-17)

1. The WASM preview-drive route lives at `packages/engine/src/agents/policy-wasm-preview-drive.ts` (file path inferred from Spec 178's ticket archaeology; verify during `/implement-ticket` reassessment).
2. Spec 176/178 established the TS-fallback contract — WASM fails closed on complex previews. This ticket either extends the WASM path's behavior to include the new opt-in, or formalizes the existing TS fallback for opt-in cases.
3. Ticket 005's Phase 2 witness did not classify WASM active-route percentage; its TS-only probes showed the red activation gap is not WASM-only. Ticket 007 now owns repairing the witness activation gap before this optional WASM alignment decision should use the Phase 2 data.

**Gate condition**: Close this ticket via path (b) — documented TS fallback — if the repaired Phase 2 witness from `tickets/179ACTSELPRE-007.md` shows the WASM path was active on <10% of opt-in-profile decisions. The cost of path (a) — actively mirroring the opt-in in WASM — exceeds the value when WASM is rarely the runtime.

## Architecture Check

1. **Foundation 14 (No Backwards Compatibility)**: either the WASM path supports the opt-in (no divergence between TS and WASM routes), or it explicitly documents the fallback (no silent divergence). The "silent fallback" case where WASM produces different traces than TS for the same profile is forbidden.
2. **Foundation 8 (Determinism)**: if both routes support the opt-in, replay determinism MUST hold across routes - same profile + same seed -> same trace regardless of TS-vs-WASM. If only TS supports the opt-in, the route selection itself must be deterministic and documented.
3. **No engine-agnostic boundary impact** - same as ticket 003.

## What to Change

### Path (a) - Mirror the opt-in in WASM

If chosen:
1. Extend WASM-side `driveSyntheticCompletion` analog with the same `outcomeGrantContinuation` logic as ticket 003's TS implementation.
2. Add a cross-route determinism test: same profile + same seed → byte-identical trace whether TS or WASM was the active route.
3. Update `reports/179-phase-2-post-opt-in-witness.md` after ticket 007 repairs the witness activation gap, including WASM-active-decision percentages.

### Path (b) - Document TS fallback

If chosen:
1. Add an explicit early-return in the WASM-route entry point: when the profile's compiled `AgentPreviewConfig.outcomeGrantContinuation?.enabled === true`, fall through to the TS path before WASM begins evaluation.
2. Emit a one-line advisory in the trace (or in the `previewUsage` block) noting "fallback: outcomeGrantContinuation not supported by WASM route".
3. Update `docs/agent-dsl-cookbook.md`'s opt-in documentation with: "Note: profiles opting into `outcomeGrantContinuation` always use the TS preview-drive route. WASM acceleration is disabled for opt-in decisions."

### Default selection rule

Choose path (b) unless ticket 007's repaired witness data shows WASM was active on >= 10% of `arvn-evolved` decisions. If WASM is rarely active anyway, path (b) is correct and cheaper. If WASM is materially active, path (a) prevents perf regression for opt-in profiles.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify - either path)

`Likely surface` (refine during `/implement-ticket` Phase 2 reassessment): the WASM-route entry point and any cross-route trace-shape consumers. Path-specific scope determined after reading ticket 005's witness data.

## Out of Scope

- **Descope path**: If the repaired ticket 007 witness shows WASM was active on <10% of opt-in decisions AND no operator preference for path (a) is expressed, close this ticket with "Declined - TS fallback documented in the cookbook addendum; explicit WASM early-return deferred until WASM-route activity exceeds 10% on opt-in profiles." Outcome: no code change; cookbook addendum carries the operator-facing contract.
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
