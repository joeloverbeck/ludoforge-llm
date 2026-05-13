# 170PARTVISOBS-003: WASM score-row parity for `topNVisible` and `partial.lowerBound`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts` (host-side phase/schedule value encoding for the WASM bytecode route), `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (focused equivalence witness), associated WASM build artifacts only if the Rust guest changes during implementation
**Deps**: `archive/tickets/170PARTVISOBS-002.md`

## Problem

Foundation #5 (One Rules Protocol) mandates that the simulator, web runner, and AI agents use the same legality and resolution logic. The TypeScript policy runtime gained the `topNVisible` branch and the `partial.lowerBound` resolution variant in ticket 002; the WASM policy score-row route must produce identical scoring rows for the same fixtures. Without this ticket, any deployment that exercises the WASM path (browser runner, future native bindings) diverges from the TS path on partial-visibility-bearing boundaries.

Live reassessment on 2026-05-13 found that the current WASM bytecode architecture does **not** contain a Rust schedule-distance opcode handler. The TypeScript host resolves phase/schedule refs into encoded feature values in `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts`, then the Rust guest loads those pre-encoded values through `FEATURE_PHASE_INTRINSIC | FEATURE_SCHEDULE_DISTANCE`. Therefore this ticket owns the live host-encoded WASM score-row parity seam: encode `topNVisible` / `partial.lowerBound` schedule-distance values before bytecode execution, prove the Rust WASM score-row route is activated, and prove the resulting rows match the TypeScript evaluator. A deeper Rust ABI redesign remains out of scope unless a later ticket explicitly moves schedule resolution into the guest VM.

## Assumption Reassessment (2026-05-13)

1. `packages/engine-wasm/policy-vm/src/lib.rs` is the WASM policy VM entry point, but it does not host a schedule-distance resolver. It loads `FEATURE_SCHEDULE_DISTANCE` as a pre-encoded feature value. The live implementation hook is `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts`.
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` exists and already contains broad bytecode equivalence coverage, but it is over the repo's 800-line guidance. The new witness should live in an adjacent focused test file, `policy-bytecode-equivalence-partial-visibility.test.ts`, reusing shared fixtures/helpers where practical instead of growing the oversized file.
3. The 15-seed baseline (`baseline seeds`) referenced in spec 170 §7 Phase 2 and §8.4 is the same seed pool used by `policy-bytecode-equivalence` for spec 169 — confirm the seed set by reading the test setup before extending the fixture.
4. WASM phase/schedule refs use the existing host-side feature-value encoding shape (`tag`, `raw`) before Rust bytecode evaluation. Extending `partial.lowerBound` requires host encoding of the numeric fallback value used by the score-row route and a test harness witness that distinguishes activated WASM support from fallback-only success.
5. WASM rebuild pipeline is `pnpm -F @ludoforge/engine-wasm build`; run it only if Rust guest code or checked-in guest artifacts change.

## Architecture Check

1. **One rules protocol (Foundation #5)**: This ticket exists precisely to preserve the foundation — the TS and WASM paths must be byte-identical for the same `(GameDef, GameState, seed)` triple. The bytecode-equivalence test is the enforcement mechanism; extending it covers the new resolution kind.
2. **Determinism (Foundation #8)**: Host encoding must produce the same deterministic numeric values that the TypeScript evaluator consumes, and the Rust guest must load/evaluate those values without fallback masking.
3. **Bounded computation (Foundation #10)**: The host visible-prefix scan matches the TS-side O(maxItems) bound; `maxItems` remains a compile-time validated property of the compiled boundary schedule.
4. **Engine agnosticism (Foundation #1)**: The host path consumes generic observer-policy metadata (kind enum + zone-id list + maxItems integer) — no game-specific logic.
5. **No backwards-compat shims (Foundation #14)**: Boundaries without `observerPolicy` continue through the existing spec-169 host-encoded schedule path. No alias or compatibility branch is introduced.

## Boundary Reset Authorization (2026-05-13)

User-approved option 1 after a `docs/FOUNDATIONS.md` reassessment: narrow/proof-correct the ticket to the live host-encoded WASM score-row parity seam. Scope effect: proof-only correction plus stale implementation-locus correction. Durable owner: this ticket owns host encoding, activated WASM score-row parity, and focused equivalence proof; no Rust guest schedule resolver or ABI redesign is owned here.

## What to Change

### 1. Host-side WASM phase/schedule encoding in `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts`

Extend the existing schedule-distance host encoder to mirror the TypeScript policy runtime for `cardDraw` / `cards` refs whose target boundary declares `observerPolicy.kind === 'topNVisible'`:

- Read the ordered visible-prefix zones from the compiled boundary schedule.
- Scan at most `maxItems` cards across those zones in declared order.
- Evaluate the encoded card selector predicate with the same card-tag semantics as the TypeScript runtime.
- On match, return the exact numeric distance (`scanned`) through the existing WASM feature-value encoding so downstream bytecode receives the same number as the TS path.
- On visible-prefix exhaustion, return the `partial.lowerBound` numeric according to `scheduleFallback.onPartial.visiblePrefixExhausted` semantics for score-row evaluation:
  - `useLowerBound` -> lower-bound value.
  - `constant` -> constant value.
  - `noContribution` -> zero and `scheduleFallbackFired`.
  - `dropConsideration` -> dropped row.
- When observer policy is absent, preserve the existing spec-169 public-deck path.

The encoder must not read the hidden draw zone when `topNVisible` is active.

### 2. WASM score-row fallback metadata

Update the host-side WASM score-row route as needed so partial fallback metadata matches the TypeScript evaluator for the ticket-owned fallback kinds. The final witness must assert score parity and the expected `scheduleFallbackFired` row for a partial fallback that fires.

### 3. Focused bytecode-equivalence test fixture extension

Extend `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` and add `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` with a fixture exercising:

- A synthetic profile that uses `schedule.distance.toBoundary.<X>.cards` with `scheduleFallback: { onUnavailable: noContribution, onPartial: { visiblePrefixExhausted: useLowerBound } }`.
- A synthetic GameDef declaring `observerPolicy: { kind: topNVisible, visiblePrefix: { zones: [...], maxItems: 2 } }` on the test boundary.
- State variants that produce both `ready` and `partial.lowerBound` resolutions.

The new test follows the same route as the existing spec-169 schedule equivalence rows but remains focused so the existing oversized broad test file does not grow further.

### 4. WASM build pipeline

If Rust guest code changes, rebuild the WASM binary and confirm the JS test harness picks up the new guest. If the host-only encoding path is sufficient, run the existing WASM loader/score-row proof against the current binary and record that no guest artifact changed.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts` (modify) — extend host-side schedule-distance value encoding for the WASM score-row route.
- `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` (modify) — add topNVisible + partial.lowerBound fixture.
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (new) — focused route-activation and parity witness.
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (verified-no-edit unless shared helpers must move) — existing broad equivalence file is already over repo guidance.
- `packages/engine-wasm/policy-vm/src/lib.rs` (verified-no-edit unless live implementation proves guest changes are required) — no schedule-distance opcode handler exists in the current guest.
- `packages/engine-wasm/dist/` or `pkg/` (regenerated only if Rust guest changes and artifacts are checked in).

## Out of Scope

- TypeScript-side resolver, fallback evaluator, or trace surface changes — those landed in ticket 002.
- FITL data authoring — deferred to ticket 004.
- Compiler diagnostics — landed in ticket 001.
- Schedule kinds beyond `cardDraw`.
- Rust guest schedule-resolution or ABI redesign. The live architecture host-encodes phase/schedule refs before guest bytecode execution.

## Acceptance Criteria

### Tests That Must Pass

1. Focused bytecode-equivalence partial-visibility witness — WASM score-row route is activated and TS/WASM paths produce identical scoring rows across representative ready and `partial.lowerBound` states.
2. Existing spec-169 bytecode-equivalence rows unchanged.
3. Existing suite: `pnpm turbo test` — no regressions.
4. WASM rebuild/artifact determinism is required only when Rust guest code or guest artifacts change; this host-only encoding slice leaves the guest artifact unchanged and verifies the current guest through the loader/score-row route.

### Invariants

1. **Bilateral equivalence**: for the same `(GameDef, GameState, seed, encoded feature input)` triple, the TS evaluator and activated WASM score-row route produce equal score rows for ready and partial schedule-distance states.
2. **Backward compatibility for non-policy-bearing boundaries**: schedule-distance refs whose target boundary carries no observer-policy metadata produce identical output to today's WASM host-encoded schedule path.
3. **Deterministic encoding**: the encoded result for a given resolution is canonical and byte-stable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` (modify) — append a topNVisible + partial.lowerBound fixture variant per spec §8.4.
2. `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (new) — assert activated WASM score-row support and parity for the new fixture.

Test class headers per `.claude/rules/testing.md`:
- The focused equivalence test is `architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build` — rebuild WASM only if Rust guest changes.
2. `pnpm -F @ludoforge/engine build` then `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` — focused equivalence verification.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
4. `pnpm turbo test` — full suite.

## Outcome (2026-05-13)

Implemented under the user-approved option 1 boundary reset:

- Extended `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts` so the live host-side WASM phase/schedule encoder mirrors the TypeScript resolver for `topNVisible` card-distance refs. It scans only declared public visible-prefix zones, respects `maxItems`, returns exact ready distances, and exposes `partial.lowerBound` as the encoded lower-bound value for the ticket-owned `useLowerBound` score-row route.
- Updated `packages/engine/src/agents/policy-wasm-runtime.ts` so the WASM score-row route no longer fails closed for `topNVisible` considerations when the declared partial fallback is one of the TypeScript evaluator's `onPartial.visiblePrefixExhausted` variants; it records `scheduleFallbackFired` with `reason: partial.lowerBound.visiblePrefixExhausted` when the host encoder observed a partial lower-bound resolution.
- Added `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` as the focused equivalence witness instead of growing the already oversized broad equivalence test file.
- Extended `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` with the `topNVisible` schedule fallback consideration used by the focused witness.
- Verified-no-edit: `packages/engine-wasm/policy-vm/src/lib.rs` and WASM guest artifacts. The live Rust guest does not own schedule resolution for this path; no ABI/version/layout change was needed.

Post-review correction (2026-05-13):

- Extended the focused WASM parity cleanup from the initial `useLowerBound` witness to every TypeScript-supported partial fallback kind: `useLowerBound`, `noContribution`, `dropConsideration`, and `constant`. This satisfied the retained `What to Change` fallback-variant deliverable without reopening the ticket or creating a follow-up.
- Added a clamp-sensitive `constant` fallback witness so the WASM route follows the TypeScript partial fallback branch before generic score-row clamping.

Outcome amended: 2026-05-13

Ticket corrections applied:

- `Rust schedule-distance opcode handler` -> live host-encoded `FEATURE_SCHEDULE_DISTANCE` value seam in `policy-wasm-phase-schedule-encoding.ts`.
- `policy-bytecode-equivalence.test.ts` extension -> adjacent focused `policy-bytecode-equivalence-partial-visibility.test.ts`, because the broad file was already over the repo's 800-line guidance.
- `WASM rebuild required` -> not required for this host-only encoding change; the existing WASM loader/score-row proof exercises the current guest binary.

Deferred sibling/spec scope:

- `tickets/170PARTVISOBS-004.md` still owns FITL data authoring, cookbook docs, and FITL golden trace.
- A future Rust guest schedule resolver or ABI redesign remains out of scope unless a later ticket explicitly moves schedule resolution across the FFI boundary.

Generated/artifact fallout:

- No schema artifacts, goldens, or WASM guest artifacts are expected to persist as diffs.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any |
| --- | ---: | ---: | --- | --- | --- | --- |
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1192 | 1310 | no, preexisting oversize | yes, +118 net lines | canonical WASM score-row route; extraction would widen this ticket beyond the fallback-metadata seam and obscure the reviewed parity fix | none |
| `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` | 828 | 828 | no, preexisting oversize | no | new witness placed in adjacent focused test file | none |

Invariant proof matrix:

| Invariant | Witness/assertion | Status | Proof lane |
| --- | --- | --- | --- |
| Bilateral equivalence for ready topNVisible schedule refs | ready second-visible-slot case matches TS scores and returns `supported` WASM rows | proven | focused partial-visibility equivalence test |
| Bilateral equivalence for every TypeScript-supported `partial.lowerBound` fallback kind | partial visible-prefix-exhaustion rows for `useLowerBound`, `noContribution`, `dropConsideration`, and `constant` match TS scores and record `scheduleFallbackFired` | proven | focused partial-visibility equivalence test |
| Existing spec-169 schedule rows unchanged | existing phase/schedule equivalence rows still pass | proven | existing bytecode-equivalence test |
| No Rust guest ABI drift | `lib.rs` and guest artifacts verified-no-edit; host/guest ABI constants unchanged | proven | git diff/status plus `pnpm turbo build` |

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `pnpm -F @ludoforge/engine-wasm build` | not run directly because no Rust guest changes; `pnpm turbo build` replayed the engine-wasm build cache | no Rust guest or artifact diff; current guest exercised by WASM loader/score-row tests |
| Test Plan | `pnpm -F @ludoforge/engine test packages/engine/test/integration/policy-bytecode-equivalence.test.ts` | replaced by build + focused compiled Node lanes | `pnpm -F @ludoforge/engine build`; focused new test; existing equivalence test |
| Test Plan | `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` | split and run directly | all three passed |
| Test Plan | `pnpm turbo test` | run directly | passed |

Verification:

- `pnpm -F @ludoforge/engine build` — passed before broad lanes; passed again after post-review fallback-variant cleanup.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` — passed before broad lanes, again after `pnpm turbo test`, and again after post-review fallback-variant cleanup (2 tests).
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed after post-review fallback-variant cleanup, 9 tests.
- `pnpm turbo build` — passed; `@ludoforge/engine-wasm:build` was a cache-hit replay with no Rust diff.
- `pnpm turbo lint` — passed after adding explicit return types to the new helpers; passed again after post-review fallback-variant cleanup.
- `pnpm turbo typecheck` — passed; passed again after post-review fallback-variant cleanup.
- `pnpm turbo test` — passed before review cleanup; passed again after post-review fallback-variant cleanup, 5 successful tasks and engine default summary 78/78 files passed.
- `pnpm run check:ticket-deps` — passed before archival, then passed again after archival/stale-reference repair for 1 active ticket and 2332 archived tickets.

Late-edit proof validity:

- Post-review cleanup changed `packages/engine/src/agents/policy-wasm-runtime.ts`, `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts`, and `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` to cover every TypeScript-supported partial fallback kind, including the clamp-sensitive `constant` case. Affected proof was rerun with `pnpm -F @ludoforge/engine build`, the focused partial-visibility bytecode equivalence test, the existing bytecode equivalence test, `pnpm turbo build`, `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm turbo test`.
