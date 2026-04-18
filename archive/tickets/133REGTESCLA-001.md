# 133REGTESCLA-001: Custom `node --test` reporter and runner wiring

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test tooling (scripts/ + test/) only; no kernel/compiler/runtime changes
**Deps**: `specs/133-regression-test-classification-discipline.md`

## Problem

Spec 133 §4 requires CI output grouped by test class so engineers can triage failures in seconds: "3 architectural-invariant failures (investigate kernel), 8 convergence-witness failures (likely trajectory shift), 2 golden-trace failures (re-bless expected)." Today, `packages/engine/scripts/run-tests.mjs` invokes `node --test` with `stdio: 'inherit'`, producing ungrouped output — every failure looks identical regardless of whether it signals a real bug, a trajectory shift, or an expected re-bless.

This ticket lands the infrastructure that makes the classification actionable: a custom `node --test` reporter plus runner wiring. Corpus classification (tickets 003–005) and marker-presence enforcement (006) are separate concerns and land after this.

## Assumption Reassessment (2026-04-18)

1. `packages/engine/scripts/run-tests.mjs` uses `spawnSync(execPath, ['--test', ...plan.patterns], {stdio: 'inherit'})` in both `batched` and `sequential` execution branches inside `runExecutionPlan`. Verified in current source.
2. `tsc` preserves both `/** */` block comments and single-line `//` comments in `dist/` — verified by reading `dist/test/determinism/fitl-policy-agent-canary.test.js`, which retains intact `//` lines from the source. The reporter can therefore read markers from dist test files without source-map indirection.
3. `node --test` supports custom reporters via `--test-reporter=<module-path>` and `--test-reporter-destination=<target>` (Node 20+). `engines.node` in root `package.json` is `>=18.0.0`; CI should use a version that includes reporter support. If local Node is 18.x, bump the runtime for this feature or document the minimum Node version.
4. The reporter must handle unmarked files gracefully: this ticket ships before Phase 2 (classification), so most files will lack markers initially. The reporter emits an "unclassified" bucket rather than failing.

## Architecture Check

1. **Cleaner than alternatives**: Consuming `node --test`'s own event stream (`test:pass`/`test:fail` events carrying `data.file`) places classification inside the test pipeline's data flow. Post-processing TAP/spec output is a symptom patch that breaks whenever node changes reporter format; running separate invocations per class defeats the "see all at a glance" goal and requires parallel file manifests that duplicate the in-file marker data. This approach aligns with FOUNDATIONS #9 (structured event record) and #15 (root-cause fix).
2. **Agnostic boundaries preserved**: Reporter lives in `packages/engine/scripts/` (test tooling). It never touches GameSpecDoc, GameDef, kernel, compiler, or runtime. Pure test-tooling concern.
3. **No backwards-compatibility shims**: Reporter replaces the default `node --test` reporter for engine test runs in one change. No alias flag, no "if marker then group else default" fallback. The `unclassified` bucket is a first-class output, not a legacy-support mode.

## What to Change

### 1. Create the reporter module

New file `packages/engine/scripts/test-class-reporter.mjs`:

- Exports a default async generator conforming to the `node --test` reporter contract.
- Consumes upstream events (`test:pass`, `test:fail`, `test:diagnostic`, `test:start`, etc.).
- On first encounter of a file path (from `event.data.file`), synchronously reads the file's first ~20 lines via `node:fs` and extracts the marker via regex `/^\/\/\s*@test-class:\s*(\S+)/m`. Caches the result in a `Map<filePath, class>`.
- Forwards upstream events unchanged to stdout (or pipes through `node --test`'s default spec reporter so individual test failures still print with details). Reporter chaining or dual reporter registration is acceptable — goal is no regression in failure debuggability.
- On stream end (or an explicit summary event), emits a grouped summary to stdout in a stable format:

  ```
  === Test Class Summary ===
  architectural-invariant: 412 pass, 0 fail
  convergence-witness:      84 pass, 2 fail (likely trajectory shift — evaluate)
  golden-trace:             12 pass, 0 fail
  unclassified:            210 pass, 0 fail (migrate to marker — Spec 133)
  ```

### 2. Wire the reporter into `run-tests.mjs`

Modify `packages/engine/scripts/run-tests.mjs`:

- In the `batched` execution branch (`plan.execution === 'batched'`), prepend `'--test-reporter=./scripts/test-class-reporter.mjs'` and `'--test-reporter-destination=stdout'` to the spawn args before `...plan.patterns`.
- In the `sequential` branch (used by the determinism lane), add the same flags to each per-pattern spawn.
- The reporter path is resolved relative to the `packages/engine` cwd where `run-tests.mjs` is invoked.

### 3. Unit-test the reporter

New file `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts`:

- File-top marker: `// @test-class: architectural-invariant` (tests a property-style invariant about event-stream-to-summary mapping).
- Construct a mocked async iterable of events mimicking `node --test` output. Feed to the reporter. Assert the emitted grouped summary matches expectation.
- Cover: all three classes, mixed pass/fail per class, unclassified bucket when marker absent, file-read caching (the reporter reads each file's header at most once per run).
- Use temp files or in-memory fixture strings for the mocked dist test files so the test is hermetic.

## Files to Touch

- `packages/engine/scripts/test-class-reporter.mjs` (new)
- `packages/engine/scripts/run-tests.mjs` (modify — both `batched` and `sequential` branches in `runExecutionPlan`)
- `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` (new)

## Out of Scope

- Corpus classification (tickets 003, 004, 005).
- Meta-test enforcing marker presence or mixed-shape detection (ticket 006).
- Testing.md guidance update (ticket 002).
- Aspirational 6-month staleness warning (§Required Invariant #3; deferred).
- Runner (`packages/runner/`) test classification — per spec §Out of Scope.

## Acceptance Criteria

### Tests That Must Pass

1. New `test-class-reporter.test.ts` passes — reporter correctly groups events by class across all three classes plus `unclassified`.
2. Reporter forwards raw pass/fail events so individual test failures remain fully debuggable (no silent swallowing of error output).
3. Existing engine suite: `pnpm -F @ludoforge/engine test` continues to pass after runner modification. Reporter must not alter pass/fail exit codes.
4. `pnpm -F @ludoforge/engine test:determinism` continues to pass under sequential execution with the new reporter flags.

### Invariants

1. Reporter output is deterministic: same event stream → same summary, stable bucket ordering.
2. Reporter never swallows test failures: if a test fails, exit code is non-zero regardless of class bucketing.
3. Marker file reads are cached per file path — each test file's header is read at most once per run.
4. Reporter functions correctly before corpus classification ships: files without markers land in the `unclassified` bucket without error.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` — unit-level coverage of event-stream consumption, class bucketing, unclassified handling, and per-file marker caching.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` — includes the new reporter unit test.
2. `pnpm -F @ludoforge/engine test` — full engine suite under the new reporter wiring.
3. `pnpm -F @ludoforge/engine test:determinism` — sequential lane with reporter attached.
4. `pnpm turbo build` — tsc compiles everything including the new test file.
5. `pnpm turbo lint` — lint covers both the script file and the new test.
6. `pnpm turbo typecheck`.

## Outcome

- Completed: 2026-04-18
- Landed `packages/engine/scripts/test-class-reporter.mjs` as a cached `node --test` reporter that preserves detailed spec output, groups pass/fail events by test class, and emits a stable end-of-run summary with an `unclassified` bucket for pre-classification files.
- Wired the reporter into both `batched` and `sequential` execution branches of `packages/engine/scripts/run-tests.mjs` and extended `packages/engine/test/unit/run-tests-script.test.ts` so both spawn shapes assert the reporter flags.
- Added `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` with a file-top `@test-class` marker plus coverage for class bucketing, stable summary ordering, unclassified fallback, detail passthrough, and per-file header-read caching.
- Boundary correction: the ticket-owned runner wiring remains limited to `run-tests.mjs` lanes. Direct `node --test` scripts such as `test:unit`, `test:performance`, and `test:memory` were verified-no-edit and remain out of scope for this ticket.
- Schema/artifact fallout checked: no schema or generated artifact changes were required beyond normal `dist/` build output.
- Verification run:
  - `pnpm turbo build`
  - `pnpm -F @ludoforge/engine test:unit`
  - `pnpm -F @ludoforge/engine test:determinism`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
