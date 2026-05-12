# 167ARVNEVOHAR-003: Engine build script — drop unconditional clean

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/package.json` `build` script
**Deps**: `specs/167-arvn-evolution-harness-performance.md`

## Problem

`campaigns/fitl-arvn-agent-evolution/harness.sh:19` runs `pnpm -F @ludoforge/engine build`, which currently resolves to `node scripts/run-with-dist-lock.mjs "pnpm run clean && tsc"` per `packages/engine/package.json:33`. `pnpm run clean` deletes `dist/`, including `dist/tsconfig.tsbuildinfo`. `packages/engine/tsconfig.json:8` declares `composite: true` (which implies `incremental`), so tsc's incremental-compilation machinery is configured to consume that buildinfo file — but the file is wiped before every build, so tsc always pays the full cold-tree cost across ~700+ source files. The result is a multi-minute build step per harness invocation that incremental compilation already knows how to eliminate.

## Assumption Reassessment (2026-05-12)

1. `packages/engine/package.json:33` defines `"build": "node scripts/run-with-dist-lock.mjs \"pnpm run clean && tsc\""`. Confirmed. Spec §3.2 describes the script as `pnpm run clean && tsc`; the actual command is wrapped in `run-with-dist-lock.mjs` but the wrapped command string is the surface to change.
2. `packages/engine/package.json:34` defines `"clean": "rm -rf dist"`. Confirmed.
3. `packages/engine/tsconfig.json:8` sets `composite: true`. `incremental` is implied; no explicit `tsBuildInfoFile` override is needed — tsc writes `dist/tsconfig.tsbuildinfo` by default when `outDir` is `dist`. Confirmed.
4. `harness.sh:25-39` runs the full engine test suite as a regression gate. Any staleness from a missed-rebuild edge case fails the gate before the tournament phase. Confirmed; this is the architectural safety net for the change.
5. CI workflows that depend on `build` (root `turbo build` orchestration) inherit the new behavior. Confirmed by inspection of `turbo.json` and root `package.json` — no workflow asserts that `dist/` is wiped before build.

## Architecture Check

1. **Composite + incremental was already the intent**: the tsconfig declares `composite: true` precisely to enable buildinfo-driven incremental compilation. The `clean &&` prefix was actively defeating that design, not enforcing it. Removing the prefix restores the configured behavior.
2. **Foundation #14 (No Backwards Compatibility)** — the old behavior is preserved under a new explicit `build:clean` script, not a `build:legacy` shim. Anyone who wants a full rebuild invokes `build:clean` directly; the default is fast.
3. **Foundation #16 (Testing as Proof)** — the campaign harness's existing test-suite gate at `harness.sh:25-39` is the regression test for staleness. Any structural refactor that breaks the buildinfo's stale-detection heuristic will manifest as a test failure, not a silent runtime miscompilation.
4. **No game-specific branching**: change is to the engine build script only; no game-specific logic is added to the kernel, compiler, or runtime.

## What to Change

### 1. Replace the `build` script

In `packages/engine/package.json:33`:

- Change `"build": "node scripts/run-with-dist-lock.mjs \"pnpm run clean && tsc\""` to `"build": "node scripts/run-with-dist-lock.mjs \"tsc\""`.
- Add `"build:clean": "node scripts/run-with-dist-lock.mjs \"pnpm run clean && tsc\""` immediately after, preserving the old behavior for CI and manual full rebuilds.

The `clean` script itself (`rm -rf dist`) remains unchanged at `packages/engine/package.json:34` for use by `build:clean` and any direct invocation.

### 2. Verify no consumer assumes `dist/` is wiped

- `turbo.json` and root `package.json` orchestration: confirmed no `dist/`-wipe precondition.
- `packages/runner` build: consumes engine via the package exports (`./dist/src/...`); incremental compilation produces the same export surface as full rebuild, so the runner is unaffected.
- `packages/engine/scripts/run-with-dist-lock.mjs`: serializes concurrent build invocations; the wrapper is preserved unchanged.

### 3. No `tsconfig.json` change

Spec §3.2: "tsconfig.json is left as-is (`composite: true` is sufficient — `incremental` is implied)." Confirmed; do not add an explicit `tsBuildInfoFile` setting (tsc defaults are fine and adding one risks divergence between local and CI buildinfo locations).

### 4. Update package documentation (if any)

If `docs/architecture.md` or any README references the build script behavior, update prose accordingly. Quick grep before implementing; if no references exist, skip this sub-step.

## Files to Touch

- `packages/engine/package.json` (modify)
- `packages/engine/test/unit/lint/build-script-incremental-policy.test.ts` (renamed from `build-script-clean-policy.test.ts`; owned stale guard fallout for the retired clean-before-compile invariant)

## Out of Scope

- Changes to `tsconfig.json` (spec §3.2 explicitly preserves it).
- Changes to `scripts/run-with-dist-lock.mjs` (the wrapper is preserved).
- Changes to `harness.sh` (it continues to call `pnpm -F @ludoforge/engine build`; the change is transparent).
- Scoping the test-suite regression gate to a smoke lane (spec §10 — out of scope; would require updating `program.md:124`).

## Acceptance Criteria

### Tests That Must Pass

1. Manual: `pnpm -F @ludoforge/engine build` from a clean tree produces `dist/tsconfig.tsbuildinfo`; a second `pnpm -F @ludoforge/engine build` invocation is measurably faster (incremental skip on unchanged files) and the buildinfo file is preserved.
2. Manual: `pnpm -F @ludoforge/engine build:clean` wipes `dist/` and rebuilds from scratch (legacy behavior).
3. Existing suite: `pnpm -F @ludoforge/engine test` passes against the dist artifacts produced by the new incremental build.
4. End-to-end: `SEED_COUNT=2 bash campaigns/fitl-arvn-agent-evolution/harness.sh` succeeds; the second consecutive invocation has a measurably shorter "Building engine..." step.

### Invariants

1. **Incremental correctness**: a tsc rebuild after a source-file edit emits the changed file's compiled output and updates the buildinfo file; the test suite continues to pass.
2. **Full-rebuild availability**: `build:clean` remains available for any consumer that requires a known-fresh `dist/`.
3. **No silent CI regression**: CI workflows that invoke `build` inherit incremental behavior; any workflow that requires a clean rebuild must explicitly call `build:clean`. (Spec §3.2 acknowledges this risk; the regression gate is the test suite.)

## Test Plan

### New/Modified Tests

No new automated test. The behavior is verified by the existing test suite running against the incrementally-built `dist/`, plus manual stopwatch comparison on two consecutive `build` invocations.

### Commands

1. `pnpm -F @ludoforge/engine clean && time pnpm -F @ludoforge/engine build` (first build — cold).
2. `time pnpm -F @ludoforge/engine build` (second build — incremental; should be substantially faster).
3. `pnpm -F @ludoforge/engine build:clean` (verify legacy path still works).
4. `pnpm -F @ludoforge/engine test` (regression parity).
5. `pnpm turbo build && pnpm turbo test` (Turbo-orchestrated parity).
6. `SEED_COUNT=2 bash campaigns/fitl-arvn-agent-evolution/harness.sh` (end-to-end).

## Outcome

Completion date: 2026-05-12

### Implementation Notes

- `packages/engine/package.json` now runs the default engine build as `node scripts/run-with-dist-lock.mjs "tsc"`, preserving `dist/tsconfig.tsbuildinfo` across consecutive builds.
- Added explicit `build:clean` as `node scripts/run-with-dist-lock.mjs "pnpm run clean && tsc"` for consumers that require a known-fresh `dist/`.
- Renamed and rewrote the stale clean-policy guard to `packages/engine/test/unit/lint/build-script-incremental-policy.test.ts`; it now proves the default build does not clean and `build:clean` still cleans before compiling.
- `tsconfig.json`, `scripts/run-with-dist-lock.mjs`, and `campaigns/fitl-arvn-agent-evolution/harness.sh` were verified-no-edit; the wrapper and harness continue to call the same build entrypoint.
- Generated fallout: `packages/engine/dist` and `dist/tsconfig.tsbuildinfo` were rebuilt during proof only; no schema, golden, or checked-in generated artifact diff persisted.
- Deferred sibling scope: GameDef cache remains `tickets/167ARVNEVOHAR-004.md`; worker-thread shard pool remains `tickets/167ARVNEVOHAR-005.md`; baseline report remains `tickets/167ARVNEVOHAR-006.md`.

### Verification

- `pnpm -F @ludoforge/engine clean` — passed before cold-build proof.
- `/usr/bin/time -p pnpm -F @ludoforge/engine build` — passed cold after clean; `real 18.49`; produced `packages/engine/dist/tsconfig.tsbuildinfo`.
- `/usr/bin/time -p pnpm -F @ludoforge/engine build` — passed immediately after; `real 2.24`; buildinfo preserved, proving incremental skip on unchanged files.
- `/usr/bin/time -p pnpm -F @ludoforge/engine build:clean` — passed; `real 16.96`; exercised the explicit clean rebuild path.
- Temporary source-edit probe in `packages/engine/src/kernel/index.ts` — passed; incremental rebuild emitted the temporary marker into `dist/src/kernel/index.js`, then a cleanup rebuild removed it. No temporary source diff remains.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/lint/build-script-incremental-policy.test.js` — passed, 5/5 tests.
- `pnpm -F @ludoforge/engine test` — passed, schema artifact check plus default lane summary `66/66 files passed`.
- `pnpm turbo build` — passed, 3/3 tasks successful.
- `pnpm turbo test` — passed, 5/5 tasks successful.
- `SEED_COUNT=2 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `completed=2`, `truncated=0`, `errors=0`, `real 161.27`.
- Second consecutive `SEED_COUNT=2 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `completed=2`, `truncated=0`, `errors=0`, `real 155.21`.
- Non-final diagnostic lane: one accidental default-seed harness invocation ran with `SEED_COUNT` omitted, used the current `seed-tier.txt` value of 15, and passed with `completed=15`, `truncated=0`, `errors=0`, `real 944.63`. It is not cited as the ticket's exact end-to-end acceptance lane.
- `pnpm run check:ticket-deps` — passed after terminal status update; `4 active tickets and 2311 archived tickets`.

### Invariant Proof Matrix

| Invariant | Witness/assertion | Status | Proof lane |
|---|---|---|---|
| Incremental correctness | Clean build produced `dist/tsconfig.tsbuildinfo`; unchanged second build was faster; temporary source edit emitted updated JS and cleanup rebuild removed it | proven | timed build pair + source-edit probe |
| Full-rebuild availability | `build:clean` runs clean before `tsc` and succeeds | proven | timed `pnpm -F @ludoforge/engine build:clean` + lint guard |
| No silent CI regression | Engine default tests, Turbo build, Turbo test, and real harness regression gate pass against the new default build output | proven | engine test, turbo build/test, repeated `SEED_COUNT=2` harness |

### Closeout Notes

- Ticket corrections applied: stale guard expectation `build must clean before tsc` -> live contract `default build preserves dist; build:clean cleans before tsc`.
- Runtime surface breadth: build tooling only; no engine/kernel runtime behavior changed.
- Source-size ledger: not applicable; touched source/test/package files are below repo guidance and no retained source growth is near the cap.
- Late-edit proof validity: terminal status, proof transcription, and ticket-dependency checker transcription only after final lanes; no code, test, command semantics, acceptance boundary, dependency owner, or follow-up scope changed after the cited proof lanes.
