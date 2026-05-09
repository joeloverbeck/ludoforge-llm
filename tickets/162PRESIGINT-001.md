# 162PRESIGINT-001: Foundation #20 — Preview Signal Integrity (FOUNDATIONS amendment)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `specs/162-preview-signal-integrity.md`

## Problem

Spec 162 introduces a new architectural commandment: bounded preview output cannot masquerade as ready evidence. The contract currently has no Foundation-level statement, so downstream tickets in this spec have no canonical text to cite for invariants like "non-`ready` preview ref MUST NOT silently coerce into a numeric contribution" and "selection that fell through to a non-preview path MUST be visible in trace output". Phase 0 lands the doctrine before any code changes.

## Assumption Reassessment (2026-05-09)

1. `docs/FOUNDATIONS.md` exists and currently contains 19 numbered Foundations (`#1` through `#19`) followed by an Appendix paragraph. Verified: file ends with `## 19. Decision-Granularity Uniformity` and an `## Appendix` section that lists prior spec amendments.
2. The Appendix already accumulates spec-amendment provenance lines (Spec 136, 139, 140, 144 mentioned). Adding a Spec 162 amendment line is consistent with the existing pattern.
3. `docs/architecture.md` may summarize Foundations elsewhere; confirm during implementation whether a parallel update is needed (spec §8 Phase 0 acceptance criterion notes "if it summarizes Foundations").

## Architecture Check

1. **Pure documentation amendment.** No code change. The Foundation text gives downstream tickets a canonical anchor for their Architecture Check sections (e.g., "preserves Foundation #20 by exposing per-ref availability"). This sequencing ensures every later ticket in this spec can cite §20 by number.
2. **Game-agnostic boundary preserved.** Foundation #20 talks only about preview-pipeline output integrity, observer scope, and trace shape. No game-specific content enters the engine layer.
3. **No backwards-compatibility shims.** This is a new Foundation; nothing to deprecate or alias.

## What to Change

### 1. Append Foundation #20 to `docs/FOUNDATIONS.md`

Insert the Foundation #20 block from spec §4 immediately after `## 19. Decision-Granularity Uniformity` and before the `---` that precedes the Appendix. Use the spec's exact text:

> ## 20. Preview Signal Integrity
>
> **Policy-preview output is advisory evidence with explicit provenance, not an implicit scalar.**
>
> Every preview-derived ref MUST expose its observer scope, resolution status, budget outcome, and fallback path. Ready, unknown, hidden, stochastic, unresolved, failed, depth-capped, and partial results are distinct semantic outcomes. Unavailable preview refs (any non-`ready` status) MUST NOT be silently coerced into numeric contributions; any consideration that converts an unavailable preview ref into a contribution MUST declare that fallback explicitly in profile YAML, and the chosen fallback MUST be visible in deterministic trace output. When all root-option drives at a microturn yield no usable signal for the requested refs, the runtime MUST mark the resulting selection as `tiebreakAfterPreviewNoSignal` and emit a `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory.
>
> Preview signal integrity is enforced at the engine layer; profile-quality witness claims about preview behavior live alongside other policy-quality regression signals (see Appendix). This Foundation operates jointly with Foundations #9 (replay), #10 (bounded computation), #15 (architectural completeness), and #16 (testing as proof): bounded preview remains bounded; the integrity guarantee is that bounded preview cannot pretend to be unbounded preview.

### 2. Append amendment line to the Appendix

Add the Spec 162 line per spec §4 to the existing amendment list in the Appendix:

> Spec 162 added Foundation #20 (Preview Signal Integrity) to formalize the contract that bounded preview output cannot masquerade as ready evidence.

### 3. Verify `docs/architecture.md`

Read `docs/architecture.md`. If it contains a Foundations summary or list, append a one-line entry for #20. If not, no change needed.

## Files to Touch

- `docs/FOUNDATIONS.md` (modify)
- `docs/architecture.md` (modify only if it summarizes Foundations)

## Out of Scope

- Any engine code changes — those land in 002, 003, 004, 005.
- Cookbook updates — that's 006.
- Test additions — 002–006 own their respective tests.

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm turbo test` (no behavior change).
2. Existing suite: `pnpm turbo lint` (markdown-lint, if configured).

### Invariants

1. Foundation #20 text exactly matches spec §4 wording (no paraphrase).
2. Foundation numbering remains contiguous (`#1` through `#20`); the Appendix is preserved verbatim aside from the appended amendment line.

## Test Plan

### New/Modified Tests

None — pure documentation.

### Commands

1. `pnpm turbo lint` (catches markdown lint regressions if present).
2. Manual review: verify §20 placement (after §19, before `---`/Appendix) and Appendix amendment line.

## Implementation Outcome

Completed on 2026-05-09.

- Landed Foundation #20 in `docs/FOUNDATIONS.md` immediately after Foundation #19 and before the Appendix separator, using the exact text from spec §4.
- Appended the Spec 162 amendment sentence to the existing Foundations Appendix provenance list.
- Verified `docs/architecture.md` does not contain a numbered Foundations summary or list, so no architecture-doc edit was required.
- Generated fallout: none; documentation-only amendment.
- Deferred scope: engine plumbing, trace observability, compiler diagnostics, fixture migrations, and cookbook updates remain owned by later 162PRESIGINT tickets.
- Command reconciliation before final proof: `pnpm turbo lint` and manual structural review are the direct docs proof lanes; `pnpm turbo test` is also run because it is explicitly listed in Acceptance Criteria.
- Verification:
  - Manual structural review: `docs/FOUNDATIONS.md` now has contiguous numbered headings `## 1` through `## 20`; Foundation #20 is immediately after #19 and before the Appendix separator; the Spec 162 Appendix amendment line is present.
  - `pnpm turbo lint` — pass.
  - `pnpm turbo test` — pass.
  - `pnpm run check:ticket-deps` — pass; ticket dependency integrity check passed for 6 active tickets and 2280 archived tickets.
  - `git diff --check` — pass.
- No-invalidation: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.
