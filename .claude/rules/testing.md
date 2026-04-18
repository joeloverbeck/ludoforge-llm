# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (Playwright)

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first
- **e2e-runner** - Playwright E2E testing specialist

## Test Classification

Applies to `packages/engine/test/**/*.{test.ts,test.mts}`. Excludes `helpers/`, `fixtures/`, and compiled `dist/` output.

Every engine test file in scope must declare exactly one file-top class marker:

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

### Classes

1. **architectural-invariant**
   Tests properties that must hold across every legitimate kernel evolution.
   Example: every enumerated legal move is classifier-admissible.
2. **convergence-witness**
   Tests a specific observed trajectory on a `(seed, profile, kernel-version)` combination to guard a past fix.
   Example: seed `1012` at ply `59` has `8` legal moves.
3. **golden-trace**
   Tests a byte-exact trajectory or serialized final state used as a determinism proof.
   Example: a pinned replay fixture under `packages/engine/test/fixtures/**`.

### Authoring Default

Start new tests as `architectural-invariant` whenever possible. Fall back to `convergence-witness` only when the property is inherently seed- or profile-specific. If one file mixes invariant assertions and witness assertions, split it into separate files.

### Witness Id Convention

Use `<spec-or-ticket-id>[-<short-slug>]`, for example:

- `spec-132-template-completion-contract`
- `132AGESTUVIA-001`
- `spec-17-pending-move-admissibility`

Disambiguate reused archived spec numbers with a slug. `archive/specs/` contains both `16-fitl-map-scenario-and-state-model.md` and `16-template-completion-contract.md`, and both `17-fitl-turn-sequence-eligibility-and-card-flow.md` and `17-pending-move-admissibility.md`.

### Update Protocol

- `architectural-invariant` failure: diagnose and fix the kernel or test-owned implementation. Do not soften the test to preserve the regression.
- `convergence-witness` failure: evaluate whether the trajectory shift is legitimate. If it is, either retarget the witness to the new trajectory with the same fix reference or promote it into an architectural invariant by distilling the underlying property. If it is not, fix the kernel.
- `golden-trace` failure: re-bless only when the spec or implementation change causing the shift is explicitly named in the commit body using `Re-bless golden trace: <test-file>` plus a human-readable reason. Otherwise, fix the kernel.

### Canary Example: Commit `820072e3`

Use `git show 820072e3` to inspect the full before/after diff.

Before the canary softening, the test pinned a trajectory-specific convergence outcome:

```ts
it(`seed ${seed}: game reaches terminal within ${MAX_TURNS} moves`, () => {
  const trace = runOnce(seed);
  assert.equal(trace.stopReason, 'terminal');
  assert.notEqual(trace.result, null);
});
```

After `820072e3`, the test proves architectural invariants instead:

```ts
const BOUNDED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

it(`seed ${seed}: game terminates within ${MAX_TURNS} bounded moves`, () => {
  const trace = runOnce(seed);
  assert.ok(BOUNDED_STOP_REASONS.has(trace.stopReason));
  assert.ok(trace.moves.length <= MAX_TURNS);
});

it(`seed ${seed}: replay produces identical outcome`, () => {
  assert.equal(trace1.finalState.stateHash, trace2.finalState.stateHash);
});
```

The reclassification is the point: a specific terminal trajectory is a convergence witness, while bounded termination plus deterministic replay are architectural invariants.

### Advisory: User-Global Agent Prompts

Operators who maintain `~/.claude/agents/code-reviewer.md` and `~/.claude/agents/tdd-guide.md` may mirror this taxonomy so those agents flag convergence-witness additions for review. The canonical guidance remains this repo-tracked file, `.claude/rules/testing.md`.
