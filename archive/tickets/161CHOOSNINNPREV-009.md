# 161CHOOSNINNPREV-009: chooseNStep inner-preview default-off invariant test

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes (test + snapshot fixture) — `packages/engine/test/determinism/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Spec 161 changes the dispatch at `policy-agent.ts:266` from an unconditional `createPolicyAgentChooseOneInnerPreview` call to a kind-dispatched ternary that adds a `chooseNStep` branch. The change is a strict no-op for profiles with `chooseNStep: false` (or omitted) — the new branch returns `undefined` via the chooseNStep adapter's kind+flag guards, mirroring today's chooseOne-adapter `undefined` return for chooseNStep microturns. This ticket pins the no-op-by-default property as an architectural invariant: profiles with `chooseNStep: false` produce byte-identical inner-microturn trace as the pre-Spec-161 baseline.

## Assumption Reassessment (2026-05-07)

1. Pre-Spec-161, the unconditional call returns `undefined` for chooseNStep microturns (chooseOne adapter's kind guard). Post-Spec-161 (Ticket 004), the kind-dispatched branch returns `undefined` for chooseNStep microturns when `chooseNStep !== true` on the profile. Same observable result.
2. Snapshot fixture format matches the determinism corpus precedent — committed alongside the test as a JSON or canonical-serialized blob.
3. Spec 160's `spec-160-inner-preview-no-op-default.test.ts` exists as a convention precedent.

## Architecture Check

1. F#8 — Determinism: a feature toggle that produces byte-identical traces when off is the strongest possible default-off guarantee. The test asserts this rather than assuming it.
2. F#14 — No backwards-compatibility shim is needed because the default-off path is genuinely identical, not a compatibility wrapper.
3. F#16 — Testing as Proof: byte-identity is proven, not assumed.

## What to Change

### 1. New determinism test `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts`

`architectural-invariant`. Asserts:

- A profile with `preview.inner.chooseNStep: false` (or omitted) produces canonical state and inner-microturn trace byte-identical to the committed pre-Spec-161 baseline snapshot.
- The committed baseline is captured from a representative chooseNStep-bearing scenario (constructed fixture or FITL canary).

### 2. Baseline snapshot fixture

Commit the baseline trace alongside the test (e.g., `spec-161-choosenstep-no-op-default.snapshot.json` in the same directory or `test/fixtures/`). The snapshot is captured by running the same scenario on a pre-Ticket-004 build (or by simulating the pre-Ticket-004 dispatch path) and serializing the canonical result.

If a feasible procedure for capturing the pre-state baseline is unavailable at implementation time, surface this via the 1-3-1 rule rather than skipping the deliverable.

## Files to Touch

- `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` (new — committed baseline) OR a fixture path under `packages/engine/test/fixtures/` per existing convention
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts` (test-helper fallout — adds an explicit omitted-flag fixture mode so the default-off test can prove the omitted `preview.inner.chooseNStep` case without duplicating the constructed chooseNStep fixture)

## Out of Scope

- Replay-identity (separate `same-input → same-output` invariant) — Ticket 008.
- Hidden-info, structural audit, FITL canary, key-parity — Tickets 007, 011, 010, 004.
- Any source-code changes — none required.

## Acceptance Criteria

### Tests That Must Pass

1. New: profile with `chooseNStep: false` produces byte-identical canonical state and inner trace as the baseline snapshot.
2. New: profile with `chooseNStep` omitted (default) likewise produces byte-identical state and trace.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.
4. Existing determinism suite: `pnpm -F @ludoforge/engine test:determinism`.

### Invariants

1. (architectural-invariant) Profiles with default `preview.inner.chooseNStep: false` produce byte-identical inner-microturn trace as pre-Spec-161 baseline. (F#8; Spec 161 acceptance #11.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` (new) — `architectural-invariant`. Default-off byte-identical guarantee.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-08. The owned test-only slice adds `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` and the committed baseline snapshot `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json`. The snapshot is the simulated pre-Ticket-004/default-off dispatch path permitted by this ticket: the existing Spec 161 constructed chooseNStep fixture with `preview.inner.chooseNStep: false`, which produces disabled inner-preview usage, zero evaluated candidates, no candidate preview drives, and the same canonical serialized final state.

Touched-file scope: the ticket-named determinism test and snapshot are added. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts` has a small test-helper extension for an explicit `omitted` profile mode so the test can separately assert the omitted-flag acceptance criterion while reusing the established Spec 161 fixture. No production source, schema artifact, generated schema, or runtime behavior change is owned by this ticket.

Command substitution ledger:

1. Test Plan command `pnpm -F @ludoforge/engine build && node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` — run as `pnpm -F @ludoforge/engine build` followed by repo-root `node --test packages/engine/dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js`.
2. Test Plan command `pnpm -F @ludoforge/engine test:determinism` — run directly.
3. Test Plan command `pnpm turbo typecheck` — run directly.
4. Test Plan command `pnpm turbo lint` — run directly.
5. Test Plan command `pnpm -F @ludoforge/engine test` — run directly.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test packages/engine/dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` — passed after the final build-producing lane; repo-root spelling of the ticket's focused `dist/...` command.
3. `pnpm -F @ludoforge/engine test:determinism` — passed, 22/22 files.
4. `pnpm turbo typecheck` — passed, 3/3 tasks.
5. `pnpm turbo lint` — passed, 2/2 tasks.
6. `pnpm -F @ludoforge/engine test` — passed, including `schema:artifacts:check` and 65/65 default-lane files.

Late-edit proof validity: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.

Ticket dependency integrity: `pnpm run check:ticket-deps` passed for 5 active tickets and 2275 archived tickets. No-invalidation: checker-result transcription only; no ticket graph, scope, acceptance, command, touched-file, follow-up, or dependency change.
