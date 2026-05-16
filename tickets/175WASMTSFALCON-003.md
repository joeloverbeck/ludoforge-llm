# 175WASMTSFALCON-003: Phase 2 — Architecture test enforcing null-return contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — adds test under `packages/engine/test/architecture/`. No source-code change.
**Deps**: `tickets/175WASMTSFALCON-002.md`

## Problem

Phase 1 (ticket 002) eliminates the current asymmetric-throw sites by hand. Without a structural enforcement, the bug class can silently regress: a future contributor adds a new unsupported-detection branch and chooses `throw new PolicyRuntimeError` (the pattern that already exists alongside the converted sites), reintroducing the `278003969`-shaped bug. The spec's three-layer fix (§3) requires a structural enforcement layer that fails CI when a class-A throw is reintroduced.

This ticket adds an architecture test under `packages/engine/test/architecture/` that walks every `packages/engine/src/agents/policy-wasm-*.ts` file, identifies each `throw new PolicyRuntimeError` (or analogous `throw new Error` in unsupported-detection context), and verifies it carries the `// @policy-wasm-throw: contract-violation` comment marker established by ticket 002. Unmarked throws fail the test. The test also fails when a class-A site is removed and replaced by a new throw without the marker comment — preventing the asymmetric-throw pattern from drifting back in.

## Assumption Reassessment (2026-05-17)

1. The architecture test directory `packages/engine/test/architecture/` exists and already hosts pattern-walking tests (e.g., `policy-evaluation-context-constructor-invariant.test.ts`, `preview-inner-config-runtime-coverage.test.ts`). The new test follows that convention. Confirmed.
2. The comment-marker pattern (`// @policy-wasm-throw: contract-violation` for preserved throws; `// @policy-wasm-unsupported: null-return` for converted sites) is established by ticket 002. If ticket 002 chooses a different marker syntax (e.g., a structured JSDoc tag) during implementation, this ticket adopts that final form.
3. Spec §4 Phase 2 acceptance: "Architecture test passes on current code; deliberately reintroducing a buggy throw in a test fixture causes the architecture test to fail." This means the ticket includes a self-test: a fixture file containing a deliberately-unmarked throw that the architecture test would flag, plus a test assertion proving the walker rejects that fixture. The fixture lives under `packages/engine/test/architecture/fixtures/` to keep it isolated from real source.
4. Spec §9 OQ1 defaults Phase 2 mechanism to AST-based architecture test. Source parsing uses the existing TypeScript compiler API (already a dev dependency); fall back to a grep-style regex walker only if AST parsing introduces an outsized dep or runtime cost.
5. Acceptance criterion #6 requires every new test file to carry a `@test-class` marker per `.claude/rules/testing.md`. The new architecture test is `@test-class: architectural-invariant`.

## Architecture Check

1. **Structural enforcement, not catch-and-retry**: The test prevents bug-class reintroduction at PR time, not at runtime via a catch-all. This is the architectural-completeness pattern Foundation 15 calls for — fix the design, not the symptom.
2. **No source-code coupling**: The architecture test walks source by file pattern, not by importing source modules. New `policy-wasm-*.ts` files added in future tickets are automatically covered without manual test registration.
3. **Marker-based whitelisting is grep-stable**: Using a comment marker (rather than e.g. trying to AST-infer whether a throw is "unsupported-detection" from surrounding control flow) keeps the test cheap, debuggable, and survivable across TypeScript compiler API changes. The marker requirement is itself a documentation benefit — every preserved throw must declare its class explicitly.
4. **Self-tested**: The fixture-based negative test (a known-bad throw the test must reject) prevents the architecture test from silently passing if its walker logic regresses (e.g., regex change that skips files, AST query that no longer matches). Without this self-test, the architecture test could trivially become a no-op and we wouldn't notice.
5. **Foundation 16 alignment**: "Architectural properties MUST be proven through automated tests, not assumed." This test is the proof for the uniformly-enforced WASM↔TS fallback contract introduced by spec 175.

## What to Change

### 1. Add the architecture-invariant test

Create `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` with `// @test-class: architectural-invariant` marker. The test:

1. Globs `packages/engine/src/agents/policy-wasm-*.ts`.
2. For each file, parses the source (TypeScript compiler API preferred per spec §9 OQ1; regex fallback acceptable for simplicity if AST parsing adds excess complexity).
3. For each `throw new PolicyRuntimeError(...)` or `throw new Error(...)` node, checks that one of the following comment markers appears on the throw line or the immediately preceding line:
   - `// @policy-wasm-throw: contract-violation` — preserved class-B/C throw.
   - (No other marker is valid for a throw — converted class-A sites should be `return null` / typed equivalent, not throws.)
4. Asserts every throw site carries a valid marker; assertion message lists `file:line` for any unmarked throw with remediation guidance ("convert to null-return per spec 175 OR mark as contract-violation").
5. Counts the markers and reports the totals (preserved-throw count, converted-site count from `// @policy-wasm-unsupported: null-return` markers) in the test's success log for traceability against ticket 001's inventory.

### 2. Add the self-test fixture

Create `packages/engine/test/architecture/fixtures/policy-wasm-throw-contract-negative-fixture.ts.txt` (the `.txt` suffix prevents TypeScript from compiling it as part of the build). The fixture contains a minimal source snippet with an unmarked throw — the kind of code that would have caused `278003969`'s bug.

In the architecture test, add a second assertion that loads the fixture (as a string, not via import), runs the same walker logic against it, and asserts the walker reports the fixture's throw site as a violation. This proves the walker actually detects the bug pattern, not just that the current source happens to satisfy whatever the walker checks.

### 3. Wire into CI

The architecture test is picked up automatically by `pnpm turbo test` because it lives under `packages/engine/test/` and matches the existing `*.test.ts` glob. No CI workflow file changes required. Confirm by running the test locally and then by running the full Turborepo gate.

## Files to Touch

- `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` (new)
- `packages/engine/test/architecture/fixtures/policy-wasm-throw-contract-negative-fixture.ts.txt` (new)

## Out of Scope

- Source-code changes in `packages/engine/src/agents/policy-wasm-*.ts` (Phase 1 / ticket 002 is the only ticket that converts throws).
- Lint-rule packaging — spec §9 OQ1 defaults to architecture test, not ESLint rule. If a future ticket migrates to ESLint, that's outside this scope.
- Audit of throws outside `packages/engine/src/agents/policy-wasm-*.ts` (spec §9 OQ2).
- Modification of `policy-eval.ts` or the catch-all behavior.
- Parity-fixture authoring (Phase 3).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` passes against post-ticket-002 source.
2. The self-test fixture assertion proves the walker rejects an unmarked throw — verifiable by temporarily removing the marker requirement and watching the assertion fail (manual smoke).
3. Existing suite: `pnpm turbo test` passes (the new test is non-regressive against existing architecture/policy-evaluation-context-constructor-invariant.test.ts patterns).

### Invariants

1. Every `throw` statement in `packages/engine/src/agents/policy-wasm-*.ts` either carries `// @policy-wasm-throw: contract-violation` or causes the architecture test to fail.
2. The architecture test cannot be silently disabled by walker-logic regression — the negative-fixture assertion fails if the walker stops detecting the bug pattern.
3. The total marker count reported by the test matches the per-site table in `reports/175-phase-0-wasm-throw-site-inventory.md` (or its post-Phase-1 amended version).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` — `@test-class: architectural-invariant`. Walks WASM source files; asserts every throw carries the contract-violation marker; runs the negative-fixture self-test as a second case in the same file.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` — targeted run.
2. `pnpm turbo test` — full gate.
3. `pnpm turbo lint && pnpm turbo typecheck` — confirm the new test file passes lint/typecheck.
4. `pnpm run check:ticket-deps` — dep integrity.
