# FITLPOLSCAN-001: Policy Self-Play Seed Scan Artifact for FITL

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No — root executable and script-owned reporting helpers that consume existing public engine APIs
**Deps**: docs/FOUNDATIONS.md

## Problem

We already have explicit bounded FITL authored-policy regression coverage in engine tests, including fixed seeds 11 and 17. That is useful for locking known regressions, but it is still the wrong debugging loop for investigating broader policy self-play health:

- it does not systematically sweep seeds
- it does not produce a reusable artifact of failures
- it does not give us a lightweight operator-facing command for triaging new suspicious seeds outside the engine test suite

We need an executable seed-scan workflow that runs many FITL policy self-play seeds, records failures in a machine-readable artifact, and makes it easy to identify which seeds deserve follow-up investigation.

## Assumption Reassessment (2026-03-22)

1. The engine already exposes the deterministic simulation surface this workflow needs via `packages/engine/src/sim/simulator.ts` and the `packages/engine/src/sim/index.ts` barrel (`runGame`, `runGames`). Confirmed.
2. FITL authored-policy bounded self-play coverage already exists in `packages/engine/test/integration/fitl-policy-agent.test.ts` and `packages/engine/test/unit/prepare-playable-moves.test.ts`. Corrected problem statement: this ticket is about operator tooling and artifacts, not replacing missing baseline regression coverage.
3. The authored policy path already exists via `packages/engine/src/agents/policy-agent.ts`. A scan tool does not need new policy execution semantics; it needs orchestration and reporting around existing semantics. Confirmed.
4. The current engine CLI is not the right home for this work because `packages/engine/src/cli/index.ts` is still a stub and the requested workflow is operational tooling, not a kernel/runtime surface. Corrected scope: implement a root executable in `scripts/`.
5. FITL production compilation is already available through canonical non-test CNL APIs (`loadGameSpecBundleFromEntrypoint`, `runGameSpecStagesFromBundle`). Corrected scope: the executable must use those public APIs directly and must not import `packages/engine/test/helpers/production-spec-helpers.ts`.
6. Existing traces already carry enough signal for v1 artifacts: thrown exceptions, stop reasons, warnings, move logs, and policy decision metadata. The first version does not require a new trace format or simulator return type.
7. `docs/FOUNDATIONS.md` prohibits game-specific branching in kernel/compiler/runtime, but it does not prohibit a top-level executable from targeting FITL. Correct boundary: FITL-specific defaults stay in the script entry layer.
8. The current code does not justify treating `stopReason === "noLegalMoves"` as a failure signal by itself. Existing FITL bounded-policy tests explicitly permit `noLegalMoves`, `maxTurns`, or `terminal`, so v1 failure classes must stay low-noise and only capture definite breakage or explicit policy fallback.

## Architecture Check

1. The clean design is a root executable plus small script-owned helpers for argument parsing, FITL production compilation, scan aggregation, and artifact writing. Pushing this orchestration into `packages/engine/src/sim/` would mostly duplicate existing `runGame` ownership and would make operational artifact semantics look like engine contracts when they are not.
2. This preserves the foundations boundary: no game-specific logic enters kernel/compiler/runtime, and no new engine abstraction is added without evidence that `runGame` is insufficient.
3. No backwards-compatibility shims or aliases are needed. Add one current executable path and its test coverage.
4. The artifact format should be machine-readable and append-friendly. NDJSON for per-seed failure records plus a summary JSON is cleaner than plain text logs because it supports later automation and replay tooling.
5. Failure classification must stay low-noise. V1 should capture only definite failures or explicit emergency fallback, not every non-terminal or bounded stop condition.

## What to Change

### 1. Add a root executable for FITL policy self-play scanning

Add a root script in `scripts/` that:

- loads the FITL production spec through canonical non-test APIs
- constructs four `PolicyAgent` instances
- accepts CLI options such as:
  - `--seed-start`
  - `--seed-count`
  - `--seed-list`
  - `--max-turns`
  - `--output-dir`
  - `--trace-level`
- runs deterministic self-play sequentially for each requested seed
- writes artifacts to an explicit output directory

The script may factor pure helper functions into the same file or a script-local module if that keeps tests clean, but the workflow remains script-owned rather than engine-owned.

### 2. Define artifact outputs and failure classes

The first implementation should emit at least:

- `summary.json`
  - scan config
  - scanned seed count
  - passed seed count
  - failed seed count
  - counts by failure class
  - wall-clock timing summary
- `failures.ndjson`
  - one JSON record per failed seed

Each failure record should include:

- `seed`
- `kind` (`exception` or `emergencyFallback`)
- concise message
- stop reason
- turns executed
- last move summary when available
- high-signal context from the failure surface

The implementation should prioritize low-noise, obviously actionable failure classes only:

- thrown `IllegalMoveError` or other kernel/runtime exceptions
- `agentDecision.emergencyFallback === true`

Do not overfit v1 by inventing heuristic classes that are difficult to trust. `noLegalMoves`, `maxTurns`, warnings, and other bounded-stop facts may be counted or surfaced in `summary.json`, but they are not failures by themselves in v1.

### 3. Add a small package script or documented invocation

Expose the executable through a predictable command, for example a root `package.json` script, so scanning is easy to run and document in follow-up tickets or reports.

## Files to Touch

- `scripts/*` (add) — FITL policy self-play scan executable
- `package.json` (modify) — add a script alias for the executable
- `scripts/*.test.mjs` (add) — CLI parsing, scan aggregation, and artifact serialization coverage
- `scripts/*.test.mjs` or equivalent script-level test coverage (add if root-script parsing/serialization is non-trivial)

## Out of Scope

- Fixing any newly discovered FITL policy bugs
- Adding a full general-purpose engine CLI surface under `packages/engine/src/cli/`
- Adding a new engine-owned scan helper or simulator API unless implementation exposes a concrete missing engine capability
- Persisting full per-seed enriched traces for passing seeds by default
- Adding heuristic failure classes beyond explicit exceptions and emergency fallback
- Parallel/distributed scan orchestration beyond a local single-machine executable

## Acceptance Criteria

### Tests That Must Pass

1. Running the executable across a small FITL seed range produces `summary.json` and `failures.ndjson` in the requested output directory.
2. Seeds that throw engine/runtime errors are captured as failure records with seed and error classification.
3. Seeds that trigger `PolicyAgent` emergency fallback are captured as failure records with a distinct failure kind.
4. The executable uses existing public engine APIs directly; no test-helper imports in production executable code.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Kernel/compiler/runtime remain game-agnostic; FITL selection stays in the executable boundary.
2. The executable consumes current engine APIs directly; no test-helper imports in production executable code.
3. Artifact formats are machine-readable and deterministic for the same scanned seeds and configuration, except for explicit wall-clock timing fields.
4. No backwards-compatibility alias commands or duplicate executable paths are introduced.

## Test Plan

### New/Modified Tests

1. `scripts/fitl-policy-seed-scan.test.mjs` — cover CLI parsing, seed expansion, summary aggregation, failure classification, and artifact writing.
   Rationale: the script boundary is the architectural center of this ticket; the public contract is the executable and its artifacts, not a new engine helper.
2. FITL-focused script smoke coverage over a tiny seed window.
   Rationale: this proves the executable can compile production FITL, run policy self-play, and emit artifacts without importing test-only helpers.
3. Existing FITL policy-agent regression remains green.
   Rationale: the new tooling must not silently depend on engine behavior that current bounded authored-policy coverage contradicts.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test scripts/fitl-policy-seed-scan.test.mjs`
3. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - corrected the ticket scope away from a new engine-owned scan abstraction and toward a script-level FITL policy seed-scan executable that consumes existing engine build artifacts
  - added `scripts/fitl-policy-seed-scan.mjs` with deterministic seed expansion, FITL production compilation through canonical non-test CNL APIs, sequential self-play scanning, low-noise failure classification, and `summary.json` plus `failures.ndjson` artifact writing
  - added `scripts/fitl-policy-seed-scan.test.mjs` to cover CLI parsing, failure classification, aggregation, artifact serialization, and a tiny FITL production smoke scan
  - added the root package script alias `scan:fitl:policy`
- Deviations from original plan:
  - no engine source files changed, because `runGame` plus existing policy-trace metadata already provided the required scan surface and an engine-owned helper would have duplicated simulator ownership without adding a stronger architecture
  - v1 failure classification was intentionally narrowed to explicit exceptions and emergency fallback; `noLegalMoves`, `maxTurns`, and warnings are summarized but not treated as failures by themselves
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test scripts/fitl-policy-seed-scan.test.mjs` passed
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js` passed
  - `pnpm turbo test` passed
  - `pnpm turbo lint` passed
  - `pnpm turbo typecheck` passed
  - `pnpm run check:ticket-deps` passed
