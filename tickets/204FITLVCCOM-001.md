# 204FITLVCCOM-001: P0a — Capability / vocabulary re-expression audit

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — audit only
**Deps**: `specs/204-fitl-vc-completion.md`

## Problem

Spec 204 §4 (Architecture) references several refs, zone-prop reads, predicates, and candidateFeatures whose authoring shape is not fully confirmed against the codebase. The downstream P1 authoring tickets (003, 004) bake those references into `data/games/fire-in-the-lake/92-agents.md`; without an upfront audit, P1 tickets may either (a) propagate a non-existent ref name, (b) author a proxy that doesn't match the real per-zone read surface, or (c) repeat the trigger-report's fictional-schema mistake the reassessment already caught.

Specifically, three signals are flagged as P0 deliverables in spec §11 and §5:

- **`vc.subvertHighValueTarget` zone-prop vocabulary** — the selector binds an ARVN-Patronage-priority proxy whose final form (population + supportOpposition marker + `feature.projectedArvnMarginDelta` sign filter is the candidate) is undecided.
- **`feature.vcUndergroundGuerrillaCount` authoring path** — the unfiltered `feature.vcGuerrillaCount@92-agents.md:95` exists, but the Underground-filtered variant the §4.4 posture wants does not. Three resolution paths: (a) author via `globalTokenAgg` with a token-active-state filter, (b) re-express the posture via per-zone `lookup` of the Underground marker, (c) fall back to the coarser `vcGuerrillaCount` proxy.
- **`feature.projectedNvaMarginDelta` operands** — sibling of the existing `projectedArvnMarginDelta@274`/`projectedVcMarginDelta@280`. Both operands (`feature.projectedNvaMargin` and `feature.nvaMargin`) must exist for the `sub(...)` candidateFeature pattern to compile.

The audit produces a single classification table — one row per signal in spec §4, each classified (a) authorable / (b) authorable via proxy / (c) requires engine work — modeled on the Spec 202 capability audit at `archive/specs/202-fitl-us-completion.md:466-478`. No (c) entries should remain at audit close; if one does, the spec needs an engine-prerequisite dependency, not P1 authoring.

## Assumption Reassessment (2026-06-01)

1. Spec 204 was just rewritten in this session under the verified authoring surface; §4 references are spec-current. The audit verifies them against `data/games/fire-in-the-lake/92-agents.md` and the engine ref vocabulary (under `packages/engine/src/`).
2. The Spec 202 audit table at `archive/specs/202-fitl-us-completion.md:466-478` is the canonical precedent for this pattern — same trigger report, same classification methodology.
3. `feature.totalOpposition@172`, `feature.vcBaseCount@104`, `feature.vcGuerrillaCount@95`, `feature.projectedArvnMarginDelta@274`, `feature.projectedVcMarginDelta@280`, `condition.coupImminent.satisfied@486`, `condition.nvaNearWin.satisfied@450`, `condition.arvnNearWin.satisfied@438`, `condition.resourcesLow.satisfied@498` are all already-authored and confirmed by the reassessment — they do NOT need re-audit. The audit focuses on signals NOT in this list.

## Architecture Check

1. **F1 (Engine Agnosticism)** — the audit's exit criterion is "no (c) entries"; any signal that requires engine work blocks this spec and is escalated as a follow-up engine spec rather than absorbed into P1.
2. **F2 (Evolution-First)** — every retained signal must be expressible via existing item-local read surfaces (`zoneProp` for static attrs, `lookup` for markers, `zoneTokenAgg`/`adjacentTokenAgg` for per-zone numerics, `feature.*` for globals) without introducing new authoring constructs.
3. **F15 (Architectural Completeness)** — root-cause closure of the vocab gap before authoring; mirrors Spec 202's P0 capability audit pattern (ticket 202FITLUSCOMP-001).
4. **No backwards-compatibility shims** — the audit's classification table is appended to spec §11; no parallel data file or registry is introduced.

## What to Change

### 1. Build the audit table

For each signal listed in spec §4 (Architecture) NOT already confirmed in the reassessment context, classify as:

- **(a) authorable** — exists in engine vocab, used by existing authored YAML.
- **(b) authorable via proxy** — does not exist as named, but expressible via composition of existing surfaces (e.g., `lookup` against `supportOpposition` marker + `feature.projectedArvnMarginDelta` for ARVN-Patronage priority).
- **(c) requires engine work** — no existing surface supports the signal; would need a new ref / aggregate operator / type to be authored in the engine. (Any (c) entry blocks Spec 204 and escalates to a follow-up engine-prerequisite spec.)

Minimum signals to classify (cross-check against spec §4 to ensure completeness):

- **`vc.subvertHighValueTarget` ARVN-Patronage proxy** — propose the score-component composition. Candidate per spec §11: `population` (high-value targets) + `supportOpposition` marker filter (passiveSupport / activeSupport) + a sign filter on `feature.projectedArvnMarginDelta` favoring negative deltas.
- **Underground-Guerrilla feature** — resolve (a) `globalTokenAgg` with a token-active-state filter (verify the operator supports it), (b) per-zone `lookup` of the Underground marker (verify the marker name and onMissing semantics), or (c) fall back to `feature.vcGuerrillaCount@95`. Cite the chosen path with reference shape.
- **`feature.projectedNvaMarginDelta`** — confirm both `feature.projectedNvaMargin` and `feature.nvaMargin` exist in `data/games/fire-in-the-lake/92-agents.md`. If yes, classify (a) and provide the candidateFeature stanza for authoring in ticket 003.
- **Item-local zone-prop reads** the spec §4.2 selectors use: `population`, `econ`, `category` (verify `loc`/`highland`/`jungle` values for §4.2's `vc.rallyBaseTarget`), `terrain` if referenced. Cross-check against `vc.taxFundingSpace@1555` and `vc.terrorAgitationSpace@1509` for authored shape.
- **Dynamic-state reads** the spec §4.2 selectors use: `supportOpposition` marker via `lookup`; per-zone faction-token reads via proxies per Spec 202's §11 audit. Document which proxies cover which spec §4.2 signals.

### 2. Record outcomes in spec §11

Append the audit table to `specs/204-fitl-vc-completion.md` §11 (Open Questions). Each prior P0a question line becomes a "Resolved by 204FITLVCCOM-001 (YYYY-MM-DD): <classification>" line. Preserve P0b's question (it's owned by ticket 002).

### 3. Build verification

Run `pnpm -F @ludoforge/engine build` to confirm the spec changes do not regress engine compilation (the spec is a markdown doc — build verifies no YAML accidentally moved into the spec; sanity check only).

## Files to Touch

- `specs/204-fitl-vc-completion.md` (modify — append audit table to §11)

Read-only references for the audit (no edits):
- `data/games/fire-in-the-lake/92-agents.md` (engine vocab, existing selectors/features)
- `packages/engine/src/agents/policy-evaluation-core.ts` (ref resolver, per Spec 202 audit citation `policy-evaluation-core.ts:1784-1818`)
- `packages/engine/src/agents/plan-proposal.ts` (selector resolver, per Spec 202 audit citation `plan-proposal.ts:729`)
- `archive/specs/202-fitl-us-completion.md:466-478` (audit table precedent)

## Out of Scope

- No YAML authoring in `data/games/fire-in-the-lake/92-agents.md` — that's ticket 003 (P1 features + selectors) and ticket 004 (P1 templates).
- No engine code changes — if a signal classifies (c), escalate as a new engine-prerequisite spec rather than absorbing here.
- No changes to spec §4 (Architecture) — the spec body is correct under the verified surface; only §11 receives the resolution log.
- No `vc.agitationPrep` action-tag decision — that's ticket 002 (P0b).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds (sanity; spec is markdown).
2. `pnpm run check:ticket-deps` succeeds.

### Invariants

1. Every spec §4 signal NOT in the reassessment-confirmed list has a row in the audit table with a classification (a / b / c).
2. No (c) entries remain at ticket close. If a (c) is unavoidable, the ticket is descoped to "block — needs engine-prerequisite spec" rather than closed as Done, and a new engine spec is opened.
3. The audit table preserves spec §11's existing prose entries (P0b, threshold calibration, posture attachment); only P0a questions are resolved.

## Test Plan

### New/Modified Tests

- None — this is an audit ticket. Verification is by review of the audit table in spec §11.

### Commands

1. `pnpm run check:ticket-deps` — validates this ticket's Deps field.
2. `pnpm -F @ludoforge/engine build` — sanity-check that spec modifications don't break the spec→engine flow.
3. Manual review of `specs/204-fitl-vc-completion.md` §11 — confirm audit-table classifications.
