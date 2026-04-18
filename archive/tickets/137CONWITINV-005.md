# 137CONWITINV-005: Append "Distillation over re-bless" subsection to `.claude/rules/testing.md`

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — rule-file documentation only
**Deps**: `specs/137-convergence-witness-invariant-promotion.md`

## Problem

`.claude/rules/testing.md` already demonstrates the distillation pattern via the "Canary Example: Commit `820072e3`" section (lines ~83–113), which shows a convergence-witness test being rewritten into architectural-invariant form. However, the rule file does not state the general principle prescriptively — it leaves readers to infer "prefer distillation" from a single example. Spec 137 delivers a second worked example (the three FITL convergence-witness tests merged into two architectural-invariant files). A named rule anchors the practice for future test authors, so convergence-witness additions that could be distilled instead are challenged upfront.

## Assumption Reassessment (2026-04-18)

1. `.claude/rules/testing.md` exists and contains the cited canary example — verified during Spec 137 reassessment. Section order (Minimum Test Coverage, TDD, Troubleshooting, Agent Support, Test Classification, Authoring Default, Witness Id Convention, Update Protocol, Canary Example, Advisory) is stable.
2. No existing subsection titled "Distillation over re-bless" — verified via grep.
3. Tickets 003 and 004 land the second worked example. This ticket is independent of 003/004 for content (the subsection can cite Spec 137 itself) but is most valuable once the examples exist as committed code.

## Architecture Check

1. Placement adjacent to the existing canary example keeps the reader's attention on the same conceptual cluster (classification + distillation). Alternative placements (e.g., under "Update Protocol") would split the concept across sections.
2. The new subsection is prescriptive rule text, not a separate example — the existing canary already plays that role. Foundation #16 (Testing as Proof): naming the rule makes the invariant enforceable via code review.
3. No backwards-compat concern — this is a documentation addition.

## What to Change

### 1. Append subsection after the "Canary Example" section

Insert a new `###`-level subsection titled "Distillation over re-bless" immediately after the existing canary example block (before "Advisory: User-Global Agent Prompts" if that section exists in the file). Subsection content:

```markdown
### Distillation over re-bless

When a `convergence-witness` test's trajectory-pinned assertion fails after an unrelated kernel evolution (sampler tweak, policy-profile update, legality-predicate adjustment, etc.), evaluate whether the underlying invariant can be restated as a property assertion **before** re-blessing the witness to the new trajectory. Re-blessing preserves the symptom-level observation but pays the same tax on the next trajectory shift. Distillation — rewriting the assertion into a property form that any legitimate trajectory must satisfy — eliminates the tax permanently.

Apply this rule when:

- The defect class being guarded (e.g., "enumeration does not hang", "population-0 spaces do not accrue support/opposition") can be stated as a property over any trajectory, not just the witness trajectory.
- The property holds across a corpus of seeds or profile variants, not only the one the witness was authored for.

Worked examples:

1. Commit `820072e3` (above) — `fitl-policy-agent-canary` softened from "reaches `terminal`" to "has a bounded stop reason" + replay-identity.
2. Spec 137 — three FITL regression tests merged into two architectural-invariant files (`fitl-enumeration-bounds.test.ts`, `fitl-canary-bounded-termination.test.ts`) with property-form assertions over `CANARY_SEEDS × POLICY_PROFILE_VARIANTS`.

If distillation is attempted but loses defect-class coverage (i.e., a future regression in the guarded behavior would not fail the distilled test), re-bless the witness instead. Record the reason distillation was rejected in the commit body so the next author does not repeat the exploration.
```

### 2. Do not renumber existing sections

The new subsection is a `###` sub-header under the existing "Test Classification" or top-level area (match whichever heading level the canary example uses). Do not renumber or rename any existing section.

## Files to Touch

- `.claude/rules/testing.md` (modify — append one subsection)

## Out of Scope

- Rewriting or reorganizing other sections of `.claude/rules/testing.md`.
- Adding examples from other specs beyond commit `820072e3` and Spec 137.
- Updating CLAUDE.md, AGENTS.md, or other root-level guidance files. This rule lives in the testing ruleset only.

## Acceptance Criteria

### Tests That Must Pass

1. The new subsection "Distillation over re-bless" exists in `.claude/rules/testing.md` adjacent to the existing canary example.
2. Existing section headings are unchanged (no renumbering, no renames).
3. `grep -n "Distillation over re-bless" .claude/rules/testing.md` returns exactly one match.

### Invariants

1. Documentation addition only — no change to code, tests, or spec artifacts.
2. The canary example (commit `820072e3`) remains as-is; the new subsection references it, does not replace it.

## Test Plan

### New/Modified Tests

No automated tests. The verification is a manual diff review of `.claude/rules/testing.md` against the structural requirements in "What to Change".

### Commands

1. `grep -n "Distillation over re-bless" .claude/rules/testing.md` (should return one match after the change)
2. `grep -n "^##\|^###" .claude/rules/testing.md` (should show no renamed or removed existing headings)

## Outcome

Completion date: 2026-04-18

Appended the `### Distillation over re-bless` subsection to
`.claude/rules/testing.md` immediately after the existing canary example and
before the advisory section, without renumbering or renaming any existing
headings.

The new subsection now states the general rule explicitly: when a
`convergence-witness` can be distilled into a property-form
`architectural-invariant` without losing defect-class coverage, distillation
is preferred over re-blessing a shifted trajectory. It cites both the existing
`820072e3` canary example and the Spec 137 FITL rewrites as worked examples.

Deviations from original plan: none.

Verification results:

- `grep -n "Distillation over re-bless" .claude/rules/testing.md` returned exactly one match
- `grep -n "^##\|^###" .claude/rules/testing.md` showed the existing headings unchanged with the new subsection inserted
