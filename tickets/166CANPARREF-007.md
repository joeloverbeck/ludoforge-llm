# 166CANPARREF-007: Cookbook retirement-line rewrite + new candidate-parameter-refs recipe

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `tickets/166CANPARREF-006.md`

## Problem

Spec 166 §4.7 mandates two documentation updates in `docs/agent-dsl-cookbook.md`:

1. Rewrite the retirement sentence (`"...without reviving retired decision.*, option.value, or candidate.param.* authoring"`) to distinguish the retired singular form from the current plural form.
2. Add a new "Action-Selection Candidate Parameter Refs" recipe covering the four authoring shapes from Spec §4.1 (required param with `candidateParamFallback`; optional param with `onMissing` constant; multi-card pivotal preference; mixed-surface declaration), plus the trichotomy between `candidate.params.*` (action-selection scope), `microturn.option.*` (microturn scope), and `lookup.*` (state-keyed).

The recipe needs working end-to-end examples; tickets 001–006 land the surface those examples reference.

## Assumption Reassessment (2026-05-11)

1. `docs/agent-dsl-cookbook.md` carries the retirement sentence per Spec §2.1 / §4.7. Confirm the exact location during implementation (grep for `candidate.param.*` to find the line).
2. The cookbook uses recipe-style examples with YAML blocks — preserve that style.
3. Tickets 001–006 are landed; the parser accepts `candidate.params.<name>`, the resolver honors `onMissing`, traces propagate, and FITL `event` action declarations carry the four canonical params. Every example in the new recipe can be copy-pasted into a profile and compile cleanly.
4. The four authoring shapes from Spec §4.1 are: (a) required param with `candidateParamFallback: { onUnavailable: noContribution }`; (b) optional param with `onMissing: { constant: __absent__ }`; (c) multi-card pivotal preference with `appliesToActions: [pivotalEvent]` and `in` operator; (d) implicit — a mixed-surface consideration declaring both `previewFallback` and `candidateParamFallback`.

## Architecture Check

1. **No code change (Foundation #1 / Foundation #6).** Documentation-only update; engine and compiler are unchanged.
2. **Surface fidelity.** Every YAML example is copy-paste-valid and exercises the full parser path landed by tickets 002 and 003. Stale examples in cookbooks are a recurring drift hazard; this ticket's examples are tied to live test fixtures or to FITL declarations landed by ticket 006.
3. **Trichotomy clarity.** The cookbook's existing pattern is to document each ref family with a "use this family when..." matrix. The new recipe adds `candidate.params.*` as the third row alongside `microturn.option.*` and `lookup.*`, making the action-selection-scope discrimination surface complete (Spec §1 table).

## What to Change

### 1. Rewrite the retirement sentence

Locate the sentence in `docs/agent-dsl-cookbook.md` matching `"...without reviving retired decision.*, option.value, or candidate.param.* authoring"` (or close paraphrase). Replace with three bullet points per Spec §4.7:

- `decision.*` (singular) — retired and invalid; no replacement (decisions are not policy-authored).
- `option.value` — retired and invalid; replaced by `microturn.option.value` at microturn scope.
- `candidate.param.<name>` (singular) — retired and invalid; replaced by `candidate.params.<name>` (plural) at action-selection scope.
- `microturn.option.*` — current; microturn option surface.

The retirement language is preserved verbatim where applicable so existing search anchors / cross-references continue to resolve.

### 2. Add "Action-Selection Candidate Parameter Refs" recipe

Add a new top-level recipe section (heading depth matching the cookbook's existing recipe convention — likely `##` per existing recipes). Section structure:

#### When to use this family

`candidate.params.<name>` reads a typed scalar parameter directly off the published action-selection candidate. Use it when:

- You need to score same-action variants by a typed scalar field (e.g., FITL `event.side` ∈ `{unshaded, shaded}`).
- You want the read to be state-local — no preview drive, no path walk against authoritative state.
- You're at action-selection scope (`scopes: [move]`). For microturn-scope discrimination, use `microturn.option.value` instead.

#### Comparison matrix (extend the cookbook's existing matrix)

| What's being chosen | Ref family | Scope |
|---|---|---|
| Action class | `candidate.tag.<actionId>`, `candidate.intrinsic.actionId` | move |
| Same-action variant (typed scalar param) | **`candidate.params.<name>`** | move |
| Microturn option value | `microturn.option.value`, `microturn.option.tags`, `microturn.option.targetKind` | microturn |
| Projected scalar metric | `preview.victory.*`, `preview.feature.*`, `preview.var.*` | move (preview-derived) |
| Projected keyed property | `lookup.surface: previewOptionState` | move (preview-derived) |

#### Four canonical authoring shapes

Reproduce the four YAML blocks from Spec §4.1 verbatim:

1. Required param with `candidateParamFallback` (avoid-shaded-event).
2. Optional param with `onMissing: { kind: constant }` constant fallback (prefer-event-branch).
3. Multi-card pivotal preference with `appliesToActions: [pivotalEvent]` (prefer-specific-pivotal).
4. Mixed-surface example combining `candidate.params.*` with `lookup.*` or `preview.*` — both fallbacks declared.

#### Fallback decision tree

```
Does any candidate.params.<name> ref in your value expression have onMissing: 'unavailable' (the default)?
├── YES → You MUST declare candidateParamFallback.onUnavailable.
└── NO (every ref has onMissing: { kind: constant }) → No candidateParamFallback required.

Does your value expression also read preview-derived refs?
├── YES → Also declare previewFallback.onUnavailable.

Does your value expression also read lookup.surface refs?
├── YES → Also declare lookupFallback.onUnavailable.
```

#### Diagnostic codes reference

A small inline table mapping the six new diagnostic codes (introduced by ticket 001) to short descriptions of when each fires — helps authors decode compile errors. Each code links / refers back to Spec §5.1.

### 3. Cross-reference Spec 166

Add a single-line provenance pointer at the end of the recipe: `Spec source: specs/166-candidate-parameter-refs.md` so authors can navigate to the canonical source.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify)

## Out of Scope

- Any engine, compiler, runtime, or test changes — owned by tickets 001–006.
- Documentation of the new trace surface (`unknownCandidateParamRefs`, `candidateParamFallbackFired`) outside the cookbook recipe — the canonical surface description lives in Spec 166 §4.5 and §6, not in the cookbook.
- Cross-document edits to `FOUNDATIONS.md`, `docs/architecture.md`, or AGENTS.md — Spec §10 explicitly states `docs/FOUNDATIONS.md` is unchanged. The cookbook is the only doc this ticket touches.
- Updates to the `docs/agent-dsl-cookbook.md` reassess-cookbook skill cadence — separate workflow.

## Acceptance Criteria

### Tests That Must Pass

1. Every YAML block in the new recipe compiles cleanly when wrapped in a minimal valid agent-profile YAML — verify by running the synthetic fixture or an inline smoke check during implementation.
2. The retirement sentence rewrite preserves cross-reference anchors: any other document or test referencing the original sentence still finds the relevant paragraph.
3. `pnpm turbo lint` — passes (markdown lint, if configured).
4. Existing suite: `pnpm turbo test` — full pass; no regression.

### Invariants

1. The cookbook is authoritative for the authoring surface only. Diagnostic-code semantics, ref-family resolution semantics, and trace shape semantics remain canonical in the spec, not the cookbook (cookbook references back to the spec).
2. Foundation #14 — the retirement of the singular `candidate.param.<name>` form is preserved as a documented dead-end, NOT as an alias for the plural form. The recipe explicitly states "the singular form is retired and rejected; no alias path."

## Test Plan

### New/Modified Tests

No new tests authored by this ticket. The architectural-invariant test `candidate-params-retired-namespace-rejected.test.ts` (ticket 002) already guards the singular-form rejection at the parser level, which the cookbook documents.

### Commands

1. `pnpm turbo lint`
2. `pnpm turbo test`
3. Manual: copy each cookbook YAML block into a minimal agent-profile fixture and run `pnpm -F @ludoforge/engine test --test-name-pattern=<targeted>` to confirm clean compilation against the synthetic two-action fixture or FITL.
4. `pnpm run check:ticket-deps`
