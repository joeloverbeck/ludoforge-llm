# 133REGTESCLA-002: Extend `.claude/rules/testing.md` with test classification taxonomy

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `specs/133-regression-test-classification-discipline.md`

## Problem

Classification tickets (003, 004, 005) need an authoritative reference defining the three classes, marker syntax, authoring defaults, witness-id convention, and the re-blessing protocol. Without it, per-file judgments diverge and the discipline erodes. Per Spec 133 §Implementation Phase 3, `.claude/rules/testing.md` is the repo-tracked canonical source for test rules — this ticket extends it to cover the Spec 133 taxonomy and provides a concrete before/after example from commit 820072e3 (the canary softening) that teaches the pattern in code rather than prose.

## Assumption Reassessment (2026-04-18)

1. `.claude/rules/testing.md` exists at the repo root, 31 lines, covers TDD workflow (RED-GREEN-REFACTOR), 80% test coverage, and references `tdd-guide` and `e2e-runner` agents. Does not currently mention test classification. Verified during Spec 133 reassessment.
2. Commit `820072e3` ("Align canary + Gulf of Tonkin tests to architectural invariants, not RNG pins") is on the current branch and is the canonical before/after example. Retrievable via `git show 820072e3`.
3. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` current content (post-820072e3) uses bounded stop reasons + deterministic replay — the "after" state. The commit's pre-image is the "before".
4. `~/.claude/agents/code-reviewer.md` and `~/.claude/agents/tdd-guide.md` live in the user's global config outside repo control. This ticket treats them as advisory mirrors, not authoritative sources.

## Architecture Check

1. **Cleaner than alternatives**: Putting authoritative guidance in `.claude/rules/testing.md` (repo-tracked) means the rules evolve with the codebase under review. Alternatives — user-global agent prompts or a new standalone doc — fragment the taxonomy across files with different ownership and update cadences. Spec 133 Phase 3 explicitly identifies testing.md as the right home.
2. **Agnostic boundaries preserved**: Documentation change; no game-specific logic introduced and no engine code touched.
3. **No backwards-compatibility shims**: New section appended/integrated; existing TDD guidance remains unchanged.

## What to Change

### 1. Add a "Test Classification" section to `.claude/rules/testing.md`

Append a new section (after existing content) covering:

- **Three classes with definitions and one-line examples each**:
  - `architectural-invariant` — must hold across every legitimate kernel evolution (e.g., "every enumerated legal move is classifier-admissible").
  - `convergence-witness` — pins a specific trajectory observed on a `(seed, profile, kernel-version)` triple, guarding a past fix (e.g., "seed 1012 at ply 59 has 8 legal moves").
  - `golden-trace` — byte-exact trajectory pin used as a determinism proof; expected to be re-blessed on legitimate evolution.
- **Marker syntax**: single-line `//` form at file top:
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
- **Scope**: Applies to `packages/engine/test/**/*.{test.ts,test.mts}`. Excludes `helpers/`, `fixtures/`, and compiled `dist/` output.
- **Authoring default**: Start new tests as `architectural-invariant`. Fall back to `convergence-witness` only if the property is inherently seed- or profile-specific. Mixed-class files must be split.
- **Witness id convention**: `<spec-or-ticket-id>[-<short-slug>]` (e.g., `spec-132-template-completion-contract`, `132AGESTUVIA-001`). Disambiguate when archived specs share a numeric id — e.g., use `spec-17-pending-move-admissibility` rather than bare `spec-17` (since `archive/specs/` contains both that and `17-fitl-turn-sequence-eligibility-and-card-flow.md`).
- **Update protocol per class**:
  - architectural-invariant failure → diagnose and fix kernel; test is not modified.
  - convergence-witness failure → evaluate trajectory shift legitimacy; either retarget the witness with the same fix-reference, promote to an invariant by distilling the property, or kernel-fix if illegitimate.
  - golden-trace failure → re-bless only if the spec change causing the shift is named in the commit body (format: `Re-bless golden trace: <test-file>`) with a human-readable reason. Otherwise kernel-fix.

### 2. Include a concrete before/after example from commit 820072e3

Show (in the new section) a trimmed code snippet pair illustrating the canary softening:

- **Before** (pre-820072e3): pinning a specific trajectory length on specific seeds, e.g. `assert.equal(trace.moves.length, <seed-specific number>)`.
- **After** (post-820072e3): bounded stop reasons + deterministic replay — the current content of `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`:
  ```ts
  const BOUNDED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
  // ...
  assert.ok(BOUNDED_STOP_REASONS.has(trace.stopReason), ...);
  assert.ok(trace.moves.length <= MAX_TURNS, ...);
  // replay subtest:
  assert.equal(trace1.finalState.stateHash, trace2.finalState.stateHash, ...);
  ```
- Explain the reclassification: trajectory lengths are kernel-version-specific (a convergence-witness property), but bounded termination + determinism are architectural invariants.
- Cite `git show 820072e3` so readers can see the full diff in context.

### 3. Advisory note about user-global agent files

Add a short advisory: operators who maintain `~/.claude/agents/code-reviewer.md` and `~/.claude/agents/tdd-guide.md` may mirror the taxonomy in those files so their agents flag convergence-witness additions for review, but the canonical guidance lives in this file (`.claude/rules/testing.md`). User-global agent files are outside repo control.

## Files to Touch

- `.claude/rules/testing.md` (modify — append/integrate the "Test Classification" section)

## Out of Scope

- Writing the reporter, meta-test, or migrating the corpus (other tickets).
- Updating user-global agent prompts (outside repo control; note as advisory only).
- Runner (`packages/runner/`) test classification — per spec §Out of Scope.

## Acceptance Criteria

### Tests That Must Pass

1. No code test failures — docs-only change.
2. `.claude/rules/testing.md` renders cleanly in standard markdown viewers (no broken formatting, code fences balanced).

### Invariants

1. Taxonomy, marker syntax, authoring defaults, and update protocol are unambiguous — two independent readers classifying the same file using this guidance produce the same marker.
2. The before/after example cites commit 820072e3 so future readers can retrieve full context via `git show`.
3. The authoritative-vs-advisory boundary between `.claude/rules/testing.md` (this file) and user-global agent files is stated explicitly.

## Test Plan

### New/Modified Tests

1. None — docs-only ticket. Manual verification: read the new section and confirm it answers "what class is this test?" for each migration target listed in Spec 133 §Required Proof without ambiguity.

### Commands

1. Manual: `cat .claude/rules/testing.md` and read top-to-bottom.
2. `pnpm run check:ticket-deps` — repository-level dependency check passes.
3. `pnpm turbo lint` — if any markdown lint rules exist, they pass.

## Outcome

- Completed: 2026-04-18
- Landed a new `Test Classification` section in `.claude/rules/testing.md` covering the three classes, file-top marker syntax, authoring defaults, witness-id convention, update protocol, and the authoritative scope for engine tests under `packages/engine/test/**/*.{test.ts,test.mts}`.
- Added the commit-anchored canary example from `git show 820072e3`, showing the shift from a trajectory-specific terminal pin to bounded-stop-reason plus deterministic-replay architectural invariants.
- Added the advisory note that user-global `~/.claude/agents/code-reviewer.md` and `~/.claude/agents/tdd-guide.md` may mirror the taxonomy, while `.claude/rules/testing.md` remains the canonical repo-tracked source.
- Boundary correction: this ticket remained docs-only. It did not update user-global agent prompts or land any corpus classification or enforcement work; those remain owned by sibling tickets `133REGTESCLA-003` through `133REGTESCLA-006`.
- Schema/artifact fallout checked: none.
- Verification run:
  - manual read-through of `.claude/rules/testing.md`
  - `pnpm run check:ticket-deps`
  - `pnpm turbo lint`
