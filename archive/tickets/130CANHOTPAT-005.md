# 130CANHOTPAT-005: ESLint rule — no-conditional-spread for kernel/agents

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — ESLint configuration
**Deps**: None

## Problem

After tickets 001-004 eliminate existing conditional spreads from hot-path types, there is no automated mechanism to prevent future code from re-introducing the pattern. The `fitl-perf-optimization` campaign showed that even single new conditional spreads can cause 2-5% performance regressions. A lint rule provides continuous enforcement.

## Assumption Reassessment (2026-04-13)

1. ESLint config at `eslint.config.js` uses flat config format (TypeScript ESLint) — confirmed
2. Config already has per-file-pattern rules (lines 12-43) — extensible for new rules
3. `packages/engine/src/cnl/` has 340+ conditional spreads — correctly excluded from scope (build-time, not hot path)
4. `packages/runner/` is excluded — different performance profile
5. Scope: `packages/engine/src/kernel/**/*.ts` and `packages/engine/src/agents/**/*.ts`

## Architecture Check

1. The lint rule is a build-time check only — no runtime impact, no game-specific logic.
2. Scoped to kernel/agents directories to avoid false positives in compiler pipeline (cnl/) and runner.
3. Allows legitimate spread patterns (`...existingObject`, `{ ...base, prop: value }`) — only flags the conditional ternary spread pattern.

## What to Change

### 1. Add custom ESLint rule

Create a local ESLint rule (or use/configure an existing plugin) that detects the pattern:

```
...(condition ? { prop: value } : {})
...(value !== undefined ? { prop: value } : {})
```

The AST pattern to detect: `SpreadElement` whose `argument` is a `ConditionalExpression` where either the `consequent` or `alternate` is an `ObjectExpression`.

Options for implementation (in preference order):
1. **Inline rule in `eslint.config.js`** using the ESLint `RuleCreator` API — no external dependency
2. **Local plugin file** in a `tools/eslint-rules/` directory
3. **Third-party plugin** if one exists and is well-maintained

### 2. Configure rule scope in `eslint.config.js`

Add a new config entry scoped to kernel/agents:

```javascript
{
  files: ['packages/engine/src/kernel/**/*.ts', 'packages/engine/src/agents/**/*.ts'],
  rules: {
    'no-conditional-spread': 'error',
  },
}
```

### 3. Add canonical shape registry comments

Add JSDoc-style comments to each priority type documenting the canonical shape — all properties that must be present at every construction site. This is the "shape registry" from the spec, implemented as code-level documentation:

```typescript
/**
 * Canonical shape — all construction sites MUST include every property:
 * state, rng, bindings, decisionScope, effectPath, tracker
 */
export interface EffectCursor { ... }
```

Add similar comments to `ClassifiedMove`, `PolicyEvaluationCoreResult`, `MoveViabilityProbeResult`, and `GameState`.

## Files to Touch

- `eslint.config.js` (modify)
- `tools/eslint-rules/no-conditional-spread.js` (new — if local plugin approach)
- `packages/engine/src/kernel/effect-context.ts` (modify — shape registry comment)
- `packages/engine/src/kernel/types-core.ts` (modify — shape registry comments for GameState, ClassifiedMove)
- `packages/engine/src/agents/policy-eval.ts` (modify — shape registry comment)
- `packages/engine/src/kernel/apply-move.ts` (modify — shape registry comment)

## Out of Scope

- Converting existing conditional spreads — tickets 001-004
- Applying the rule to `cnl/` or `runner/` directories
- Runtime performance measurement

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo lint` passes with the new rule enabled
2. No false positives on legitimate spread patterns in kernel/agents
3. The rule correctly flags `...(cond ? { p: v } : {})` patterns when tested against a synthetic example

### Invariants

1. The rule applies ONLY to `packages/engine/src/kernel/**/*.ts` and `packages/engine/src/agents/**/*.ts`
2. `packages/engine/src/cnl/` is not affected
3. `packages/runner/` is not affected

## Test Plan

### New/Modified Tests

1. If using a local plugin: add a test file for the rule with positive and negative cases

### Commands

1. `pnpm turbo lint` — verify rule works and no false positives
2. `pnpm turbo typecheck` — verify no type regressions
3. `pnpm turbo test` — full suite verification

## Outcome (2026-04-13)

Implemented a local ESLint rule in `tools/eslint-rules/no-conditional-spread.js` and registered it in `eslint.config.js` as `local/no-conditional-spread`.

During reassessment, the draft ticket's blanket wording proved too broad: kernel and agents still contain legitimate non-hot-path conditional spreads. The implemented rule therefore enforces the spec boundary more precisely by flagging conditional spreads only when constructing the canonical hot-path runtime object shapes introduced by tickets 001-004:

- `EffectCursor`
- `ClassifiedMove`
- `PolicyEvaluationCoreResult`
- `MoveViabilityProbeResult`
- `GameState`

Added canonical-shape registry comments to the corresponding exported types in:

- `packages/engine/src/kernel/effect-context.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/agents/policy-eval.ts`
- `packages/engine/src/kernel/apply-move.ts`

Added lint-policy coverage for the config scope and synthetic rule behavior:

- `packages/engine/test/unit/lint/canonical-hot-path-conditional-spread-lint-policy.test.ts`
- `packages/engine/test/unit/lint/no-conditional-spread-rule.test.ts`

No schema or generated-artifact changes were required.

Verification:

1. `pnpm turbo lint`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
