# 181STRSTRPOL-012: Phase 1 — ARVN consideration migration + Phase 0 probe rerun

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `data/games/fire-in-the-lake/92-agents.md` (profile YAML); possibly `docs/agent-dsl-cookbook.md` (cookbook entry citing the migration)
**Deps**: `archive/tickets/181STRSTRPOL-003.md`, `archive/tickets/181STRSTRPOL-009.md`, `archive/tickets/181STRSTRPOL-014.md`, `archive/tickets/181STRSTRPOL-015.md`, `archive/tickets/181STRSTRPOL-016.md`, `archive/tickets/181STRSTRPOL-017.md`

## Problem

Spec 181 §8 Phase 1 acceptance (c) closes the loop: at least one ARVN consideration must be migrated to use a selector, and the Phase 0 ARVN distribution probe (003) must still pass (or improve) after the migration. This proves the new selector primitive can replace a flat consideration without regressing the diagnosed pain. It also gives the cookbook entry (deferred from 006) a real production example to cite.

## Assumption Reassessment (2026-05-18)

1. `data/games/fire-in-the-lake/92-agents.md` defines the `arvn-evolved` profile with ~20+ scalar considerations on action tags (per Step 2 verification this session). Pick the smallest consideration whose target ranking is currently emulated by flat terms — likely a per-zone target preference embedded in a Govern or Train consideration.
2. Phase 0 probe (003) measures action-family distribution and `tiebreakAfterPreviewNoSignal` rate. The migration MUST keep both metrics within their thresholds.
3. Phase 1 selector stack (006/007/008) is fully landed and conformance-tested (009/010/011) before this ticket runs.
4. Live reassessment found the ARVN target-ranking seam is microturn-scoped. This ticket remains YAML-only and depends on `181STRSTRPOL-014` for generic `microturnOptions` selector evaluation in microturn option scoring.
5. Live validation found selector-backed preview refs must be planned through selector dependencies before this YAML migration is behavior-preserving. `181STRSTRPOL-015` owns that generic preview-integrity prerequisite.
6. Live validation found selector component preview fallback must be trace-visible, not silently converted to zero. `181STRSTRPOL-016` owns that generic preview-integrity prerequisite.
7. Live validation found preview-inner opt-in diagnostics must recognize selector-backed preview refs. `181STRSTRPOL-017` owns that generic compiler prerequisite.

## Architecture Check

1. The migration touches profile YAML only — no engine src change. Foundation #2 (Evolution-First Design).
2. The migrated consideration replaces flat scalar terms with a selector reference (e.g., `value: { ref: 'selector.arvn-zone-priority.selected.quality' }`). Selector authoring is YAML.
3. The migration is minimal: ONE consideration migrated, not the whole profile. Spec explicitly says "at least one"; broader cookbook migration is deferred to Spec 182 per spec §11.
4. ARVN distribution probe must keep passing — this is the contract Phase 1 acceptance (c) enforces. Use that as the gate: if migration regresses distribution, iterate on the selector design (or roll back) rather than relaxing the probe threshold.

## What to Change

### 1. Select the target consideration

Read `data/games/fire-in-the-lake/92-agents.md` and identify one consideration whose value expression is currently emulating per-zone target ranking via flat terms — typically something like a Govern preference that sums per-zone presence/control/leader contributions. Document the chosen consideration's pre-migration shape in a comment block in the profile YAML and in the cookbook entry.

### 2. Author the selector

Add a `selectors:` block to the profile YAML (the new bucket from 006). Example shape:

```yaml
selectors:
  arvn-zone-priority:
    scopes: [move]
    source: { collection: { kind: zones } }
    where: { ref: feature.zoneIsAccessibleToARVN }    # whatever the equivalent predicate is
    quality:
      components:
        - id: presence
          value: { ref: feature.zonePresenceScore }
          weight: 6
        - id: leader-denial
          value: { ref: standing.role.currentLeader.delta.victory.currentMargin }
          weight: 3
          previewFallback: { onUnavailable: noContribution }
      order: qualityDesc
    minImpact:
      gt: [{ ref: selector.arvn-zone-priority.candidate.<key>.quality }, 0]
    result:
      maxItems: 8
      order: [qualityDesc, stableKeyAsc]
      onEmpty: noContribution
```

(Exact ref names and field paths align with current FITL data-authored features + spec-180 standing-role tokens; confirm during implementation.)

### 3. Rewrite the chosen consideration

Replace the consideration's flat per-zone scoring with a single reference to `selector.arvn-zone-priority.selected.quality` (or per-candidate ref for candidate-scoped use). Preserve the consideration's `weight` and `scopes`. Remove the now-redundant flat scalar terms in the SAME change (Foundation #14 — no transitional duplication).

### 4. Rerun Phase 0 probe

Run `pnpm -F @ludoforge/engine test -- fire-in-the-lake.probes` and confirm `arvn-action-distribution-not-dominated` still passes (or improves — dominant rate decreases). If it regresses, iterate on selector design before merging; do NOT relax the probe threshold.

### 5. Cookbook entry

Replace the stub `### Selectors` section in `docs/agent-dsl-cookbook.md` (added by 006) with a real entry citing this migration: pre/post YAML snippets, an explanation of why selector authoring is cleaner than flat scalars, and a pointer to the spec.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add selector block, rewrite one consideration, remove flat scalars)
- `docs/agent-dsl-cookbook.md` (modify — fleshed-out cookbook entry replacing 006's stub)
- `packages/engine/test/policy-profile-quality/arvn-evolved-convergence.test.ts` (modify only if the migration changes convergence — otherwise unchanged)

## Out of Scope

- Migrating more than one ARVN consideration (Spec 182 owns broader cookbook + profile migration).
- Engine src changes (the selector stack is already in place via 006/007/008).
- New probes or assertions (Phase 0 is closed).
- Strategic modules wrapping the new selector (Spec 182).
- Guardrails consuming the selector (Spec 183).

## Acceptance Criteria

### Tests That Must Pass

1. Compiler accepts the new selector + rewritten consideration without diagnostics.
2. `arvn-action-distribution-not-dominated` Phase 0 probe still passes (or dominant rate improves).
3. `arvn-evolved-convergence.test.ts` — convergence behavior unchanged or improved (this is a profile-quality witness, not a determinism gate; emits `POLICY_PROFILE_QUALITY_REGRESSION` if behavior drifts but does not block CI per Appendix).
4. Determinism: a selector-using `arvn-evolved` profile replays bit-identical decisions at the same seed.
5. Existing suite: `pnpm turbo test`

### Invariants

1. No engine src change in this ticket (Foundation #2 — evolution-first means YAML).
2. Property-form metric improvement: dominant action-family rate is ≤ pre-migration rate (selector should help, not hurt; if it hurts, revisit).
3. No transitional duplication — flat scalars removed in same change as selector landing (Foundation #14).

## Test Plan

### New/Modified Tests

1. No new test files. Existing `arvn-evolved-convergence.test.ts` and `fire-in-the-lake.probes.test.ts` are the gates.

### Commands

1. `pnpm -F @ludoforge/engine test -- fire-in-the-lake.probes`
2. `pnpm -F @ludoforge/engine test -- arvn-evolved-convergence`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
