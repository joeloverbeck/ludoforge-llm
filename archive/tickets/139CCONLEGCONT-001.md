## 139CCONLEGCONT-001: CompletionCertificate type and materialization function

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module (`completion-certificate.ts`)
**Deps**: `specs/139-constructibility-certificate-legality-contract.md`

## Problem

Spec 139's certificate-carrying legality contract requires a kernel-owned, RNG-free, serializable artifact that captures the full decision-sequence assignment needed to materialize a fully-bound legal move from a template without further search. The spec's G1 (Design D1) introduces this artifact as `CompletionCertificate` — a frozen value type plus a pure materialization function. Both must exist before the classifier (003) can emit certificates and before the agent sampler (005) can consume them as a deterministic fallback.

This ticket delivers the type surface and the materialization function in isolation, with a T1 unit test that exercises both against a hand-authored synthetic GameDef. No callers are wired up yet; 003 will begin emitting certificates and 005 will begin consuming them.

## Assumption Reassessment (2026-04-19)

1. `CompletionCertificate` does not exist anywhere in the codebase (grep confirmed). Safe to create.
2. `DecisionKey` (branded type at `packages/engine/src/kernel/decision-scope.ts:1`) and `MoveParamValue` (type at `packages/engine/src/kernel/types-ast.ts:657`) both exist and are the right nominal types for assignment records per Foundation #17.
3. `completeMoveDecisionSequence` — the function the spec's D1 narrative names as the materialization substrate — exists in `packages/engine/src/kernel/move-decision-completion.ts` (not `move-completion.ts`). Materialization will reuse it with a guided chooser consuming the certificate assignments in order.
4. Spec 139 was reassessed earlier this session; Foundations alignment confirmed.

## Architecture Check

1. **Kernel-owned, pure, RNG-free.** Certificate is a frozen readonly value; materialization is a pure function with no RNG advance, no wall-clock read, no hash-iteration-order dependency (Foundations #8, #11). The `fingerprint` field is deterministic over its inputs so two independent classifier runs produce byte-identical certificates for the same `(state, move, assignments)` triple.
2. **Engine-agnostic.** Certificate references `DecisionKey`, `MoveParamValue`, and `GameDef`/`GameState`/`Move`/`GameDefRuntime` — all generic kernel types. No per-game identifier or branch (Foundation #1).
3. **No backwards-compatibility shims.** This is a brand-new module; no legacy aliases to preserve (Foundation #14).
4. **Reuses existing substrate.** Materialization composes `completeMoveDecisionSequence` with a certificate-consuming chooser rather than duplicating the completion pipeline. Foundation #15.

## What to Change

### 1. Create `packages/engine/src/kernel/completion-certificate.ts`

Export:

- `CompletionCertificate` interface (readonly `assignments`, `fingerprint`, optional `diagnostics`).
- `CompletionCertificateAssignment` interface (`decisionKey: DecisionKey`, `value: MoveParamValue`, `requestType: 'chooseOne' | 'chooseN'`).
- `CompletionCertificateDiagnostics` interface (`probeStepsConsumed`, `paramExpansionsConsumed`, `memoHits`, `nogoodsRecorded` — all `number`).
- `materializeCompletionCertificate(def, state, baseMove, certificate, runtime) => Move`.

Fingerprint derivation: canonical JSON encoding over `(projectedStateHash, actionId, normalized-base-params, ordered-assignments)` then a deterministic hash (reuse the same canonical-serialization path used elsewhere in the kernel — see `state-hash.ts` or equivalent; pick the existing canonical-encoding helper rather than introducing a new one).

Materialization algorithm:

1. Build a certificate-consuming chooser: a closure that reads assignments in order. For each `ChoicePendingRequest` passed to it by `completeMoveDecisionSequence`, return the next assignment's `value` whose `decisionKey` matches. If no match is found (certificate underspecifies the path), throw a kernel invariant error — the classifier's contract guarantees the certificate covers every non-stochastic decision.
2. Call `completeMoveDecisionSequence(def, state, baseMove, { choose: certificateChooser, chooseStochastic: … }, runtime)`.
3. Assert the result is `complete === true` — if not, materialization is a kernel invariant violation.
4. Return the fully-bound `Move`.

### 2. New T1 unit test

File: `packages/engine/test/unit/kernel/completion-certificate.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- Construct a synthetic GameDef with a `chooseN{min:1, max:3, options:5}` head and a downstream `chooseOne` per selected option. Use existing test helpers under `packages/engine/test/helpers/` for GameDef construction and state fixture building.
- For a state where exactly one combination is legal end-to-end, hand-author the expected `CompletionCertificate` (assignments in canonical order, fingerprint computed from the derivation function).
- Assert `materializeCompletionCertificate(def, state, baseMove, certificate, runtime)` returns a `Move` whose `evaluateMoveLegality` verdict is `legal` and whose `complete` probe result is `true`.
- Assert two consecutive calls produce byte-identical materialized moves (Foundation #8 determinism).
- Assert materialization does not advance `GameState.rng` (Foundation #8 replay-identity).
- Assert a certificate that underspecifies the path (missing an assignment) throws a kernel invariant error.

## Files to Touch

- `packages/engine/src/kernel/completion-certificate.ts` (new)
- `packages/engine/test/unit/kernel/completion-certificate.test.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify export surface)

## Out of Scope

- Classifier-side certificate emission (ticket 003).
- Admission-side certificate attachment (ticket 004).
- Agent-side certificate consumption (ticket 005).
- Cross-call memoization (spec Edge Cases notes this as future work — not in scope for Spec 139).

## Acceptance Criteria

### Tests That Must Pass

1. New T1 unit test passes under `pnpm -F @ludoforge/engine test:unit` (after `pnpm -F @ludoforge/engine build`).
2. Full engine test suite remains green: `pnpm turbo test` — no regression from the additive module.
3. Lint and typecheck pass: `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. `materializeCompletionCertificate` is a pure function: no RNG advance, no clock read, no caller-visible state mutation (Foundation #8, #11).
2. Two independent materializations of the same certificate on the same `(def, state, baseMove, runtime)` produce byte-identical `Move` outputs.
3. Certificate fingerprint composes deterministically over ordered assignments — byte-identical certificate → byte-identical fingerprint.
4. All domain identifiers inside `CompletionCertificate` use branded types (`DecisionKey`, `MoveParamValue`) — no raw strings (Foundation #17).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/completion-certificate.test.ts` — T1 per spec § Testing Strategy; exercises type shape, materialization correctness, determinism, and invariant-violation paths.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted.
2. `pnpm turbo test` — full suite.
3. `pnpm turbo lint && pnpm turbo typecheck` — gates.

## Outcome

- Added `packages/engine/src/kernel/completion-certificate.ts` with the new certificate assignment/diagnostics types, deterministic fingerprint derivation, and pure `materializeCompletionCertificate(...)` materialization over `completeMoveDecisionSequence(...)`.
- Added `packages/engine/test/unit/kernel/completion-certificate.test.ts` covering deterministic materialization, legality/completion proof, no RNG advance, and underspecified-certificate invariant failure.
- Added the public export wiring in `packages/engine/src/kernel/index.ts` so the new surface is reachable through the kernel barrel.
- `ticket deviation`: the T1 fixture derives the canonical runtime-owned `decisionKey` sequence via `resolveMoveDecisionSequence(...)` before constructing the expected certificate, rather than hardcoding draft-shaped keys. Coverage intent and deterministic proof obligations are unchanged.
- `ticket corrections applied`: `state-hash.ts fingerprint helper reference -> live fingerprint derivation now uses GameState.stateHash plus canonicalized base params/ordered assignments in the new module`
- `verification set`: `pnpm -F @ludoforge/engine build` -> `pnpm -F @ludoforge/engine test:unit` -> `pnpm turbo lint` -> `pnpm turbo typecheck` -> `pnpm turbo test`
- `proof gaps`: `none`
