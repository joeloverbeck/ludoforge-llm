# Report Format

Write to `reports/missing-abstractions-<date>-<context>.md`:

```markdown
# Missing Abstraction Analysis: <context>

**Date**: <YYYY-MM-DD>
**Input**: <test path>
**Engine modules analyzed**: <count>
**Prior reports consulted**: <list or "none">

## Executive Summary

<2-4 sentences: were missing abstractions found? How severe?
How many findings vs acceptable areas? Which lenses produced findings?>

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| <name> | <count> | <concepts> | <what they verify> |

## Traceability Summary

For large module sets (>30 files), group by module cluster rather than listing individual files.

| Module/Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| <file or cluster> | <families> | High/Med/Low | <import/naming/temporal/...> |

## Findings

### F1: <Title> — <CRITICAL/HIGH/MEDIUM/LOW>

**Detection**: Lens A / Lens B / Cross-lens reinforced
**Kind**: <Protocol | Authority boundary | Bounded context | ...>
**Scope**: <subsystems or modules spanned>

**Owned truth**: <what this abstraction would own>
**Invariants**: <what must always hold>
**Owner boundary**: <which module/package should own this>

**Evidence**:
- <file:line> — <what was found> (Lens A: scattered guard / Lens B: authority leak / etc.)
- <file:line> — <what was found>

**Scenario families explained**: <which families>
**Modules affected**: <list of modules absorbed or constrained>
**Expected simplification**: <what gets cleaner>

**FOUNDATIONS alignment**:
- <section N> (<short name>): aligned / strained / conflicts — <brief explanation>

**Confidence**: High / Medium / Low
**Counter-evidence**: <what would falsify this>

---

(Repeat for F2, F3, ...)

## Acceptable Architecture

<Areas analyzed that are complex but correctly architected.
Name them explicitly — "acceptable complexity" is a valid and important finding.
Brief explanation of why they don't need intervention.
When the primary outcome is acceptable architecture, this should be the most substantial section.>

## Needs Investigation

<Single-signal observations from either lens that didn't meet the two-signal minimum.
List them with: the one signal found, what second signal to look for,
which lens produced it, and what would falsify the hypothesis.>

## Recommendations

- **Spec-worthy**: <finding IDs that warrant a spec>
- **Conditional**: <finding IDs with specific verification checks that determine promotion to spec-worthy or deferral — include the exact checks to run>
- **Acceptable**: <areas that are fine as-is>
- **Needs investigation**: <areas where more context is needed>
```
