# 151DECSTACSER-004: Delete generic BigInt walkers + grep enforcement

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/serde.ts` (delete walker function bodies), one new test file
**Deps**: `archive/tickets/151DECSTACSER-002.md`

## Problem

After 002 lands, `sanitizeNestedBigInts` (`serde.ts:41-71`) and `restoreNestedSerializedBigInts` (`serde.ts:73-115`) are no longer invoked — they are dead code. F14 forbids leaving unused compatibility shims in production code. This ticket deletes both function bodies and adds a grep-enforcement test that future regressions reintroducing either function fail CI immediately. This is the F14 atomic cut for the walker pattern: the new explicit recursion (002) and the deletion (this ticket) together replace the safety net structurally.

## Assumption Reassessment (2026-05-01)

1. After 002 lands, `serializeGameState` no longer invokes `sanitizeNestedBigInts` and `deserializeGameState` no longer invokes `restoreNestedSerializedBigInts`. Both are confirmed module-internal (zero external consumers grep-confirmed during spec 151 reassessment), so deletion has zero blast radius beyond `serde.ts`.
2. The walker functions occupy `serde.ts:41-71` (sanitize) and `serde.ts:73-115` (restore) at the time of spec authoring; line numbers may shift after 002 lands. `/implement-ticket` will reassess against the post-002 state.
3. Engine tests use `node --test` with no Jest harness. A grep-enforcement test will use `child_process.execSync` to invoke `grep -rn` and assert zero output.
4. The grep should target both names at once: `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` returns zero hits.

## Architecture Check

1. F14 atomic cut: the walker pattern (generic safety net) is replaced by explicit type-driven recursion in a single coordinated change. No shim survives this ticket's landing.
2. F15 architectural completeness: the grep test ensures the walker pattern cannot silently re-enter the codebase. A future contributor who is tempted to "just walk and convert" will see the test fail immediately.
3. The grep test guards `packages/engine/src/` only — the spec's source tree. Test fixtures, dist output, and references in this spec/ticket are intentionally exempt.

## What to Change

### 1. Delete walker function bodies in `packages/engine/src/kernel/serde.ts`

Remove the entire definition of `sanitizeNestedBigInts` (currently lines 28-71 — JSDoc comment + function) and `restoreNestedSerializedBigInts` (currently lines 73-115). After 002, neither is invoked anywhere. After deletion, only the explicit serializers from 002 remain.

If any imports become unused after deletion (e.g., a helper used only by the walkers), remove them as well — F14 demands no dead code.

### 2. Add `packages/engine/test/unit/walker-deletion-enforcement.test.ts`

```ts
// @test-class: architectural-invariant
import { execSync } from 'node:child_process';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('decision-stack serialization walker enforcement (spec 151)', () => {
  it('sanitizeNestedBigInts is fully deleted from packages/engine/src', () => {
    const output = execSync(
      "grep -rn 'sanitizeNestedBigInts' packages/engine/src || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    assert.equal(output, '', `Residual references to sanitizeNestedBigInts:\n${output}`);
  });

  it('restoreNestedSerializedBigInts is fully deleted from packages/engine/src', () => {
    const output = execSync(
      "grep -rn 'restoreNestedSerializedBigInts' packages/engine/src || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    assert.equal(output, '', `Residual references to restoreNestedSerializedBigInts:\n${output}`);
  });
});
```

Use `|| true` to coerce grep's exit-1-on-no-match into a successful command — `execSync` would otherwise throw on exit 1 (which is the desired outcome). The trim+empty-equality check is the actual assertion.

The test must run from the repo root so the `packages/engine/src` path resolves correctly. Engine tests typically run from `packages/engine/`; if so, adjust the grep path to `src/` and keep the same semantics. `/implement-ticket` confirms the runtime cwd.

## Files to Touch

- `packages/engine/src/kernel/serde.ts` (modify — delete walker function bodies)
- `packages/engine/test/unit/walker-deletion-enforcement.test.ts` (new — grep test)

## Out of Scope

- Removing walker invocation sites — owned by 002 (already done by the time this ticket starts).
- The raw `JSON.stringify(state|trace)` enforcement test — owned by 005 (Acceptance Criterion 2 of the spec).
- Round-trip and synthetic-bindings tests — owned by 005.
- Schema work — owned by 003.

## Acceptance Criteria

### Tests That Must Pass

1. The new `walker-deletion-enforcement.test.ts` passes — both grep assertions return empty.
2. Existing suite: `pnpm -F @ludoforge/engine test` passes unchanged after walker deletion (002 already removed the invocations).
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` and the determinism shards stay green.
4. `pnpm turbo lint typecheck` passes — no unused-helper warnings remain.

### Invariants

1. `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` returns zero matches. Enforced by the new test.
2. Per F14: no compat shim or alias path survives. `serializeGameState` and `deserializeGameState` rely on explicit recursion only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/walker-deletion-enforcement.test.ts` — new. Asserts both walker names are absent from `packages/engine/src/`. Architectural invariant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` (manual sanity check)
4. `pnpm turbo lint typecheck`

## Outcome (2026-05-01)

Completed the F14 deletion cut for the generic BigInt walker pattern. `packages/engine/src/kernel/serde.ts` no longer defines `sanitizeNestedBigInts` or `restoreNestedSerializedBigInts`; `serializeGameState` and `deserializeGameState` continue to rely on the explicit type-driven recursion landed by 001/002. Added `packages/engine/test/unit/walker-deletion-enforcement.test.ts` as an architectural-invariant unit test that greps the live engine source tree and fails if either walker name re-enters `packages/engine/src`.

Ticket corrections applied: the enforcement test uses `src` when run from the engine package root and `packages/engine/src` when run from the repository root, preserving the ticket's intended source-tree invariant under the live `pnpm -F @ludoforge/engine ...` cwd.

Generated fallout: none. No schemas, compiled JSON, goldens, or fixtures changed.

Deferred sibling/spec scope: `151DECSTACSER-005` still owns raw `JSON.stringify(state|trace)` enforcement plus round-trip and synthetic-binding tests; `151DECSTACSER-003` remains the completed schema-tightening owner.

Final verification results:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/walker-deletion-enforcement.test.js` — passed.
3. `pnpm -F @ludoforge/engine test` — passed; `59/59 files passed`, including the new enforcement test.
4. `pnpm turbo lint typecheck` — passed; `5 successful, 5 total`.
5. `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` — returned zero matches; `rg -n "sanitizeNestedBigInts|restoreNestedSerializedBigInts" packages/engine/src` also returned zero matches.
6. `pnpm -F @ludoforge/engine test:integration:slow-parity` — red, classified as repo-preexisting unrelated slow-corpus blocker outside this ticket's serializer deletion. The runner timed out `dist/test/integration/agents/drive-fingerprint-property.test.js` after `10m 1s` with heartbeat-only progress, matching the archived 002 closeout classification. This ticket did not touch policy preview, agents, lane routing, or that test.
7. `pnpm -F @ludoforge/engine test:determinism` — red, classified as repo-preexisting unrelated heavy-corpus blocker outside this ticket's serializer deletion. The lane passed `dist/test/determinism/decision-local-scope-drop.test.js`, then timed out `dist/test/determinism/draft-state-determinism-parity.test.js` after `20m 1s` with heartbeat-only progress, matching the archived 002 closeout classification. No serializer assertion failed.

No-invalidation note: this outcome/status update only transcribes the final command results and classifies the two already-documented broad-lane timeouts; it does not change scope, acceptance semantics, code, tests, or generated artifacts after the proof runs.
