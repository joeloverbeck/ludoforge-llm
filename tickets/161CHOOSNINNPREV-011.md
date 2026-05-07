# 161CHOOSNINNPREV-011: `preview.inner` config runtime-coverage structural audit

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes (test + new directory) — `packages/engine/test/architecture/`
**Deps**: `tickets/161CHOOSNINNPREV-004.md`

## Problem

The silent-no-op pattern that motivated Spec 161 — a compiled config field accepted by the compiler, documented in the cookbook, but ignored by the runtime — slipped past Spec 160 because no structural test enumerates `preview.inner` config fields and asserts each has a runtime consumer or compiler diagnostic. Spec 161 introduces the structural audit as the architectural guardrail that prevents recurrence.

This ticket also introduces a new top-level test directory `packages/engine/test/architecture/` for cross-subsystem structural audits — tests that don't fit any existing subsystem-scoped directory because they enumerate a kernel-owned type and grep across multiple `src/` subtrees.

## Assumption Reassessment (2026-05-07)

1. The compiled `preview.inner` config type is `CompiledAgentPreviewInnerConfig` (verify exact location during implementation; agents reassessment recorded it in `packages/engine/src/kernel/types-core.ts` or analogous). Fields: `chooseOne`, `chooseNStep`, `maxOptions`, `chooseNBeamWidth`, `depthCap`.
2. After Tickets 004–006 land, all five fields have runtime consumers or compiler diagnostics:
   - `chooseOne` — runtime consumer in `policy-agent-inner-preview.ts` (chooseOne adapter guard).
   - `chooseNStep` — runtime consumer in `policy-agent-inner-preview.ts` (chooseNStep adapter guard, post Ticket 003) AND compiler warning in `validate-agents.ts` (post Ticket 005).
   - `maxOptions`, `chooseNBeamWidth`, `depthCap` — compiler validation in `compile-agents.ts` (cost formula).
3. Existing test directories: `unit/`, `integration/`, `determinism/`, `e2e/`, `kernel/`, `memory/`, `perf/`, `performance/`, `policy-profile-quality/`, `helpers/`, `fixtures/`. No `architecture/` directory exists.
4. The audit is grep-based against source files, not behavioral — it inspects file content, not runtime traces.

## Architecture Check

1. F#15 — Architectural Completeness: structural guardrail prevents recurrence of the silent-no-op pattern. The test enforces "every config field has a consumer, a diagnostic, or an explicit allowlist entry."
2. F#16 — Testing as Proof: architectural guardrails are proven, not assumed.
3. The test is intentionally conservative: it does not validate that the runtime consumer correctly USES the field (semantic correctness is covered by the spec's other tests), only that one exists. This avoids over-coupling the audit to specific consumer shapes.
4. New directory `packages/engine/test/architecture/` introduces a convention for cross-subsystem structural audits — tests that enumerate a kernel-owned type and grep both `src/agents/` AND `src/cnl/`. Future cross-subsystem audits land here.

## What to Change

### 1. Create directory `packages/engine/test/architecture/`

A new top-level test directory. No `__init__` or index file required — `node --test` discovers test files by pattern.

### 2. New audit test `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts`

`architectural-invariant`. For each field declared on `CompiledAgentPreviewInnerConfig`, asserts one of:

1. The field has a runtime consumer (grep-based: at least one non-test reference in `packages/engine/src/agents/`).
2. The field is gated by a compiler diagnostic that references it (grep-based: at least one diagnostic-emitting reference in `packages/engine/src/cnl/`).
3. The field is explicitly trace-only and listed in an in-test allowlist with a justification comment.

Implementation approach: read the type definition file, enumerate field names declaratively (not by parsing TypeScript AST — use a maintained allowlist that the test verifies against the type definition's keys), then grep the source tree for each field name. Greps should match the field as a property access (e.g., `\.chooseNStep\b` and `chooseNStep:` to catch both call-sites and object-literal positions) rather than naive substring.

If any field has zero non-test consumers and is not in the allowlist, the test fails with a diagnostic naming the orphaned field.

### 3. Test discovery

Verify the engine `test:unit` script's glob covers `packages/engine/test/architecture/**/*.test.{ts,mts}`. If it does not (the existing `node --test "dist/test/unit/**/*.test.js"` pattern only covers `unit/`), add a separate script or extend the discovery glob — surface via the 1-3-1 rule rather than silently making the audit unreachable.

### 4. CLAUDE.md / docs reference (informational)

Optionally note the new convention in `.claude/rules/testing.md` or `docs/testing-guide.md` so future authors place cross-subsystem audits here. This is informational and may be deferred — not a hard deliverable.

## Files to Touch

- `packages/engine/test/architecture/` (new directory)
- `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts` (new — `architectural-invariant`)
- `packages/engine/package.json` (modify if test discovery does not cover the new directory by default — verify and decide during implementation)

## Out of Scope

- Other Phase D tests (replay-identity, no-op-default, hidden-info, FITL canary, key-parity, differentiation) — Tickets 004, 007–010.
- Any source-code consumer changes — those are delivered by Tickets 003–006.
- Updating the testing-guide or CLAUDE.md beyond a one-line note — bigger documentation sweeps belong in a separate ticket if needed.

## Acceptance Criteria

### Tests That Must Pass

1. New: every field on `CompiledAgentPreviewInnerConfig` has at least one non-test runtime consumer in `packages/engine/src/agents/` OR a compiler diagnostic that gates it OR an in-test allowlist entry with justification comment.
2. New (negative case): adding a fictitious field to the in-test enumeration without a consumer should FAIL the audit (verifies the audit actually catches missing consumers — implement as a constructed regression test or commented-out canary).
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) Every field declared on the compiled `preview.inner` config has a runtime consumer, a compiler diagnostic, or an explicit allowlist entry. (F#15; Spec 161 invariant #7.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts` (new) — `architectural-invariant`. Structural audit; enumerates compiled `preview.inner` fields and asserts each has a runtime consumer, a compiler diagnostic, or an allowlist entry.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/preview-inner-config-runtime-coverage.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`
