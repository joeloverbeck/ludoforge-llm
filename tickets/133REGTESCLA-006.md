# 133REGTESCLA-006: Meta-test enforcing `@test-class` marker discipline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — new test file only
**Deps**: `archive/tickets/133REGTESCLA-003.md`, `archive/tickets/133REGTESCLA-004.md`, `archive/tickets/133REGTESCLA-005.md`

## Problem

Spec 133 §Required Invariants establishes three rules: §1 every corpus file carries exactly one marker; §2 no file mixes architectural-invariant assertions with convergence-witness assertions (lint check); §3 aspirational 6-month staleness warning. Without an automated meta-test, markers drift: new test files land without markers, existing files gradually accrete mixed-class assertions, and the taxonomy's value erodes. This ticket lands the enforcement test that gates all future PRs against §1 and §2. §3 remains aspirational per Spec 133; not implemented here.

## Assumption Reassessment (2026-04-18)

1. After tickets 003–005 land, every `.test.ts`/`.test.mts` file under `packages/engine/test/**` (excluding `helpers/`, `fixtures/`, `dist/`) carries a marker. This meta-test presupposes that state. If any corpus file is unmarked when this ticket lands, the meta-test correctly fails — that is the intended enforcement mechanism.
2. `packages/engine/test/unit/infrastructure/` directory is created by ticket 001 (which places its reporter unit test there). This ticket adds a sibling meta-test file in the same directory.
3. §Required Invariant #3 (6-month staleness warning) is aspirational for MVP per Spec 133 — the spec explicitly allows initial implementation to emit warnings from a manually maintained quarterly audit list rather than automated date resolution. This ticket implements §1 and §2 only; #3 is deferred.
4. `node:fs/promises` `readdir` with `withFileTypes: true` supports recursive walking in Node 20+, which matches the engine runtime requirement in ticket 001.

## Architecture Check

1. **Cleaner than alternatives**: A dedicated meta-test enforcing §1 and §2 prevents marker drift at the CI boundary. The alternative — relying on code review to catch unmarked files — is fragile and human-dependent. Spec 133 aligns with FOUNDATIONS #16 (Testing as Proof): what the corpus proves is first-class metadata, and the invariants on that metadata are themselves provable via tests.
2. **Agnostic boundaries preserved**: Test file only; no engine code touched. The meta-test reads source files via `node:fs` — a standard Node capability — not via any game-specific module.
3. **No backwards-compatibility shims**: Meta-test is strict from the first run. No grace period, no "tolerated unmarked" allowlist. The hard dependency on tickets 003–005 enforces this: if those tickets are not complete when this one lands, CI fails — which is correct.

## What to Change

### 1. Create `packages/engine/test/unit/infrastructure/test-class-markers.test.ts`

- File-top marker: `// @test-class: architectural-invariant` (the meta-test tests an invariant: "every file is marked correctly").
- Recursively walks `packages/engine/test/**/*.{test.ts,test.mts}` via `node:fs/promises.readdir({recursive: true, withFileTypes: true})`.
- Excludes paths under any `helpers/`, `fixtures/`, or `dist/` subdirectory.

### 2. Implement §1 assertion — marker presence

For each corpus file:

- Read the first ~20 lines.
- Assert exactly one match for regex `/^\/\/\s*@test-class:\s*(\S+)$/m`. Valid values: `architectural-invariant`, `convergence-witness`, `golden-trace`.
- Fail with file path and reason if missing, duplicated, or an invalid value.

### 3. Implement §1b assertion — witness id for convergence-witness files

For each file marked `convergence-witness`:

- Assert presence of `/^\/\/\s*@witness:\s*(\S+)$/m` within 3 lines of the class marker.
- Fail with file path if missing.

### 4. Implement §2 assertion — no intra-file class mixing

Best-effort structural heuristic per Spec 133 §1 ("Tests that legitimately mix classes MUST be split"):

- For each file, scan full source for conflicting assertion shapes.
- Heuristic rule set (refinable over time):
  - **Architectural-invariant shape indicators**: `for (const .* of legalMoves`, `for (const .* of enumerateLegalMoves`, `.every(`, `.forEach(move =>`, quantifier-based iteration over move sets.
  - **Convergence-witness shape indicators**: `assert.equal(trace.moves.length, <numeric literal>)`, `assert.equal(trace.moves[<N>].activePlayer, <literal>)`, `activePlayer === <numeric literal>` comparisons, seed-literal trajectory assertions.
- If both shape indicators appear in the same file → fail with file path and the offending line numbers.
- Note in the test file comments that this is best-effort detection; false positives are expected and should trigger refinement of the heuristic (or clarification of the offending file's class).

### 5. Reporting

On failure, emit the list of offending files grouped by rule violated (missing marker, invalid class, missing witness id, mixed shapes). Each entry includes the file path and the specific reason. Engineers must be able to see at a glance which files to fix.

## Files to Touch

- `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` (new)

## Out of Scope

- §Required Invariant #3 (6-month staleness warning) — aspirational per spec; deferred to a follow-up ticket.
- Auto-repair of markers — this test fails, it does not edit source.
- Dist-layer enforcement — this test walks source `.ts`/`.mts` files, not compiled `.js`.
- Runner (`packages/runner/`) test classification — per spec §Out of Scope.
- Refining the §2 mixed-shape heuristic beyond the initial rule set — future tickets may extend as false positives/negatives surface.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` passes — all corpus files have valid markers, convergence-witness files have witness ids, no file triggers the mixed-shape heuristic.
2. Full engine suite: `pnpm -F @ludoforge/engine test` passes including this new meta-test.
3. Negative-case manual verification (during implementation, then reverted): delete a marker from one file, run `test:unit`, verify the meta-test fails with the offending path in its output.

### Invariants

1. Every `.test.ts`/`.test.mts` file under `packages/engine/test/**` (excluding `helpers/`, `fixtures/`, `dist/`) carries exactly one valid `@test-class` marker.
2. Every `convergence-witness` file carries a `@witness: <id>` line adjacent to its class marker.
3. No file mixes architectural-invariant and convergence-witness assertion shapes under the current heuristic rule set.
4. The meta-test's own classification is `architectural-invariant` — it tests a property invariant over the corpus, not a trajectory-specific witness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` — the meta-test itself, covering §1 presence, §1b witness id, §2 mixed-shape heuristic.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` — meta-test runs alongside other unit tests.
2. `pnpm -F @ludoforge/engine test` — full suite; confirms no regressions from the new enforcement.
3. `pnpm turbo build` — tsc compiles the new test file.
4. `pnpm turbo lint`.
5. `pnpm turbo typecheck`.
6. Negative verification (manual, reverted): temporarily delete a marker, confirm `test:unit` fails with the expected offending path in the meta-test output, then restore the marker.
