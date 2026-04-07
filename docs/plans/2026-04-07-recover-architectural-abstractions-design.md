# Design: recover-architectural-abstractions skill

**Date**: 2026-04-07
**Status**: Approved

## Problem

The `detect-missing-abstractions` skill found a real architectural win — the grant lifecycle state machine — by identifying scattered implicit state machines within a single concept. But there may be higher-level architectural fractures spanning multiple subsystems that the existing skill cannot see because it looks for within-concept scatter, not cross-subsystem boundary violations.

A new skill is needed that works at the cross-subsystem level: recovering the as-built architecture from test suites and proposing higher-order abstractions that name owned truth, invariants, interaction protocols, and owner boundaries.

## Origin

A brainstorming document (`brainstorming/abstraction-recovery-skill.md`) was produced by ChatGPT Pro based on the existing `detect-missing-abstractions` skill. This design distills that document, dropping academic overhead (formal architecture views, concept graph artifacts, JSON companion, 15+ candidate fields) while preserving the core analytical value.

## Design Decisions

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Single skill vs pipeline | Single skill | No human-in-the-loop between phases; internal phases are sequential, not iterative |
| Architecture views / concept graph | Dropped | Academic formalism the LLM doesn't need — it can reason about state authority and protocol structure without building graph artifacts |
| Fracture types | All 8 from brainstorming doc | Even FOUNDATIONS-forbidden patterns (backwards compat shims) may exist in practice |
| Inputs | `test_path` (required), `prior_reports` (optional) | Auto-detect source roots, always read FOUNDATIONS, always use git history |
| Output | Markdown report only, no JSON companion | JSON adds maintenance burden without clear consumer |
| Candidate fields | 11 essential fields (down from 15+) | Dropped: producers, consumers, writers, protocol_or_transition_surface, migration_sequence — these are implementation details for the spec phase |
| FOUNDATIONS role | Validation layer on candidates, not starting lens | Recovery first, judgement second |
| Relationship to detect-missing-abstractions | Siblings — both produce spec-worthy findings at different abstraction levels | No parent-child dependency; both feed into spec -> ticket -> implementation |
| Sub-agent delegation | Yes, for data-intensive phases | Manages context pressure on large test suites |

## Skill Identity

- **Name**: `recover-architectural-abstractions`
- **Invocation**: `/recover-architectural-abstractions <test-file-or-directory> [--prior-reports path1 path2 ...]`
- **Output**: `reports/architectural-abstractions-<date>-<context>.md`
- **Read-only**: Does not modify source files, run tests, or write specs

Context derivation: strip path prefix and `.test.ts` suffix for files, use directory name for directories (same convention as detect-missing-abstractions).

## Methodology

### Phase 1: GATHER

Read the test files, extract imports, trace 2-3 levels deep into engine source modules. Also read:
- `docs/FOUNDATIONS.md` (held for later validation, not applied yet)
- Any `prior_reports` if provided
- Existing coverage/trace artifacts if present

Run bounded git history: `git log --since="6 months ago"` on exercised files to identify temporal coupling.

**Sub-agent delegation**: For large test suites (>20 direct imports or barrel re-exports), delegate import tracing to 1-3 parallel Explore sub-agents.

### Phase 2: SCENARIO MAP

Treat tests as behavioral scenarios. For each test or test family, recover:
- What behavior is being exercised
- Which fixture/setup path it uses
- Which assertions define success/failure
- Which domain concepts appear in names, helpers, and expected values

Cluster into **scenario families** — named behavioral groups (e.g., "free action continuation", "turn interruption and resumption", "ownership transfer").

**Sub-agent delegation**: For large test directories (>30 test files), delegate scenario extraction to 2-3 parallel Explore sub-agents.

### Phase 3: TRACE

Build test-to-code traceability using multiple strategies:
- Import/use statements (primary)
- Static call graph from test assertions back to production code
- Naming and lexical similarity between test helpers and production functions
- Temporal coupling from git history (files that co-change with the test files)

Each link gets a confidence tag (high/medium/low) and a brief reason.

### Phase 4: DETECT FRACTURES

Scan exercised code for 8 fracture types:

| # | Fracture Type | What to look for |
|---|--------------|-----------------|
| 1 | Split protocol | Legal sequence of interactions spread across multiple modules/layers |
| 2 | Authority leak | Multiple modules write the same truth |
| 3 | Projection drift | Derived summaries recomputed everywhere, no owner |
| 4 | Boundary inversion | Higher layers own rules that belong in lower layers |
| 5 | Concept aliasing | Same domain concept under different names/types in neighboring subsystems |
| 6 | Hidden seam | Files across nominal boundaries repeatedly change together |
| 7 | Overloaded abstraction | One type/module carries several lifecycle roles that should be separated |
| 8 | Orphan compatibility layer | A shim or fallback path masks a deeper missing abstraction |

**Evidence rule**: A fracture is not reported unless supported by at least two independent signals.

### Phase 5: SYNTHESIZE

For each validated fracture, produce a candidate abstraction with:

- **title**: Name of the proposed abstraction
- **kind**: One of: Protocol, Authority boundary, Bounded context, Projection owner, Capability ledger, Workflow coordinator, Translation boundary, Lifecycle carrier
- **scope**: Which subsystems/modules it spans
- **owned_truth**: What state or invariant this abstraction would own
- **invariants**: What must always be true
- **owner_boundary**: Which module/package should own it
- **modules_affected**: Which existing modules would be absorbed or constrained
- **tests_explained**: Which scenario families this candidate accounts for
- **expected_simplification**: What gets simpler
- **confidence**: High / Medium / Low
- **counter_evidence**: What would falsify this hypothesis

### Phase 6: VALIDATE

**Survival criteria** — drop candidates that fail any of:
1. Explains at least two tests or one whole scenario family
2. Reduces at least one real architectural cost
3. Can name the owned truth
4. Can name the rightful owner boundary
5. Does not merely wrap existing code with a facade

**FOUNDATIONS alignment** — for surviving candidates, check against `docs/FOUNDATIONS.md`. Flag any candidate that would violate a foundation principle.

## Report Format

```markdown
# Architectural Abstraction Recovery: <context>

**Date**: <YYYY-MM-DD>
**Input**: <test path>
**Engine modules analyzed**: <count>
**Prior reports consulted**: <list or "none">

## Executive Summary

<2-4 sentences: were cross-subsystem fractures found? How severe?
How many candidates survived validation?>

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| <name> | <count> | <concepts> | <what they verify> |

## Traceability Summary

| Module | Scenario Families | Confidence | Strategy |
|--------|------------------|------------|----------|
| <file> | <families> | High/Med/Low | <import/naming/temporal/...> |

## Fracture Summary

| # | Fracture Type | Location | Evidence Sources | Severity |
|---|--------------|----------|-----------------|----------|
| 1 | <type> | <modules involved> | <which signals> | HIGH/MEDIUM/LOW |

## Candidate Abstractions

### <Candidate Title>

**Kind**: <Protocol / Authority boundary / ...>
**Scope**: <subsystems spanned>
**Fractures addressed**: <which fracture(s) from the table>

**Owned truth**: <what this abstraction would own>
**Invariants**: <what must always hold>
**Owner boundary**: <which module/package should own this>

**Modules affected**: <list of modules absorbed or constrained>
**Tests explained**: <which scenario families>
**Expected simplification**: <what gets cleaner>

**FOUNDATIONS alignment**:
- <Foundation #N>: <aligned / strained / conflicts> — <brief explanation>

**Confidence**: High / Medium / Low
**Counter-evidence**: <what would falsify this>

## Acceptable Architecture

<Areas analyzed that are complex but correctly architected.
Brief explanation of why they don't need intervention.>

## Recommendations

- **Spec-worthy**: <candidate names that warrant a spec>
- **Acceptable**: <areas that are fine as-is>
- **Needs investigation**: <areas where more context is needed>
```

## Hard Rules

1. **No pattern theater.** Never recommend a pattern name unless it corresponds to owned truth and a real boundary.
2. **No abstraction without authority.** If the proposal cannot say who owns the truth, it is not ready.
3. **No wrapper-only recommendations.** "Create a helper/service/interface" is not sufficient unless it relocates invariant ownership.
4. **Read-only.** Do not modify source files, run tests, or write specs.
5. **Do not invent problems.** "Acceptable complexity" must remain a valid outcome.
6. **Every finding needs counter-evidence.** The report must say what would falsify the hypothesis.
7. **Recovery first, judgement second.** Build the scenario map and detect fractures before applying FOUNDATIONS principles.
8. **Two-signal minimum.** No fracture is reported unless supported by at least two independent evidence sources.

## Relationship to Other Skills

| Skill | Level | Relationship |
|-------|-------|-------------|
| `detect-missing-abstractions` | Within-concept (scattered state machines) | Sibling — same output pipeline, different abstraction level |
| `reassess-spec` | Spec validation | Downstream consumer of this skill's spec-worthy recommendations |
| `spec-to-tickets` | Ticket decomposition | Downstream — specs written from this skill's findings get decomposed into tickets |

## Implementation Notes

The skill will be a single SKILL.md file at `.claude/skills/recover-architectural-abstractions/SKILL.md`, following the same structure as `detect-missing-abstractions`. Sub-agent delegation instructions are embedded in the relevant phases, not in separate skill files.
