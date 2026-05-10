# 164CONTPREVDEP-003: Strategy dispatch wiring with singlePass byte-identical baseline

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent-inner-preview.ts` (strategy dispatch insertion)
**Deps**: `archive/tickets/164CONTPREVDEP-002.md`

## Problem

After Ticket 002, the compiled config carries a `strategy` field, but the runtime ignores it: `runChooseNStepInnerPreview` is invoked unconditionally regardless of `strategy`. This ticket adds the strategy-dispatch seam inside `createPolicyAgentChooseNStepInnerPreview` so that `continuedDeepening` profiles take a separately-named code path even before the deep driver lands. The branch is a fallthrough-to-broad no-op for now (deep driver is Ticket 004); the value of this ticket is establishing the dispatch contract and proving that `singlePass` profiles still produce byte-identical traces.

This is Phase 2 of the spec (§9 acceptance criterion: "`singlePass` profiles produce byte-identical traces before and after this phase; `continuedDeepening` profiles fall through to the broad-only path when triggers do not fire").

## Assumption Reassessment (2026-05-09)

1. `createPolicyAgentChooseNStepInnerPreview` lives at `packages/engine/src/agents/policy-agent-inner-preview.ts:222-256` (verified). The single call site to `runChooseNStepInnerPreview` is at line 235.
2. `chooseFrontierDecision` (`policy-agent.ts:543`) calls `createPolicyAgentChooseNStepInnerPreview` from the dispatch conditional at lines 547-551. Inserting the strategy branch one level deeper (inside the creator function) keeps `chooseFrontierDecision`'s shape unchanged.
3. `resolvedProfile.profile.preview.inner?.strategy` is the access path after Ticket 002 lands; live reassessment on 2026-05-10 confirms the Ticket 002 field now exists.

## Architecture Check

1. **Encapsulation at the right level**: Strategy dispatch belongs inside `createPolicyAgentChooseNStepInnerPreview` because that function owns the single `runChooseNStepInnerPreview` invocation. Lifting the dispatch up to `chooseFrontierDecision` would expose strategy machinery to a function that does not own preview execution.
2. **Byte-identical singlePass guarantee (F#14)**: The `singlePass` branch is the unmodified existing code path. The `continuedDeepening` branch in this ticket is a no-op fallthrough — it returns the broad-only result. Replay tests prove byte-identity.
3. **No premature deep-pass coupling**: This ticket does NOT introduce `policy-preview-inner-deepening.ts` or any deep-pass logic. It establishes only the seam, so Ticket 004 plugs in cleanly without re-touching this dispatch.

## What to Change

### 1. Insert strategy dispatch inside `createPolicyAgentChooseNStepInnerPreview`

In `packages/engine/src/agents/policy-agent-inner-preview.ts:222-256`, branch on `resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass'` after the broad-pass `runChooseNStepInnerPreview` call (line 235). For now both branches return the same `run`:

```ts
const run = runChooseNStepInnerPreview({ /* unchanged */ });

const strategy = resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass';
const finalRun = strategy === 'continuedDeepening'
  ? run  // Ticket 004 will call into the deep driver here when triggers fire
  : run;
```

Comment the `continuedDeepening` branch to make Ticket 004's insertion site obvious. The branch must read the strategy field; the no-op MUST NOT bypass the read (the read is the contract that this ticket establishes).

### 2. Architectural-invariant test for byte-identity

`continued-deepening-singlepass-unchanged.test.ts` — compile a representative `singlePass` profile (the existing FITL ARVN baseline is sufficient), run a fixed seed, capture the trace, and assert byte-identical match against a pre-Ticket-002 baseline trace OR (if the baseline cannot be captured) against a current-baseline trace re-run after this ticket lands.

Acceptable shape: replay-twice in the same test, assert byte-identity. The point is to prove the dispatch insertion does not perturb the trace; replay-identity is sufficient evidence.

## Files to Touch

- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify) — insert strategy dispatch at the single call site.
- `packages/engine/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.ts` (new) — architectural-invariant.

## Out of Scope

- Deep driver implementation (Ticket 004).
- Trigger evaluation (Ticket 004).
- Per-phase coverage population (Ticket 004).
- ARVN seed-1000 deep-recovery witness (Ticket 004).

## Outcome

Completed on 2026-05-10.

What landed:

- `createPolicyAgentChooseNStepInnerPreview` now reads `resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass'` after the broad `runChooseNStepInnerPreview` call.
- The `continuedDeepening` dispatch branch is an explicit no-op insertion site for Ticket 004 and returns the broad run unchanged.
- `singlePass` and `continuedDeepening` currently share the same broad-only result path; `chooseFrontierDecision` remains unchanged.
- `policy-preview-inner-deepening.ts` was not introduced.
- Added `packages/engine/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.ts`.

Ticket corrections applied:

- The assumption text that the `strategy` field did not yet exist is stale; Ticket 002 is archived and the field is present in the compiled profile type/lowering.
- The new test uses a current-baseline replay-twice and broad-only comparison witness, as the ticket explicitly allowed when a pre-Ticket-002 historical baseline is not available in-repo.

Generated fallout:

- None expected. This ticket reads an existing compiled config field and does not change schemas, generated JSON, or golden fixtures.

Deferred sibling/spec scope:

- Ticket 004 owns the deep-pass driver, trigger evaluation, state handoff, per-phase coverage population, and ARVN deep-recovery witness.
- Ticket 005 owns the cookbook update, benchmark sweep, and e2e fixture profile.

Source-size ledger:

- `packages/engine/src/agents/policy-agent-inner-preview.ts`: 256 -> 261 lines; below repo guidance.
- `packages/engine/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.ts`: new 310-line self-contained architectural invariant test; below repo guidance.

Verification plan:

- PASS: `pnpm -F @ludoforge/engine build`
- PASS: `node --test packages/engine/dist/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.js`
- PASS: `node --test packages/engine/dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
- PASS: `pnpm -F @ludoforge/engine test`
- PASS: `pnpm turbo build`
- PASS: `pnpm turbo test`
- PASS: `pnpm turbo lint`
- PASS: `pnpm turbo typecheck`
- PASS: post-Turbo rerun `node --test packages/engine/dist/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.js`
- PASS: post-Turbo rerun `node --test packages/engine/dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
- PASS: `pnpm run check:ticket-deps` (`3 active tickets and 2293 archived tickets`)
- PASS: `git diff --check`

Late-edit invalidation check:

- The terminal patch changed only status and proof transcription after all acceptance lanes were green. No scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, generated artifact, source, or test content changed; no code proof was invalidated.
- The dependency-check result transcription is clerical; it changes no dependency edge, status, scope, acceptance criterion, command semantics, or touched-file ownership.
- The `git diff --check` result transcription is clerical; it changes no code, generated artifact, proof command, dependency edge, or acceptance boundary.

## Acceptance Criteria

### Tests That Must Pass

1. New `continued-deepening-singlepass-unchanged.test.ts` proves byte-identical traces for `singlePass` profiles.
2. Existing `spec-162-arvn-seed-1000-witness.test.ts` continues to pass — no regression in F#20 enforcement.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.
4. `pnpm turbo typecheck && pnpm turbo lint`.

### Invariants

1. The `singlePass` code path is bit-identical to the pre-ticket path — replay produces byte-identical traces.
2. The `continuedDeepening` branch reads `resolvedProfile.profile.preview.inner?.strategy` (proves the seam is wired); even though the branch returns the same value, the read MUST happen.
3. No new module is introduced (`policy-preview-inner-deepening.ts` does not exist after this ticket — that is Ticket 004's responsibility).
4. `chooseFrontierDecision` (`policy-agent.ts:543`) is unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.ts` — architectural-invariant; replay-twice byte-identity for a representative `singlePass` profile. Per `.claude/rules/testing.md`, header: `// @test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/preview-deepening/continued-deepening-singlepass-unchanged.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
