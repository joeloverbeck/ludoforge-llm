# FITLDETBOUND-001: Investigate and eliminate Spec 140 policy/microturn boundedness regressions in FITL determinism lanes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — investigation-first across kernel microturn publication/application, policy-agent evaluation, simulator replay/determinism, and memory/perf instrumentation
**Deps**: `docs/FOUNDATIONS.md`, `archive/tickets/FITLMICROFREE-001.md`, `archive/specs/140-microturn-native-decision-protocol.md`

## Problem

Multiple post-push CI failures indicate that the Spec 140 FITL path is still violating bounded-computation expectations:

1. `Engine Grant Determinism Canary` aborts with V8 heap OOM after about 13 minutes and ~4 GB heap usage.
2. `Engine Determinism Parity` times out in `draft-state-determinism-parity.test.js` after 20 minutes.
3. `Engine Memory` and `Engine Performance` still cancel exactly at their workflow time budgets.
4. `Engine FITL Rules` remains abnormally long-running.

The exact retained-object source is not yet proven. What is proven is the failure mode: Spec 140 FITL decision publication / policy evaluation / determinism replay is no longer staying within the bounded resource envelope expected by CI.

This is a Foundations issue before it is a workflow issue:

- Foundation `#10`: bounded computation.
- Foundation `#15`: root-cause fix, not symptom masking.
- Foundation `#16`: prove architectural properties with automated tests.

## Assumption Reassessment (2026-04-21)

1. The prior Texas dead-end regression was real and has been corrected, but it did not eliminate the FITL memory/time blow-up.
2. The current evidence does not yet prove whether the dominant retained cost sits in kernel publication, continuation probing, policy-agent candidate evaluation, replay/determinism fixtures, or a combination.
3. Because the retained-object source is not yet concrete, this ticket must begin with investigation and artifact capture before selecting the final implementation.
4. Increasing workflow timeouts first would hide the architectural problem and conflict with Foundations `#10` and `#15`.

## Architecture Check

1. The investigation must measure generic runtime behavior, not chase a single FITL symptom with special-case logic.
2. Any final fix must preserve one deterministic rules protocol; optimizations may cache or reuse generic analysis, but they may not introduce client-specific or agent-specific legality paths.
3. No compatibility shims or “slow lane” exemptions in production kernel logic. If quality witness or reporting lanes need workflow treatment, that can happen only after the core boundedness fix is understood.

## What to Change

### 1. Reproduce and capture the boundedness failure with evidence

Add a reproducible local harness for the failing determinism/canary scenarios:

- same test files / seeds that fail in CI,
- memory and timing capture sufficient to identify whether the retained growth is in candidate frontier evaluation, replay materialization, trace retention, or repeated continuation probing,
- clear artifact or console summary that can be compared before and after the fix.

Use targeted instrumentation or heap snapshots only as needed; keep them out of production behavior once the root cause is known.

### 2. Identify the dominant retained-work source

Investigate at least these surfaces:

- policy-agent candidate evaluation in FITL
- microturn publication / continuation probing
- decision replay / determinism harness
- any trace, diagnostics, or snapshot retention on the hot path

The ticket is not complete until the dominant source is named concretely in the outcome and the fix addresses that source directly.

### 3. Implement a foundations-compliant boundedness fix

Possible valid implementation directions include, but are not limited to:

- eliminating duplicate continuation/publish work,
- avoiding retention of large candidate state graphs,
- narrowing hot-path diagnostics allocation,
- reusing generic analysis artifacts where deterministically valid,
- shrinking determinism replay proof cost without weakening the proof.

The chosen implementation must remain generic and must not weaken the legality contract.

### 4. Lock the fix in with targeted boundedness proofs

Add or update tests that prove:

- the failing determinism/canary scenarios complete within the intended bounded envelope,
- the fix does not regress replay identity or constructibility,
- the policy agent still evaluates the same legal frontier correctly.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` and related policy evaluation modules (modify if root cause lands there)
- `packages/engine/src/kernel/microturn/*.ts` (modify if root cause lands there)
- `packages/engine/src/sim/*.ts` (modify if root cause lands there)
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (modify only if proof shape must be corrected without weakening the invariant)
- `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` (modify as part of TDD proof)
- targeted profiling / harness scripts under `packages/engine/scripts/` or `scripts/` (new/modify if needed)

## Out of Scope

- Blindly increasing `timeout-minutes`.
- Marking determinism or canary failures non-blocking.
- FITL-specific branches in kernel or agent logic.
- Weakening replay/determinism assertions just to make CI pass.

## Acceptance Criteria

### Tests That Must Pass

1. The reproduced FITL determinism parity scenario completes without hitting the current 20-minute per-file timeout.
2. The FITL policy-agent canary determinism scenario completes without V8 heap OOM.
3. `pnpm -F @ludoforge/engine test:determinism` passes locally.
4. The relevant CI lanes become green without timeout inflation as the primary fix.

### Invariants

1. The final solution preserves atomic published-decision legality (Foundations `#5`, `#18`, `#19`).
2. The fix is generic and game-agnostic (Foundation `#1`).
3. Boundedness is restored by reducing actual work / retention, not by weakening proofs or hiding failures (Foundations `#10`, `#15`, `#16`).

## Test Plan

### New/Modified Tests

1. Determinism boundedness regression for the current failing parity/canary corpus
2. Policy frontier regression proving no memory blow-up on the reproduced FITL path
3. Replay / constructibility regression proving the optimization does not alter semantics

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js`
4. `pnpm -F @ludoforge/engine test:memory`
5. `pnpm -F @ludoforge/engine test:performance`
