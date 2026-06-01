# 204FITLVCCOM-005: P2a - VC strategy modules

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None - YAML authoring in `data/games/fire-in-the-lake/92-agents.md`
**Deps**: `archive/tickets/204FITLVCCOM-004.md`

## Problem

Spec 204 P1 authored the VC selectors and plan-template library, but `vc-baseline` still lacks the strategy modules that make those templates doctrine-driven. Without `vc.oppositionEngine`, `vc.baseNetwork`, `vc.subvertPatronage`, `vc.agitationReadiness`, and `vc.nvaRivalRisk`, the new templates remain ungated library entries and the VC profile still does not encode the Opposition, Base-network, Coup-prep, ARVN-denial, and NVA-rival-risk priorities from Spec 204 §4.3.

## Assumption Reassessment (2026-06-01)

1. Tickets 003 and 004 are archived, so the selectors and plan templates referenced by Spec 204 §4.3 exist in the current authoring file.
2. The verified strategy-module surface is `traceLabel` / `when` / `applies` / `priority` / optional `selectors` / `scoreGroups` / `guardrailIds` / `fallback`, with `enablesPlanTemplates` and `suppressesPlanTemplates` already used by nearby US and NVA modules.
3. This ticket authors only module definitions. Binding the modules into `vc-baseline.use.strategyModules` is deferred to ticket 007 so compile feedback can isolate library authoring from profile activation.

## Architecture Check

1. Pure GameSpecDoc YAML preserves Foundations #1 and #2; no game-specific engine code is introduced.
2. The modules reuse the same generic doctrine gates used by Specs 202 and 203, avoiding a VC-specific scoring shortcut.
3. Module authoring is separated from baseline binding so downstream witness failures can identify whether the issue is in artifact definition or activation.

## What to Change

### 1. Author five VC strategy modules

Add the following modules under the existing strategy-module library in `data/games/fire-in-the-lake/92-agents.md`, near the current VC modules:

- `vc.oppositionEngine`
- `vc.baseNetwork`
- `vc.subvertPatronage`
- `vc.agitationReadiness`
- `vc.nvaRivalRisk`

Use Spec 204 §4.3 as the starting shape, but reassess each ref against the live authored surface. In particular, keep `vc.agitationReadiness` compatible with the ticket-004 resolution that `vc.agitationPrep` uses Coup-support `agitate` while card-phase preparation routes through `vc.rallyTax`, `vc.marchSpread`, and `vc.terrorTax`.

### 2. Preserve existing module behavior

Do not edit or remove `vc.buildPoliticalNetwork`, `vc.subvertRegimeSecurity`, `vc.fundAndAmbushCarefully`, or `vc.denyNvaIfNearWin`. New modules must be additive library entries.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Posture evaluators and guardrails; owned by ticket 006.
- Binding modules into `vc-baseline`; owned by ticket 007.
- New profile-quality witnesses; owned by ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build
3. `pnpm run check:ticket-deps`

### Invariants

1. New module refs resolve without extending engine or compiler ref namespaces.
2. New modules reference only authored selectors, templates, conditions, and candidate features.
3. No new module is bound to `vc-baseline` in this ticket.

## Test Plan

### New/Modified Tests

- None. Behavioral activation and new witnesses are owned by tickets 007 and 008.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `cd packages/engine && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`
3. `pnpm run check:ticket-deps`
