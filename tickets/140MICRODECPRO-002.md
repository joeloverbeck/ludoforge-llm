# 140MICRODECPRO-002: I2 + I3 + I4 investigation — profile audit, worker-bridge audit, trace-transform design

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — documentation-only deliverables under `campaigns/phase3-microturn/` and `docs/migration/`
**Deps**: `specs/140-microturn-native-decision-protocol.md`

## Problem

Three investigations gate implementation readiness for the microturn-native migration:

1. **I2 — Policy profile migration audit**: Classify every policy expression in FITL and Texas agents files as Category A (microturn-compatible as-is), B (mechanically rewriteable), or C (requires re-evolution). Determines the migration-cost budget for ticket 008 and whether the re-evolution campaign (ticket 009) is actually needed.
2. **I3 — Worker-bridge session retirement audit**: Inventory every runner-side consumer of the deprecated worker bridge APIs (`enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`/`applyTrustedMove`/`applyTemplateMove`, `ChooseNTemplate`/`ChooseNSession` and related). Produces the rewiring checklist for ticket 010.
3. **I4 — Replay protocol migration utility design**: Specify the lossy `MoveLog[] → DecisionLog[]` transform for analytics continuity. The transform is needed for historical-comparison metrics; it is NOT needed for replay-identity tests (those regenerate from scratch under F14).

Without these audits, ticket-008/010 scope is unbounded and ticket 009 cannot be descoped if it turns out no Category C profiles exist.

## Assumption Reassessment (2026-04-20)

1. Reassessment confirmed `data/games/fire-in-the-lake/92-agents.md` contains 5 profiles: `us-baseline`, `arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`. `us-evolved` is an in-progress evolution per user guidance; the audit should enumerate profiles as they exist at migration time, not against a frozen list.
2. `data/games/texas-holdem/92-agents.md` exists but is a sparse skeleton per reassessment — Texas audit is expected to be small.
3. Runner worker bridge APIs the spec proposes to delete all currently exist in `packages/runner/src/worker/game-worker-api.ts` (confirmed by Explore agent during reassessment).
4. `sim/trace-eval.ts`, `sim/aggregate-evals.ts`, `sim/trace-enrichment.ts` all exist under `packages/engine/src/sim/` (confirmed).
5. `docs/migration/` directory does NOT currently exist — this ticket includes creating it.

## Architecture Check

1. Read-only investigation deliverables — no source-code or schema changes. All three outputs are markdown or design-doc format, cleanly separable from downstream implementation tickets.
2. Engine-agnosticism preserved: audits describe existing game-specific data; they do not introduce new game-specific code anywhere.
3. F14 compliant: the I4 trace transform is explicitly scoped as a *one-time offline migration utility*, not a runtime compatibility layer. Spec 140 I4 adds this framing sentence directly.

## What to Change

### 1. I2 — Profile migration audit

Create `campaigns/phase3-microturn/profile-migration-audit.md`. For every profile declared in `data/games/fire-in-the-lake/92-agents.md` and `data/games/texas-holdem/92-agents.md` at audit time, enumerate every policy expression and classify each into:

- **(A) Microturn-compatible as-is** — references only game-state variables and action-level metadata; evaluates identically at the action-selection microturn.
- **(B) Mechanically rewriteable** — references partial-move params that have a direct microturn-context equivalent (`accumulatedBindings[decisionKey]`, `options[n].metadata`, etc.). Document the transform per expression.
- **(C) Requires re-evolution** — depends on the two-phase scoring shape in a way that has no 1:1 microturn equivalent (e.g., expressions that normalize scores across all completions of a template).

Output table structure: `| Profile | Expression ID | Category | Transform notes |`. Include a summary at the top: N profiles audited, M total expressions, breakdown by category. **Descope trigger**: if Category C count is zero post-audit, mark ticket 009 as descopable in its Out of Scope section.

### 2. I3 — Worker-bridge rewiring checklist

Create `campaigns/phase3-microturn/worker-bridge-rewire.md`. Inventory every runner-side consumer of the deprecated bridge APIs:

- `bridge.enumerateLegalMoves` / `.legalMoves` — call sites, result consumers, any test using `certificateIndex`.
- `bridge.legalChoices` — call sites in `game-store.ts`, `ChoicePanel`, `ActionToolbar`, `InterruptBanner`, etc.
- `bridge.advanceChooseN` — call sites + all session-related store state.
- `bridge.applyMove` / `applyTrustedMove` / `applyTemplateMove` — every call site.
- `ChooseNTemplate`, `ChooseNSession`, `advanceChooseNWithSession`, `isChooseNSessionEligible`, `isSessionValid`, `createChooseNSession` — all exports and their consumers.
- `packages/runner/test/worker/choose-n-session-integration.test.ts` — primary test consumer (explicit: deletes entirely in ticket 010; fresh microturn-session tests authored there).

For each item, map the old call site to its new `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` equivalent. Every item becomes a migration subtask referenced by ticket 010.

### 3. I4 — Trace-transform design doc + directory creation

Create `docs/migration/` (new directory — does not currently exist). Inside it, create `docs/migration/spec-140-trace-transform.md` specifying:

- Input format: pre-spec `MoveLog[]` from `GameTrace.moves`.
- Output format: post-spec `DecisionLog[]` tagged `traceGeneration: 'migrated-spec-140'`.
- Ambiguity resolution: cases where a single `MoveLog` entry decomposes into multiple `DecisionLog` entries whose inter-decision state the legacy trace did not record — document the lower-bound semantics (`compoundTurns[].microturnCount` is a floor, not an exact count).
- Consumers: `sim/trace-eval.ts`, `sim/aggregate-evals.ts`, `sim/trace-enrichment.ts` for historical-comparison metrics; visual historical playback in evaluation reports; cross-spec convergence witnesses in `policy-profile-quality/`.
- Non-consumers: replay-identity tests (regenerate from scratch under F14), determinism gates (regenerate from scratch).
- F14 framing: "The transform is a one-time offline migration tool — not a runtime compatibility layer — and is covered by F14's 'migrated snapshots' allowance for preserving historical-experiment reproducibility without introducing shims."

Do NOT implement the transform — ticket 014 absorbs implementation if historical trace migration is needed at test-regeneration time.

## Files to Touch

- `campaigns/phase3-microturn/profile-migration-audit.md` (new)
- `campaigns/phase3-microturn/worker-bridge-rewire.md` (new)
- `docs/migration/` (new directory)
- `docs/migration/spec-140-trace-transform.md` (new)

## Out of Scope

- Any production-code change. No edits to `packages/engine/src/`, `packages/runner/src/`, or game-data YAML files.
- Implementing the trace transform (ticket 014).
- Actually rewriting any policy expression (ticket 008).
- Executing any bridge-API rewiring (ticket 010).
- The FITL compound-turn inventory (ticket 001 handles I1 + I5).

## Acceptance Criteria

### Tests That Must Pass

1. N/A — documentation deliverables. Validation is manual review of the three output docs.
2. Existing suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` still pass (no code change expected).

### Invariants

1. Every profile in FITL + Texas agents files is audited. Spot-check: grep each profile name from the source file against the audit doc.
2. Every deprecated worker-bridge symbol listed in spec 140 D6 and I3 is represented in the rewiring checklist.
3. The trace-transform design doc explicitly names `traceGeneration: 'migrated-spec-140'` as the output tag and references the F14 "migrated snapshots" allowance.

## Test Plan

### New/Modified Tests

None — three checked-in markdown deliverables. Manual verification commands:

```bash
ls campaigns/phase3-microturn/
ls docs/migration/
grep -c '^|' campaigns/phase3-microturn/profile-migration-audit.md   # table-row density sanity check
grep -c '^|' campaigns/phase3-microturn/worker-bridge-rewire.md
```

### Commands

1. Manual doc review (no automated test target).
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` (regression sanity).
