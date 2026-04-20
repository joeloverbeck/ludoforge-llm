# 140MICRODECPRO-009: D9 — Re-evolution campaign (Category C) — blocked pending truthful profile-migration prerequisite

**Status**: BLOCKED
**Priority**: LOW
**Effort**: Large
**Engine Changes**: None — future MAP-Elites campaign execution only; current turn is ticket-boundary correction
**Deps**: `archive/tickets/140MICRODECPRO-007.md`, `archive/tickets/140MICRODECPRO-002.md`

## Problem

This ticket cannot run the intended re-evolution campaign yet because the live repo is not in the prerequisite state the draft assumed. The current profile corpus is still partly on the legacy completion/preview-era policy surface preserved by ticket 007's live boundary correction, so there are no truthful microturn-native Category `C` placeholders to replace with re-evolved expressions.

The future campaign remains valid in principle: once the live profile corpus is actually migrated onto the microturn-native surface, any remaining Category `C` heuristics should be re-evolved rather than force-ported. But that prerequisite migration boundary is not currently implemented in the repo.

## Blocking Condition (2026-04-20)

The re-evolution campaign is blocked until the live profile corpus satisfies all of the following:

1. FITL and Texas profile YAML no longer depend on legacy completion/preview-era inputs such as `scopes: [completion]`, `candidate.param.*`, and preview-only decision metadata.
2. Any truly non-portable heuristics are represented as explicit microturn-era replacement targets in the live YAML corpus or in an equivalent authoritative migration artifact.
3. The baseline comparison surface is defined against the post-migration microturn-native profiles, not against the current hybrid legacy-support path preserved by ticket 007.

Until that prerequisite lands, this ticket would be forced to invent a campaign input surface that the repo does not actually own yet.

## Assumption Reassessment (2026-04-20)

1. Ticket 007 did **not** complete the profile corpus migration. Its archived outcome explicitly says the public `chooseDecision` cut landed while legacy policy-eval / completion-guidance helpers remained as private support code because the live FITL witnesses still depended on them.
2. Live profile YAML is still on the pre-migration surface. `data/games/fire-in-the-lake/92-agents.md` still contains `scopes: [completion]`, `candidate.param.targetSpace`, and `preview.phase1`; `data/games/texas-holdem/92-agents.md` still contains `candidate.param.raiseAmount`.
3. There are zero live `spec-140-category-c` comment blocks and zero `microturnMigration: 'spec-140'` metadata markers in the profile files, so the draft ticket's replacement target does not yet exist in repo-owned artifacts.
4. Ticket 002's audit remains useful evidence, but it is an investigation artifact, not proof that the migration prerequisite has landed. Its non-zero Category `C` result still stands, but against a corpus that remains unmigrated.

## Architecture Check

1. Evolution-first (F2): the eventual re-evolution still belongs in YAML/profile space, not engine code.
2. Ticket fidelity: the repo does not currently own the microturn-native profile corpus this campaign would need. Marking the ticket blocked is cleaner than fabricating campaign artifacts against a state that does not exist.
3. F14 / architectural completeness: a truthful boundary requires the migration prerequisite to land first. Running the campaign now would either mutate the wrong profile surface or silently absorb a broader migration ticket.
4. The future success condition remains the same once unblocked: replace genuinely non-portable heuristics with re-evolved microturn-native expressions that meet the agreed baseline on the canary corpus.

## What to Change

### 1. Preserve this ticket as the future campaign owner

Keep ticket 009 as the owner of the eventual Category `C` re-evolution campaign.

### 2. Block on the real prerequisite

Do not create campaign artifacts or edit profile YAML in this ticket until the profile corpus is truthfully migrated onto the microturn-native surface.

### 3. Reopen only after the prerequisite lands

When the prerequisite migration exists in repo-owned artifacts, this ticket should be rewritten back into an active campaign ticket with:

- a concrete post-migration Category `C` target set
- reproducible campaign seeds and budget
- baseline comparison runs against the migrated corpus
- replacement expressions committed back into the live YAML files

## Files to Touch

- `tickets/140MICRODECPRO-009.md` (modify — durable blocked-state rewrite)

## Out of Scope

- Running MAP-Elites in the current repo state.
- Editing `data/games/fire-in-the-lake/92-agents.md` or `data/games/texas-holdem/92-agents.md` in this ticket.
- Recreating the archived ticket 008 split automatically.
- Engine/runtime code changes.

## Acceptance Criteria

### Tests That Must Pass

1. `grep -rn "spec-140-category-c|microturnMigration" data/games/` confirms the draft campaign input surface does not yet exist in live YAML.
2. `grep -rn "candidate\\.param|scopes: \\[completion\\]" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md` confirms the prerequisite migration gap still exists.
3. `pnpm run check:ticket-deps` passes after the blocked-state rewrite.

### Invariants

1. This ticket does not claim campaign artifacts or re-evolved expressions landed when the prerequisite corpus does not exist.
2. The active series remains honest: ticket 009 is a blocked future campaign, not a currently implementable migration slice.
3. No production code or profile YAML changes are made in this ticket turn.

## Outcome

**Blocked**: 2026-04-20

The original draft assumed ticket 008 had already converted the live profile corpus into a microturn-native form with explicit Category `C` placeholders. Reassessment showed that assumption was false: the live FITL and Texas profile YAML still contain completion/preview-era policy expressions, and ticket 007 explicitly preserved the legacy policy-eval substrate because the live witness set still depended on it.

This turn therefore rewrote ticket 009 to a truthful blocked state instead of fabricating a re-evolution campaign against a non-existent migrated corpus.

- `ticket corrections applied`: `campaign against already-migrated microturn-native profiles -> blocked pending the actual profile-migration prerequisite`
- `verification set`: `grep -rn "spec-140-category-c|microturnMigration" data/games/`, `grep -rn "candidate\\.param|scopes: \\[completion\\]" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md`, `pnpm run check:ticket-deps`
- `proof gaps`: `future campaign execution remains blocked until the live profile corpus is actually migrated`

## Test Plan

### New/Modified Tests

None — this turn is a ticket-boundary correction only.

### Commands

1. `grep -rn "spec-140-category-c|microturnMigration" data/games/`
2. `grep -rn "candidate\\.param|scopes: \\[completion\\]" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md`
3. `pnpm run check:ticket-deps`
