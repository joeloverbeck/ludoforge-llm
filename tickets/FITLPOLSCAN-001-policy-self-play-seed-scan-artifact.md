# FITLPOLSCAN-001: Policy Self-Play Seed Scan Artifact for FITL

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — engine-side reusable scan helper plus root executable wrapper
**Deps**: docs/FOUNDATIONS.md

## Problem

We currently catch FITL policy-agent failures opportunistically through individual fixed-seed tests. That is useful for regression locking, but it is the wrong long-term debugging loop for policy self-play quality:

- it does not systematically sweep seeds
- it does not produce a reusable artifact of failures
- it does not distinguish hard engine bugs from softer policy/runtime health signals

We need an executable seed-scan workflow that runs many FITL policy self-play seeds, records failures in a machine-readable artifact, and makes it easy to identify which seeds deserve follow-up investigation.

## Assumption Reassessment (2026-03-22)

1. The engine already exposes deterministic simulation entry points via `packages/engine/src/sim/simulator.ts` and the `packages/engine/src/sim/index.ts` barrel (`runGame`, `runGames`). Confirmed.
2. The authored policy path already exists via `packages/engine/src/agents/policy-agent.ts`. A scan tool does not need new policy execution semantics; it needs orchestration and reporting around existing semantics. Confirmed.
3. The current engine CLI is not the right immediate home for this work because `packages/engine/src/cli/index.ts` is still a stub. Corrected scope: implement a root executable in `scripts/` first, with a thin shell over reusable engine-side logic.
4. FITL production compilation is currently easy to access in tests through `packages/engine/test/helpers/production-spec-helpers.ts`, but an executable must not depend on test helpers. Corrected scope: the implementation must load the production FITL spec through canonical non-test CNL APIs or a reusable production-loader helper in non-test code.
5. Existing traces already carry enough signal for first-pass failure artifacts: thrown exceptions, stop reasons, warnings, move logs, and policy decision metadata. Confirmed. The first version does not require a new trace format.
6. `docs/FOUNDATIONS.md` prohibits game-specific branching in kernel/compiler/runtime, but it does not prohibit a top-level executable from targeting FITL. Correct boundary: any FITL-specific defaults stay in the script entry layer; reusable scan logic remains game-agnostic.

## Architecture Check

1. The clean design is a reusable, game-agnostic scan helper in engine-side simulation/orchestration code, with a thin root executable that selects FITL production inputs and writes artifacts. This is cleaner than a FITL-only monolithic script because it keeps scanning/reporting logic reusable while confining FITL specifics to the executable boundary.
2. This preserves the foundations boundary: no game-specific logic enters kernel/compiler/runtime. The helper operates on `GameDef`, agents, seeds, and scan policies generically; only the wrapper chooses FITL as the target fixture.
3. No backwards-compatibility shims or aliases are needed. The ticket should add one current executable path and its supporting helper, not parallel legacy variants.
4. The artifact format should be machine-readable and append-friendly. NDJSON for per-seed failures plus a summary JSON is cleaner than plain text logs because it supports later automation, replay tooling, and triage scripts.
5. Failure classification should separate hard failures from softer bug signals. Treating every non-terminal run as equivalent would create noisy artifacts that age poorly.

## What to Change

### 1. Add a reusable policy self-play seed-scan helper

Add a reusable engine-side helper, likely under `packages/engine/src/sim/` or a similarly appropriate engine-owned orchestration module, that:

- accepts a validated `GameDef`
- accepts an agent factory or explicit agent lineup
- accepts a seed range or explicit seed list
- runs deterministic self-play for each seed
- captures hard failures and configured bug-signal classifications
- returns a structured report suitable for serialization

The helper must stay game-agnostic. It should know nothing about FITL beyond the inputs it is passed.

### 2. Add a root executable for FITL policy self-play scanning

Add a root script in `scripts/` that:

- loads the FITL production spec through canonical non-test APIs
- constructs four `PolicyAgent` instances
- accepts CLI options such as:
  - `--seed-start`
  - `--seed-count`
  - `--seed-list`
  - `--max-turns`
  - `--players`
  - `--output-dir`
  - `--concurrency` if the implementation can preserve deterministic per-seed behavior cleanly
- runs the reusable scan helper
- writes artifacts to an explicit output directory

The wrapper may default to FITL for v1, but reusable scan logic must not bake FITL assumptions into engine code.

### 3. Define artifact outputs and failure classes

The first implementation should emit at least:

- `summary.json`
  - scan config
  - scanned seed count
  - passed seed count
  - failed seed count
  - counts by failure class
  - wall-clock timing summary
- `failures.ndjson`
  - one JSON record per failed or suspicious seed

Each failure record should include:

- `seed`
- `kind` (`exception`, `emergencyFallback`, `suspiciousStop`, `warningThreshold`, or similarly precise categories)
- concise message
- stop reason
- turns executed
- last move summary when available
- high-signal context from the end state or failure surface

The implementation should prioritize low-noise, obviously actionable failure classes:

- thrown `IllegalMoveError` or other kernel/runtime exceptions
- `agentDecision.emergencyFallback === true`
- unexpected `noLegalMoves` during a required-pending-grant situation or other explicitly-defined impossible states

Do not overfit v1 by inventing many heuristic classes that are difficult to trust.

### 4. Add a small package script or documented invocation

Expose the executable through a predictable command, for example a root `package.json` script, so scanning is easy to run and document in follow-up tickets or reports.

## Files to Touch

- `packages/engine/src/sim/*` (add reusable scan helper and exports)
- `packages/engine/src/sim/index.ts` (modify) — export the reusable scan helper
- `packages/engine/src/agents/policy-agent.ts` (modify only if the helper needs typed configuration reuse; avoid behavior changes)
- `scripts/*` (add) — FITL policy self-play scan executable
- `package.json` (modify) — add a script alias for the executable
- `packages/engine/test/unit/` or `packages/engine/test/integration/` (modify/add) — tests for the scan helper and artifact classification
- `scripts/*.test.mjs` or equivalent script-level test coverage (add if root-script parsing/serialization is non-trivial)

## Out of Scope

- Fixing any newly discovered FITL policy bugs
- Adding a full general-purpose engine CLI surface under `packages/engine/src/cli/`
- Persisting full per-seed enriched traces for every passing seed by default
- Adding game-specific failure heuristics beyond FITL-independent hard-failure and obvious bug-signal classes
- Parallel/distributed scan orchestration beyond a local single-machine executable

## Acceptance Criteria

### Tests That Must Pass

1. Running the executable across a small FITL seed range produces `summary.json` and `failures.ndjson` in the requested output directory.
2. Seeds that throw engine/runtime errors are captured as failure records with seed and error classification.
3. Seeds that trigger `PolicyAgent` emergency fallback are captured as failure records with a distinct failure kind.
4. The reusable scan helper remains game-agnostic and can be exercised without FITL-specific branching in engine internals.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Kernel/compiler/runtime remain game-agnostic; FITL selection stays in the executable boundary.
2. The scan helper consumes current engine APIs directly; no test-helper imports in production executable code.
3. Artifact formats are machine-readable and deterministic for the same scanned seeds and configuration.
4. No backwards-compatibility alias commands or duplicate executable paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/` or `packages/engine/test/integration/` coverage for the scan helper — prove that success/failure classification and summary aggregation work from generic simulation results.
   Rationale: the reusable helper is the architectural center of this ticket; its classification behavior must be proven without shelling out to the script.
2. Script-level test in `scripts/` for CLI parsing and artifact writing.
   Rationale: the executable boundary is where FITL defaults, output paths, and serialization can drift independently of the engine helper.
3. FITL-focused smoke coverage over a tiny seed window.
   Rationale: this proves the end-to-end wrapper can compile production FITL, run policy self-play, and emit artifacts without importing test-only helpers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/**/*.test.js`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm run check:ticket-deps`
