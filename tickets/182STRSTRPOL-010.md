# 182STRSTRPOL-010: Phase 3 — Migration atomic: `pruningRules` → `guardrails` (data + tests + bucket removal)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — atomic cut spanning ~9 source files, ~20+ test files, 1 data file (per Foundation #14)
**Deps**: `archive/tickets/182STRSTRPOL-008.md`, `archive/tickets/182STRSTRPOL-009.md`

## Problem

Spec 182 §5.1 + Foundation #14 require atomic removal of the `pruningRules` bucket: in ONE ticket, migrate every repository-owned `pruningRules` entry to `guardrails` with `severity: prune`, update every test fixture that constructs `pruningRules:`, remove the `pruningRules` bucket from `AGENT_POLICY_LIBRARY_BUCKETS`, delete all `pruningRules` references from source code, and wire the `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` diagnostic so reintroduction fails compilation. Per the spec's §5.1.1 migration mapping, FITL's single `dropPassWhenOtherMovesExist` rule (currently `onEmpty: skipRule`) migrates to `severity: prune, safe: true, onAllPruned: <pass>` — the `when` clause's `aggregate.hasNonPassAlternative` guarantees non-pass candidates survive, satisfying the audit step.

## Assumption Reassessment (2026-05-18)

1. Source-file blast radius (9 files, verified during reassessment): `policy-contract.ts`, `kernel/types-core.ts`, `agents/policy-diagnostics.ts`, `kernel/schemas-core.ts`, `cnl/compile-agents.ts`, `cnl/validate-agents.ts`, `cnl/policy-bytecode/feature-table.ts`, `agents/policy-eval.ts`, `cnl/lower-agent-considerations.ts`.
2. Test-file blast radius (~20+ files, ~222 grep matches): includes `test/unit/cnl/`, `test/integration/agents/`, `test/architecture/`, `test/determinism/` — file-level inventory via `grep -rln 'pruningRules' packages/engine/test`.
3. Data files: only `data/games/fire-in-the-lake/92-agents.md` declares a `pruningRules` entry (`dropPassWhenOtherMovesExist` at line 230, used 5× via `profile.use.pruningRules`). `data/games/texas-holdem/92-agents.md` declares an empty `pruningRules: {}` section that needs removal too.
4. Campaign tooling: `campaigns/phase3-microturn/profile-migration-audit.md` references `pruningRules` in audit context; either update wording to reference `guardrails` (preferred) or note as historical context.
5. The pass action that satisfies `dropPassWhenOtherMovesExist`'s migration target is the standard FITL pass action tagged `tags: [pass]` per `data/games/fire-in-the-lake/30-rules-actions.md:176`.

## Architecture Check

1. Foundation #14 atomic cut: `pruningRules` and `guardrails` never coexist in main after this ticket; the deletion blast radius lands in a single ticket per Foundation #14's no-compatibility-shim mandate.
2. Per the spec's Foundation #14 mechanical-uniformity exception (Step 3 of `/spec-to-tickets`): per-file changes are mechanical (`pruningRules` → `guardrails`, `onEmpty: skipRule` → `severity: prune, safe: true, onAllPruned: {...}`); diff is large but reviewable as a single coherent migration.
3. Migration mapping per spec §5.1.1: documented; the dropPassWhenOtherMovesExist audit confirms `when` clause already requires non-pass survivors.
4. The `_PRUNINGRULES_DEPRECATED` diagnostic prevents future reintroduction (per Foundation #14).

## What to Change

### 1. Migrate FITL `dropPassWhenOtherMovesExist` data

In `data/games/fire-in-the-lake/92-agents.md`:

```yaml
# Replace the existing pruningRules block at line 230 with:
guardrails:
  dropPassWhenOtherMovesExist:
    traceLabel: "drop pass when other moves exist"
    scopes: [move]
    when:
      and:
        - { ref: candidate.tag.pass }
        - { ref: aggregate.hasNonPassAlternative }
    severity: prune
    safe: true
    onAllPruned:
      actionId: pass                                    # confirm canonical pass actionId during impl
      traceLabel: "fallback: pass action when no other moves"
    onUnavailable: noFire                               # `when` does not read preview refs; noFire is the safe default
```

Update each `profile.use.pruningRules` reference (5 occurrences at lines ~509, 534, 576, 598, 621) to `profile.use.guardrails`.

In `data/games/texas-holdem/92-agents.md`: remove the empty `pruningRules: {}` declaration (lines 70 and 119 per grep).

### 2. Remove pruningRules from AGENT_POLICY_LIBRARY_BUCKETS

In `packages/engine/src/contracts/policy-contract.ts`: remove `'pruningRules'` from `AGENT_POLICY_LIBRARY_BUCKETS` AND from `AGENT_POLICY_PROFILE_USE_BUCKETS` AND from `AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET` mapping (all visible in policy-contract.ts:1-26).

### 3. Source-file deletions (9 files)

- `packages/engine/src/kernel/types-core.ts`: remove `CompiledPolicyPruningRule`, `pruningRules` field from `CompiledPolicyCatalog`, `CompiledAgentProfile.use.pruningRules`.
- `packages/engine/src/agents/policy-diagnostics.ts`: remove diagnostic collection sites referencing `pruningRules` (lines 26, 63, 94, 213, 334 per grep).
- `packages/engine/src/kernel/schemas-core.ts`: remove `pruningRules` schema entries.
- `packages/engine/src/cnl/compile-agents.ts`: remove `compilePruningRules` and its wire-up.
- `packages/engine/src/cnl/validate-agents.ts`: remove pruningRules validation paths.
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts`: remove pruningRules visitor.
- `packages/engine/src/agents/policy-eval.ts`: remove the `pruningRules` dispatch loop (lines 678-726 pre-ticket-002, shifted by 002/007 insertions). Guardrails dispatch (added in 007) takes over the role.
- `packages/engine/src/cnl/lower-agent-considerations.ts`: remove pruningRules expression lowering.

### 4. Test-file migration (~20+ files)

Update every test that constructs `pruningRules:` in a fixture to construct `guardrails:` with the equivalent `severity: prune` shape. File set discoverable via `grep -rln 'pruningRules' packages/engine/test`. Per the mapping table in §5.1.1, the conversion is mechanical. Major test files include (non-exhaustive — implementation must regenerate the full list at start):
- `packages/engine/test/architecture/preview-deepening/continued-deepening-foundation20-preserved.test.ts`
- `packages/engine/test/architecture/lookup-refs-projected/*-fixture.ts`
- `packages/engine/test/determinism/phase-identity-refs-determinism.test.ts`
- `packages/engine/test/integration/agents/policy-annotation-e2e.test.ts`
- `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts`
- `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts`
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts`

### 5. Wire CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED

Add the 10th guardrail diagnostic code per spec §5.5 (the one deferred from ticket 006). Wire it into the YAML/agent parser so any future profile declaring `pruningRules:` fails compilation with this error. Add a positive-trigger test in `agent-guardrail-diagnostics.test.ts`.

### 6. Architectural test: zero pruningRules survivors

Add `packages/engine/test/architecture/no-pruning-rules-survivors.test.ts` that greps the repository for `pruningRules` and asserts zero matches (excluding archived specs/tickets, this ticket itself, and the diagnostic-code definition).

### 7. Campaign tooling update

Update `campaigns/phase3-microturn/profile-migration-audit.md` to reference `guardrails` instead of `pruningRules`, OR add a "post-Spec-182 update" section clarifying the migration.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify)
- `packages/engine/src/cnl/diagnostic-codes.ts` (modify — add `_PRUNINGRULES_DEPRECATED`)
- `data/games/fire-in-the-lake/92-agents.md` (modify — migrate rule + use references)
- `data/games/texas-holdem/92-agents.md` (modify — remove empty pruningRules sections)
- `packages/engine/test/**/*` (modify — ~20+ test files; full inventory via grep at implementation start)
- `packages/engine/test/architecture/no-pruning-rules-survivors.test.ts` (new)
- `packages/engine/test/unit/cnl/agent-guardrail-diagnostics.test.ts` (modify — add _PRUNINGRULES_DEPRECATED test)
- `campaigns/phase3-microturn/profile-migration-audit.md` (modify)

## Out of Scope

- Conformance tests per severity tier (ticket 011 — runs against the migrated profile).
- Profile-quality lint warnings (ticket 012).
- Module / turn-shape work (Phases 2, 4).
- Archived ticket/spec content (not modified; archival is read-only).

## Acceptance Criteria

### Tests That Must Pass

1. New `agent-guardrail-diagnostics.test.ts` _PRUNINGRULES_DEPRECATED positive-trigger test fires.
2. New `no-pruning-rules-survivors.test.ts` returns zero source/test matches outside the diagnostic-code definition.
3. All existing tests that previously constructed `pruningRules:` now construct `guardrails:` and pass.
4. FITL replay-determinism test (existing infrastructure): post-migration FITL profile produces bit-identical decisions across two runs at the same seed.
5. `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck` — all pass.
6. `pnpm run check:ticket-deps` — passes (no broken ticket dependency chain).

### Invariants

1. After this ticket lands, no engine source file references `pruningRules` (except diagnostic-code definition).
2. After this ticket lands, no test fixture constructs `pruningRules:`.
3. After this ticket lands, no data file declares `pruningRules:`.
4. The FITL replay corpus produces bit-identical decisions (Foundation #8).
5. Reintroducing `pruningRules` to any profile fails compilation with `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/no-pruning-rules-survivors.test.ts` — architectural test asserting no `pruningRules` references survive.
2. `packages/engine/test/unit/cnl/agent-guardrail-diagnostics.test.ts` — extend with _PRUNINGRULES_DEPRECATED positive-trigger test.
3. ~20+ test fixture migrations (mechanical; full inventory via `grep -rln 'pruningRules' packages/engine/test`).

### Commands

1. `grep -rn 'pruningRules' packages/engine/src packages/engine/test data/games campaigns | grep -v 'archive/' | grep -v 'diagnostic-codes' | grep -v 'no-pruning-rules-survivors' ; echo "Exit: $? (1 = no stray ref, good)"`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/no-pruning-rules-survivors.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm run check:ticket-deps`
