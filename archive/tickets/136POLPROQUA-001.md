# 136POLPROQUA-001: Extend marker infrastructure — `@profile-variant` marker + determinism lint rule

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test infrastructure (`packages/engine/test/unit/infrastructure/`, `packages/engine/scripts/test-class-reporter.mjs`)
**Deps**: `specs/136-policy-profile-quality-corpus.md`

## Problem

Spec 136 formalizes the separation between the determinism corpus (blocking, architectural invariants) and a new policy-profile quality corpus (non-blocking, variant-specific convergence witnesses). The marker infrastructure from Spec 133 (archived, COMPLETED) validates `@test-class` and `@witness` markers across the corpus, but does not recognize the new `@profile-variant <id>` marker required on every file under `packages/engine/test/policy-profile-quality/`, nor does it prevent regressions to the dual-duty canary anti-pattern (a `stopReason === 'terminal'` pin reappearing in the determinism corpus).

Ticket 002 cannot author the corpus files until the marker validator accepts `@profile-variant`. This ticket lands the validator + reporter extensions first, in line with Spec 136 Required Invariant 1 ("No file under `packages/engine/test/determinism/` asserts `trace.stopReason === 'terminal'` or equivalent single-outcome pins") and Required Invariant 2 ("Every file under `packages/engine/test/policy-profile-quality/` declares a `@profile-variant` marker and a named seed set").

## Assumption Reassessment (2026-04-18)

1. `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` currently requires exactly one `@test-class` marker per file and, for `convergence-witness`, exactly one `@witness` marker within three lines of it. The lint loops over all test files under `packages/engine/test/**` excluding `helpers/`, `fixtures/`, and `dist/` (see `isExcludedPath`). Confirmed against current source (line 70–73 and 110–128).
2. `packages/engine/scripts/test-class-reporter.mjs` groups results into the fixed set `['architectural-invariant', 'convergence-witness', 'golden-trace', 'unclassified']` (line 7). It reads the `@test-class` marker from the first 20 lines of each file (`HEADER_LINE_LIMIT = 20`) and writes summaries per lane.
3. `packages/engine/test/policy-profile-quality/` does not yet exist — this ticket only modifies validator/reporter code, not test data.
4. The determinism directory (`packages/engine/test/determinism/`) currently contains 5 test files, all `architectural-invariant`. Post-commit `820072e3`, none assert `stopReason === 'terminal'` as a per-seed pin; `fitl-policy-agent-canary.test.ts` uses `BOUNDED_STOP_REASONS.has(...)` set-membership (line 53–58). The lint rule this ticket adds must therefore pass on the current state — it is a guard against regression, not a remediation.
5. Spec 133 is archived and COMPLETED; Spec 136 Required Invariants 1 and 2 are the controlling contract for this ticket.

## Architecture Check

1. **Extends existing marker discipline uniformly**. The new `@profile-variant` marker plugs into the same validator that already enforces `@test-class` and `@witness` discipline — one grep, one error aggregation, one failure report. No parallel validation framework.
2. **Engine-agnostic**. The lint operates on test-file text patterns and directory paths only. It does not import the FITL game definition, profile IDs, or any game-specific data. Policy-profile quality corpus files themselves remain engine code (the validator is infrastructure), consistent with FOUNDATIONS #1.
3. **No backwards compatibility**. Files under `policy-profile-quality/` classified as `convergence-witness` MUST carry `@profile-variant` instead of `@witness` — the two markers are peers, not alternatives. The validator rejects both-and and neither-nor forms. Once Ticket 002 lands its files, there is no transitional state.
4. **Fail-closed determinism lint**. A new `determinism/`-scoped scan asserts that no file under `packages/engine/test/determinism/` contains a `stopReason === 'terminal'` pin (or `=== "terminal"`). Allowed forms are set-membership / `.has(...)` / `includes(...)` against a named constant. Regressions to the pre-`820072e3` anti-pattern will fail the validator, satisfying FOUNDATIONS #16 ("Testing as Proof").

## What to Change

### 1. Recognize `@profile-variant` marker in `test-class-markers.test.ts`

Add a new regex alongside `WITNESS_PATTERN`:

```ts
const PROFILE_VARIANT_PATTERN = /^\/\/\s*@profile-variant:\s*(\S+)\s*$/gmu;
```

Add a directory predicate:

```ts
const isPolicyProfileQualityPath = (filePath: string) => {
  const segments = relative(sourceTestRoot, filePath).split(sep);
  return segments[0] === 'policy-profile-quality';
};
```

Extend the per-file loop in `describe('test class markers', ...)`:

- If `markerCheck.testClass === 'convergence-witness'` AND the file is under `policy-profile-quality/`: require exactly one `@profile-variant <id>` marker within three lines of the `@test-class` marker; `@witness` must be absent. Collect failures into a new `missingProfileVariants` bucket.
- If `markerCheck.testClass === 'convergence-witness'` AND the file is NOT under `policy-profile-quality/`: preserve existing `@witness` adjacency requirement (already implemented). `@profile-variant` must be absent — collect stray hits into `missingProfileVariants` with a distinguishing message.
- If `markerCheck.testClass !== 'convergence-witness'`: `@profile-variant` must be absent (it is meaningful only for convergence witnesses).

Append the new failure group to `failureReport` via `formatFailureGroup`.

### 2. Determinism corpus lint rule

Add a second `it(...)` block (or extend the existing one with a new bucket) in `test-class-markers.test.ts`:

```ts
const DETERMINISM_TERMINAL_PIN_PATTERN = /stopReason\s*===\s*['"]terminal['"]/gu;
```

For every file whose path starts with `packages/engine/test/determinism/`, collect matches. Any hit fails the test with a message pointing at the file and line, citing Spec 136 Contract §5 ("No convergence assertion in determinism corpus") and Required Invariant 1.

Allowed forms (not flagged): `BOUNDED_STOP_REASONS.has(trace.stopReason)`, `ALLOWED_STOP_REASONS.has(...)`, `['terminal', 'maxTurns', ...].includes(trace.stopReason)` — any form that checks set membership rather than pinning a single value.

### 3. Reporter — surface `@profile-variant` groupings

Extend `packages/engine/scripts/test-class-reporter.mjs`:

- Read the `@profile-variant` marker alongside `@test-class` (extend `TEST_CLASS_MARKER_PATTERN` scan with a second `PROFILE_VARIANT_MARKER_PATTERN = /^\/\/\s*@profile-variant:\s*(\S+)/mu`).
- When the reporter's `laneLabel` is `policy-profile-quality` (set via `ENGINE_TEST_PROGRESS_LANE`), emit a supplementary summary section grouping pass/fail counts by variant ID. When the lane is any other value, the existing summary shape is unchanged.
- Add a `SUMMARY_NOTES` entry for use when `policy-profile-quality` lane shows failing variants: `'policy-profile-quality': 'non-blocking — profile-level quality witness'`.

### 4. Unit coverage for the validator extensions

Add a unit test (new file) at `packages/engine/test/unit/infrastructure/test-class-markers-profile-variant.test.ts` that drives `test-class-markers`'s helper logic through fixture strings:

- Fixture: `convergence-witness` file under `policy-profile-quality/` with `@profile-variant` → passes.
- Fixture: `convergence-witness` under `policy-profile-quality/` without `@profile-variant` → fails with the expected error string.
- Fixture: `convergence-witness` under `policy-profile-quality/` with both `@witness` and `@profile-variant` → fails (exactly-one rule).
- Fixture: `convergence-witness` under `integration/` with `@profile-variant` (no `@witness`) → fails.
- Fixture: determinism file containing `stopReason === 'terminal'` → fails the lint.
- Fixture: determinism file using `BOUNDED_STOP_REASONS.has(stopReason)` → passes.

If `test-class-markers.test.ts` does not export its helpers, refactor to export `getMarkerCheck`, `assertWitnessAdjacency`, plus a new `assertProfileVariantAdjacency` and a new `assertNoDeterminismTerminalPin` — keeping the shape parallel.

## Files to Touch

- `packages/engine/test/helpers/test-class-marker-helpers.ts` (new)
- `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` (modify)
- `packages/engine/test/unit/infrastructure/test-class-markers-profile-variant.test.ts` (new)
- `packages/engine/scripts/test-class-reporter.mjs` (modify)
- `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` (modify)

## Out of Scope

- Authoring any file under `packages/engine/test/policy-profile-quality/` — that is Ticket 002.
- Any change to existing `integration/` convergence-witness files' `@witness` markers.
- CI wiring (lane definitions, workflows) — Tickets 002 and 004.
- Runner or visual-layer behavior.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:unit` — including the new `test-class-markers-profile-variant.test.ts` fixtures.
2. `test-class-markers` full-corpus run passes against the current main state (determinism files contain no `=== 'terminal'` pins; no files under `policy-profile-quality/` exist yet).
3. `pnpm turbo test` — default lane still green.
4. `pnpm turbo typecheck` — no type regressions in the engine package.
5. `pnpm turbo lint` — clean.

### Invariants

1. Every convergence-witness file under `packages/engine/test/policy-profile-quality/` MUST declare exactly one `@profile-variant <id>` marker within three lines of its `@test-class` marker, and MUST NOT declare `@witness` (enforced by the extended validator).
2. No file under `packages/engine/test/determinism/` contains a `stopReason === 'terminal'` or `stopReason === "terminal"` assertion at any call site (enforced by the new determinism lint rule).
3. `test-class-markers.test.ts`'s file-discovery logic continues to exclude `helpers/`, `fixtures/`, and `dist/` — no new exclusion, no removed exclusion.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/test-class-markers-profile-variant.test.ts` — new fixture-driven unit tests for the six cases listed in What to Change §4. Rationale: ensures each validator branch is covered by its own assertion rather than relying on full-corpus behavior to exercise edge cases.
2. `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` — modified top-level assertion aggregates the new `missingProfileVariants` and `determinismTerminalPins` buckets. Rationale: full-corpus enforcement as an architectural-invariant gate.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted infrastructure tests.
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full suite verification.
3. `pnpm run check:ticket-deps` — dependency integrity gate.

## Outcome

- Completion date: 2026-04-18
- `ticket corrections applied`: `Files to Touch omitted the shared helper extraction and direct reporter test coverage -> added packages/engine/test/helpers/test-class-marker-helpers.ts and packages/engine/test/unit/infrastructure/test-class-reporter.test.ts to match the live implementation boundary.`
- Landed a shared marker-helper module so the new fixture-driven unit test can exercise `@profile-variant` and determinism-pin validation without importing one test file into another.
- Extended the corpus validator to require `@profile-variant` only for `policy-profile-quality/` convergence witnesses, reject stray `@profile-variant` usage elsewhere, and fail determinism files that pin `stopReason === 'terminal'`.
- Extended the test-class reporter to read `@profile-variant` markers and emit per-variant summary counts when the active lane is `policy-profile-quality`.
- Verification set: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, `pnpm run check:ticket-deps`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`.
