# Spec 133: Regression Test Classification Discipline

**Status**: COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: none
**Related (archived; COMPLETED)**: Spec 17 [pending-move-admissibility], Spec 16 [template-completion-contract], Spec 132, ticket series `132AGESTUVIA-001..009`, `126FREOPEBIN-001..009`
**Source**: Post-ticket analysis from the Spec 17 §4 completion session (2026-04-17/18). That session fixed four CI failures (`fitl-events-an-loc`, `fitl-seed-1000-draw-space`, `fitl-policy-agent-enumeration-hang` seed 1012, `fitl-events-tutorial-gulf-of-tonkin` mixed-piece-types, `fitl-policy-agent-canary` seed 2046) — of which exactly one (An Loc) was a real kernel regression. The other four were regression tests that had pinned kernel-version-specific RNG trajectories as if they were architectural invariants; when the kernel legitimately evolved, the pins failed without surfacing any real bug.

## Overview

Repo-level discipline that distinguishes, at the test-file level, between three fundamentally different kinds of regression assertion:

1. **Architectural invariants** — properties that MUST hold across every legitimate kernel evolution. Example: "`applyMove` succeeds iff the classifier says admissible." Breaking these is always a bug.
2. **Convergence witnesses** — point-in-time observations that a particular seed / agent-profile / kernel combination produces a particular trajectory or outcome. Example: "seed 1012 at ply 59 has `activePlayer === 0` with 8 legal moves including card-70." Breaking these is a signal that *something* changed, which may or may not be a bug.
3. **Golden traces** — byte-exact trajectory pins used as determinism proofs. Example: "seed S on GameDef hash H produces move sequence M with final stateHash Z." Breaking these requires explicit re-blessing.

Each test file declares its class, and the allowed assertion shapes differ per class.

## Problem Statement

The existing test corpus intermixes all three classes without labels. Authors default to (2) because it is the easiest to write (run the sim, assert what happened), but (2) then lives alongside (1) in CI and gets treated as equally authoritative. When a kernel evolution legitimately shifts trajectories:

- The (1) architectural tests stay green — correctly.
- The (2) convergence witnesses fail — but their failure tells the engineer nothing about whether the underlying invariant was violated.
- The (3) golden traces fail — but they are supposed to, and the re-blessing step exists precisely for that.

Without the label, every CI failure is treated as a potential regression requiring investigation, which (a) wastes engineer attention, (b) incentivizes writing "safer" weaker tests to avoid churn, and (c) risks *hiding* real regressions when an engineer batch-softens a mix of (1)/(2)/(3) failures into all-(2) to land a change.

## Goals

- Every engine-level test file in `packages/engine/test/` declares its class via a file-top marker.
- CI behavior and update-protocol guidance are formalized per class.
- `code-reviewer` and `tdd-guide` agent prompts consume the classification when evaluating new/changed tests.
- Retroactive classification of the existing corpus.

## Non-Goals

- No removal, weakening, or strengthening of any existing specific assertion.
- No new test runner, no new test framework, no new dependencies.
- No game-specific classification rules (engine-agnostic).

## Definitions

### Architectural invariant test

A test whose assertions hold for **every** legitimate `(GameDef, kernel-version, agent-profile)` triple that compiles successfully. Examples:

- "every enumerated legal move is classifier-admissible" (Spec 17 [pending-move-admissibility] §3 cross-pathway invariant)
- "completion returns exactly one of `completed | structurallyUnsatisfiable | drawDeadEnd | stochasticUnresolved`" (Spec 16 [template-completion-contract] §1)
- "`applyMove(M)` is deterministic given `(def, state, seed, M)`" (FOUNDATIONS #8)

Breaking one of these is unambiguously a bug.

### Convergence witness test

A test whose assertions describe what **happens** on a specific seed / agent-profile / kernel combination, chosen as a witness of a past fix. Examples:

- "seed 1012 at ply 59 has `activePlayer === 0` with 8 legal moves" (former ply-59 hotspot witness)
- "Gulf of Tonkin unshaded moves exactly 6 pieces under seed 1101n" (pre-Spec-16 sampler witness)
- "seed 2046 reaches `terminal` within 300 moves" (post-126FREOPEBIN convergence witness)

Breaking one of these means the trajectory shifted. Whether that is a bug depends on the change that caused it.

### Golden trace test

A test that compares a full move sequence or serialized final state to a pinned expected value. Example: the existing `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`. Breaking one is expected whenever the kernel evolves and requires explicit re-blessing via a named commit.

## Contract

### 1. File-top declaration

Every engine test file matching `packages/engine/test/**/*.{test.ts,test.mts}` — `helpers/`, `fixtures/`, and compiled `dist/` output are excluded — MUST begin with one of:

```ts
// @test-class: architectural-invariant
```

```ts
// @test-class: convergence-witness
// @witness: <short-id-of-the-past-fix>
```

```ts
// @test-class: golden-trace
```

Markers are single-line comments so they are cheap to author and trivial to parse with a single regex. TypeScript `tsc` preserves `//` comments into `dist/`, so the same marker is visible to source-walking lints and to the dist-level CI reporter without any source-map indirection.

Tests that legitimately mix classes (e.g., an integration file that asserts both an invariant and a witness) MUST be split into separate files.

### 2. Allowed assertion shapes per class

- **architectural-invariant**: assertions MUST quantify over a range (`for each move M in legalMoves ...`) or describe a property invariant under all inputs. No seed-specific `assert.equal(trace.moves.length, N)`, no `activePlayer === 0`-style pins.
- **convergence-witness**: assertions MAY pin specific trajectory values; the file header MUST cite the past fix via `// @witness: <id>`. The witness's re-validation protocol (see §3) takes precedence over strict invariance.
- **golden-trace**: assertions compare against serialized fixtures under `packages/engine/test/fixtures/**`. Updates require a commit message body `Re-bless golden trace: <test-file>` and a human-readable reason.

### 3. Update protocol per class

When a kernel change causes a test failure:

- **architectural-invariant failure** → diagnose and fix the kernel. Test is not modified.
- **convergence-witness failure** → evaluate whether the trajectory change is legitimate. If yes: either (a) retarget the witness to the new trajectory with the same ticket/fix reference, or (b) promote the witness to an architectural-invariant assertion by distilling the underlying property. If not: kernel fix.
- **golden-trace failure** → re-bless only if the spec change that caused the shift is named in the commit body. Otherwise kernel fix.

### 4. CI reporting

CI output MUST group failures by class so an engineer can see at a glance: "3 architectural-invariant failures (investigate kernel), 8 convergence-witness failures (likely trajectory shift), 2 golden-trace failures (re-bless expected)."

**Implementation**: a custom `node --test` reporter at `packages/engine/scripts/test-class-reporter.mjs`. The reporter consumes the structured event stream `node --test` already emits (`test:pass`, `test:fail`, each carrying the test's file path), reads the `// @test-class:` marker from the dist test file on first encounter (cached per file), and emits a grouped summary keyed by class. `packages/engine/scripts/run-tests.mjs` passes `--test-reporter=./scripts/test-class-reporter.mjs --test-reporter-destination=stdout` to each spawned `node --test` invocation in both the batched and sequential execution branches. This keeps the classification in the test pipeline's own event stream rather than post-processing text output.

### 5. New-test default

When authoring a new test: start by writing the **architectural-invariant** version if possible. Only fall back to **convergence-witness** if the property is inherently seed- or profile-specific.

## Required Invariants

1. Every `.test.ts` / `.test.mts` file under `packages/engine/test/**` (excluding `helpers/`, `fixtures/`, and compiled `dist/` output) carries exactly one `@test-class` marker.
2. No test file contains both convergence-witness assertions and architectural-invariant assertions (enforced by a lint check).
3. A convergence-witness file whose witness fix is archived for >6 months AND whose assertion set has never been retightened emits a warning in CI: either re-validate or promote. *The detection mechanism (resolving `@witness <id>` to an archive date and detecting retightening across commit history) is aspirational for MVP; initial implementation may emit the warning from a manually maintained quarterly audit list until automated tracking is built.*

## Foundations Alignment

- **FOUNDATIONS #8 Determinism Is Sacred**: determinism belongs in golden-trace and architectural-invariant classes; convergence is a different axis.
- **FOUNDATIONS #9 Replay, Telemetry, and Auditability**: the custom reporter emits structured, deterministic, class-grouped test results — aligning CI output with the "structured event record" principle rather than ad-hoc text post-processing.
- **FOUNDATIONS #10 Bounded Computation**: "games terminate" is an architectural invariant (as bounded stop reasons); "terminates at 'terminal' within N moves" is a convergence witness.
- **FOUNDATIONS #14 No Backwards Compatibility**: Phase 2 classifies the entire existing engine corpus in the same change that introduces the marker rule — no "unmarked tolerated" transition mode.
- **FOUNDATIONS #15 Architectural Completeness**: symptom patches (witness pins) should evolve toward root-cause assertions (invariants) over time; the reporter sits in the test pipeline's data flow rather than patching its output downstream.
- **FOUNDATIONS #16 Testing as Proof**: the existing "testing as proof" rule is strengthened — *what* the test proves is now first-class metadata, not implicit.

## Required Proof

### New files

- `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` — walks every engine test file matching §1's scope, asserts:
  - exactly one `@test-class` marker per file
  - `convergence-witness` files cite a `@witness` id
  - no file mixes shapes across classes
- `packages/engine/scripts/test-class-reporter.mjs` — the custom `node --test` reporter described in §4.
- `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` — asserts that a mocked `node --test` event stream across multiple classes produces the expected grouped summary.

### Migration coverage

A script (invoked by the marker-validation test) classifies the existing corpus — approximately 725 `.test.ts` / `.test.mts` files across the `unit/`, `integration/`, `e2e/`, `determinism/`, `performance/`, and `memory/` lanes — and writes a report. Initial targets surfaced by the Spec 17 §4 session:

- `packages/engine/test/integration/fitl-events-an-loc.test.ts` → **architectural-invariant**. This is the positive example: the one Spec 17 §4 failure that was a real kernel regression, proving the test guards a genuine invariant rather than an RNG trajectory.
- `packages/engine/test/integration/fitl-seed-1000-draw-space.test.ts` → **convergence-witness**, `@witness: spec-132-template-completion-contract`
- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` → **convergence-witness**, `@witness: 132AGESTUVIA-001`
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` → **requires per-`it`-block inspection**. Commit 820072e3 already rewrote the mixed-piece-types block around an architectural intent ("assert architectural properties, not RNG-specific trajectories"), so some blocks are now architectural-invariant; others (e.g., agent-completion tests against specific templates) may remain convergence-witness. Phase 2 splits the file only where per-block inspection finds actual mixing.
- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` → **architectural-invariant** (bounded stop reasons + deterministic replay) after the 2026-04-18 softening (commit 820072e3).
- `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` → **architectural-invariant**
- `packages/engine/test/integration/classified-move-parity.test.ts` → **architectural-invariant**

**Witness id convention**: `<spec-or-ticket-id>[-<short-slug>]`, pointing to the archived artifact where the fix originated (e.g., `spec-132-template-completion-contract`, `132AGESTUVIA-001`). Disambiguate archived specs by slug when the numeric id is reused — `archive/specs/` contains both `16-fitl-map-scenario-and-state-model.md` and `16-template-completion-contract.md`, and both `17-fitl-turn-sequence-eligibility-and-card-flow.md` and `17-pending-move-admissibility.md`.

## Implementation Direction

### Phase 1 — Marker infrastructure

- Define `// @test-class:` / `// @witness:` marker syntax (§1).
- Write `packages/engine/test/unit/infrastructure/test-class-markers.test.ts` enforcing §1 across the corpus.
- Write `packages/engine/scripts/test-class-reporter.mjs` implementing the §4 grouped reporting.
- Modify `packages/engine/scripts/run-tests.mjs` to pass `--test-reporter=./scripts/test-class-reporter.mjs --test-reporter-destination=stdout` to every spawned `node --test` invocation (both the `batched` and `sequential` execution branches in `runExecutionPlan`).
- Write `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` asserting the reporter's grouped summary output against a mocked event stream.

### Phase 2 — Retroactive classification

- Classify every `.test.ts` / `.test.mts` file under `packages/engine/test/**` (~725 files across six lanes). Split files only where per-`it`-block inspection confirms class mixing. Add `@witness:` ids pointing to archived specs/tickets where each witness originated.
- Because Required Invariant #1 admits no "unmarked tolerated" transitional state (FOUNDATIONS #14), Phase 2 ships as a single CI-green change or a small number of lane-scoped PRs, not as an incremental rollout.

### Phase 3 — Author/reviewer guidance

- Update `.claude/rules/testing.md` — the repo-tracked authoritative source — with: (a) the three-class taxonomy, (b) the "new tests default to architectural-invariant" rule, (c) a concrete before/after example using commit 820072e3 (canary softening), showing a convergence-witness RNG-pin rewritten into an architectural-invariant bounded-stop-reason + deterministic-replay pair.
- Advisory: operators maintaining `~/.claude/agents/code-reviewer.md` and `~/.claude/agents/tdd-guide.md` should mirror the taxonomy so those agents flag convergence-witness additions for review. Those agent files are user-level and outside repo control; the canonical guidance lives in `.claude/rules/testing.md`.

## Out of Scope

- Runner (`packages/runner/`) test classification — may follow in a separate spec.
- Tooling for auto-distilling witnesses into invariants (research-grade).

## Outcome

CI failures can be triaged in under 30 seconds by reading a class-grouped summary. Every `.test.ts` / `.test.mts` file under `packages/engine/test/**` carries a class marker. The re-blessing protocol and authoring defaults are formalized in `.claude/rules/testing.md`. Engineers no longer confuse "RNG trajectory shifted" with "architectural invariant broken" when a kernel change legitimately evolves the corpus.

## Tickets

- `archive/tickets/133REGTESCLA-001.md` — Custom `node --test` reporter and runner wiring (infrastructure)
- `archive/tickets/133REGTESCLA-002.md` — Extend `.claude/rules/testing.md` with test classification taxonomy (authoritative guidance)
- `archive/tickets/133REGTESCLA-003.md` — Classify `test/unit/` lane with `@test-class` markers
- `archive/tickets/133REGTESCLA-004.md` — Classify `test/integration/` lane with `@test-class` markers (includes Gulf of Tonkin split if warranted)
- `archive/tickets/133REGTESCLA-005.md` — Classify determinism/, e2e/, performance/, memory/ lanes
- `archive/tickets/133REGTESCLA-006.md` — Meta-test enforcing `@test-class` marker discipline (§1 + §2)
- `archive/tickets/133REGTESCLA-007.md` — Quiet-tail progress visibility for long-running `node --test` lanes

## Outcome

- Completed on 2026-04-18.
- Landed the full Spec 133 deliverable set:
  - custom class-grouping reporter wiring in engine test execution
  - repo-tracked testing guidance for the three-class taxonomy
  - retroactive classification across `unit/`, `integration/`, `determinism/`, `e2e/`, `performance/`, and `memory/`
  - corpus-enforcement meta-test for marker presence, witness adjacency, and best-effort mixed-shape detection
- Deviations from the original plan:
  - the live corpus size was materially larger than the draft estimate and was corrected during ticket implementation
  - the mixed-shape heuristic in the final meta-test was narrowed from the draft examples so it stayed useful on the real corpus instead of flagging broad generic patterns like plain `.every(` usage
  - `133REGTESCLA-007` was added as a derived follow-up to improve observability for long-running quiet tails in the test runner; this completed the operational ergonomics around the new reporter output
- Verification results:
  - all Spec 133 tickets `133REGTESCLA-001` through `007` were implemented, reviewed, and archived
  - the final enforcement ticket (`133REGTESCLA-006`) passed focused proof, full engine test execution, workspace build/lint/typecheck, and ticket dependency integrity checks
