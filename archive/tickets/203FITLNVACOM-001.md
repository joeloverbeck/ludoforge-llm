# 203FITLNVACOM-001: NVA selector vocabulary survey (P0)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — audit only
**Deps**: `specs/203-fitl-nva-completion.md`

## Problem

Spec 203 §11 carries 5 open questions about whether specific authoring refs and source-collection shapes exist in the current FITL DSL surface. Spec 203's §§4.1–4.4 stanzas use these refs as if available, with fallback paths noted when not. Before any plan template / selector / module / posture / guardrail YAML is authored (tickets 002+), the team needs concrete answers so the §4 stanzas can be finalized without speculative refs.

The §11 open questions are:

1. `tokenProp.zone.*` post-Infiltrate prediction refs (e.g., `nvaPieceCountPostInfiltrate`, `allOtherPieceCount`, `nvaControlPostInfiltrate`).
2. `feature.nvaTroopCount` availability.
3. `feature.projectedVcMarginDelta` / `preview.feature.projectedVcMarginDelta` availability.
4. `roleTarget.X.isVcBase` / `roleTarget.X.changesControl` post-binding role-target refs.
5. `source.collection.kind: tokens` with `faction:` filter support.

This ticket produces the inventory those answers consume, plus a documented fallback path for each unavailable ref so ticket 002 can author against a concrete surface.

## Assumption Reassessment (2026-05-31)

1. Reassessment confirmed `feature.nvaBaseCount` exists at `data/games/fire-in-the-lake/92-agents.md:176`, and `feature.projectedSelfMarginDelta@253` / `feature.projectedTrailDelta@343` / `feature.nvaMargin@67` are already authored at multiple sites.
2. Reassessment did not confirm the remaining refs (P0 scope). Spec 203's §11 lists them as P0 deliverables.
3. No mismatch with codebase truth — refs known-available are excluded from this ticket's scope; only the unresolved ones remain.

## Architecture Check

1. The survey is read-only — it greps the existing authored profile (`92-agents.md`) and the DSL compiler / schema source to answer each question. No engine changes, no data authoring.
2. Findings are recorded in this ticket's Outcome section, which becomes the durable input for ticket 002 — no separate report file (minimize artifacts).
3. For each unavailable ref, the survey documents a concrete fallback path (e.g., post-state `lookup` predicates, current-state aggregation with posture-time filtering) that downstream tickets can adopt without speculative authoring.

## What to Change

### 1. Token-prop post-Infiltrate refs

Grep `data/games/fire-in-the-lake/92-agents.md` and `packages/engine/src/` for `tokenProp\.zone\.`, `tokenProp.*postInfiltrate`, and similar predictive shapes. Determine whether the FITL DSL provides post-Infiltrate token aggregates, or whether the proposal must rely on current-state aggregation plus posture-time filtering.

### 2. Feature inventory

For each candidate feature name in Spec 203's §§4.1–4.4 — `feature.nvaTroopCount`, `feature.projectedVcMarginDelta`, `preview.feature.projectedVcMarginDelta`, `preview.feature.nvaBaseCount` — grep `92-agents.md` to confirm authored existence. If not authored, check `packages/engine/src/agents/`, `packages/engine/src/cnl/`, or `packages/engine/dist/` for compiler support of the feature name.

### 3. Role-target refs

Grep for `roleTarget\.` in `92-agents.md` to enumerate authored post-binding role-target refs. Determine whether `.isVcBase` and `.changesControl` are supported by the role-target ref vocabulary, or whether the §4.4 guardrails must use post-state `lookup` predicates on `tokens.vcBase` / control-swing aggregates.

### 4. Token-scoped source collections

Grep for `source: { collection: { kind: tokens` in `92-agents.md`. Determine whether token-scoped selectors with faction filters are an authored pattern, or whether `nva.infiltrateForNvaGain` must stay zone-scoped with per-zone scoring on VC-token presence (the §4.2 draft already takes this safer route).

### 5. Inventory output

Record findings in this ticket's Outcome section as a 5-question Q&A:
- For each question: status (available / not authored / structurally adjacent / requires authoring elsewhere) plus the line citation or source-file evidence.
- For each unavailable ref: the documented fallback path that ticket 002 will adopt.

## Files to Touch

- `tickets/203FITLNVACOM-001.md` (modify — Outcome section after survey completes)

## Out of Scope

- No data authoring (`data/games/fire-in-the-lake/92-agents.md` is read-only).
- No engine changes (`packages/engine/src/**` is read-only).
- No new report files or fixtures — the inventory lives in this ticket's Outcome section.
- No re-validation of refs already confirmed by the reassessment (`feature.nvaBaseCount@176`, `feature.projectedSelfMarginDelta@253`, `feature.projectedTrailDelta@343`, `feature.nvaMargin@67`, `condition.X.satisfied` form).

## Acceptance Criteria

### Tests That Must Pass

1. No tests modified; this is an audit ticket.
2. Existing suite: `pnpm turbo test` continues to pass (sanity).

### Invariants

1. Every Spec 203 §11 open question receives an explicit answer (available / unavailable + concrete fallback path).
2. No speculative refs survive into this ticket's Outcome — only confirmed availability or a concrete fallback path.

## Test Plan

### New/Modified Tests

None — audit ticket. The deliverable is the inventory in the Outcome section.

### Commands

1. `grep -nE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' data/games/fire-in-the-lake/92-agents.md`
2. `grep -rnE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' packages/engine/src/`
3. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-31

This ticket was an audit-only selector vocabulary survey. No source, schema, YAML doctrine, or tests were changed. The survey used the ticket-named grep commands plus focused reads of the matching compiler/schema sources to answer the five Spec 203 §11 questions.

### 1. `tokenProp.zone.*` post-Infiltrate prediction refs

Status: not authored.

Evidence:
- `grep -nE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' data/games/fire-in-the-lake/92-agents.md` returned no `tokenProp.zone.*` hits.
- `grep -rnE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' packages/engine/src/` returned only the generic preview-feature collection site for this pattern family, not `tokenProp.zone.*`.
- `packages/engine/src/cnl/compile-conditions-values.ts` lowers only the structured `{ ref: "tokenProp", token: string, prop: string }` form for token properties.
- `packages/engine/src/kernel/types-ast.ts` / `schemas-ast.ts` expose generic `tokenProp`, not a `tokenProp.zone.*` predictive ref family.

Fallback for ticket 002: keep `nva.infiltrateForNvaGain` zone-scoped and score current-state VC-token presence with `lookup`/zone token aggregates, then rely on strategy/posture/guardrail filters from tickets 003-004 for NVA-gain vs VC-denial behavior. Do not author `tokenProp.zone.nvaPieceCountPostInfiltrate`, `tokenProp.zone.allOtherPieceCount`, or `tokenProp.zone.nvaControlPostInfiltrate`.

### 2. `feature.nvaTroopCount`

Status: not authored.

Evidence:
- `feature.nvaBaseCount` is authored at `data/games/fire-in-the-lake/92-agents.md:176`, but exact searches found no `feature.nvaTroopCount`.
- The compiler resolves feature refs from authored `stateFeatures` / `candidateFeatures`; there is no built-in `nvaTroopCount` fallback in `packages/engine/src/cnl/compile-agents.ts`.

Fallback for ticket 003: either author a new generic state feature in `92-agents.md` using the existing `globalTokenAgg` pattern over NVA troop tokens, or use the existing `feature.nvaBaseCount` / `feature.nvaMargin` gates when the module can be expressed without troop count. Because ticket 003 is data-authoring scope, the preferred downstream path is to author `feature.nvaTroopCount` as FITL YAML data if `nva.conventionalPressure` needs that exact gate.

### 3. `feature.projectedVcMarginDelta` / `preview.feature.projectedVcMarginDelta`

Status: exact delta feature not authored; adjacent projected VC margin is authored.

Evidence:
- `data/games/fire-in-the-lake/92-agents.md:229` defines `candidateFeatures.projectedVcMargin`.
- Existing selectors and guardrails consume `feature.projectedVcMargin` at `92-agents.md:702`, `:807`, `:1256`, `:1365`, and `:2652`.
- `projectedSelfMarginDelta`, `projectedUsMarginDelta`, and `projectedArvnMarginDelta` are authored at `92-agents.md:253`, `:259`, and `:265`; exact searches found no `projectedVcMarginDelta`.
- `packages/engine/src/cnl/compile-agents.ts` collects `preview.feature.<id>` dependencies for authored candidate features, so `preview.feature.projectedVcMarginDelta` would require the candidate feature id to exist first.

Fallback for ticket 003: if VC-margin delta is needed, author `projectedVcMarginDelta` in `candidateFeatures` as `feature.projectedVcMargin - feature.vcMargin`, mirroring the self/US/ARVN delta features. Until that feature exists, use a direct expression comparing `feature.projectedVcMargin` with `feature.vcMargin`, as the existing `nva.doNotServeVcWin` guardrail already does.

### 4. `roleTarget.X.isVcBase` / `roleTarget.X.changesControl`

Status: not authored.

Evidence:
- The ticket-named grep over `92-agents.md` returned no `roleTarget.*` hits.
- Focused source search found supported candidate refs such as `candidate.tag.*`, `candidate.params.*`, `candidate.actionId`, and `candidate.stableMoveKey`, but no `roleTarget.*` policy-ref family.
- Plan-template validation tracks declared and bound roles for template constraints, but does not expose post-binding role-target predicate refs to policy expressions.

Fallback for ticket 003: do not author `roleTarget.infiltrateSpace.isVcBase` or `roleTarget.bombardTarget.changesControl`. Use post-state `lookup` predicates against `previewOptionState` / `policyState` zone token counts where the selected zone is available through candidate params or selector role binding; when that binding is not expressible, keep the guardrail broader and use feature comparisons such as `feature.projectedVcMargin > feature.vcMargin` or `feature.projectedSelfMarginDelta < 1`.

### 5. Token-scoped `source.collection`

Status: available, but only with `tokenType`, not a `faction:` filter in the collection shape.

Evidence:
- `data/games/fire-in-the-lake/92-agents.md:713` already authors `source: { collection: { kind: tokens } }`.
- `packages/engine/src/cnl/game-spec-doc.ts` defines selector collections as `{ kind: 'tokens'; tokenType?: string }`.
- `packages/engine/src/cnl/compile-agent-selectors.ts` normalizes `kind: 'tokens'` and optional `tokenType`; it does not accept `faction`.

Fallback for ticket 002: token-scoped selectors are legal when token enumeration is useful, but do not write `source.collection.kind: tokens` with `faction:`. Prefer the already-drafted safer zone-scoped selector for `nva.infiltrateForNvaGain`; if a token-scoped selector is required later, filter via supported token type or current/post-state lookup expressions rather than a collection-level faction filter.

### Verification

- `grep -nE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' data/games/fire-in-the-lake/92-agents.md` — completed; decisive hits/non-hits recorded above.
- `grep -rnE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' packages/engine/src/` — completed; decisive hits/non-hits recorded above.
- `pnpm run check:ticket-deps` — passed; ticket dependency integrity check passed for 6 active tickets and 2569 archived tickets.
- `git diff --check -- tickets/203FITLNVACOM-001.md .codex/run-state/implement-spec-tickets.json` — passed.
- `pnpm turbo test` — passed through Turbo; 5 tasks successful, engine default lane reported 189/189 test files passed.
