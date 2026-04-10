# Unified Missing Abstractions Skill — Design

## Brainstorm Context

**Original request**: The user has two analysis skills (`detect-missing-abstractions` and `recover-architectural-abstractions`) with an intended pipeline relationship. In practice, only `recover` gets used. The question was whether they're distinct enough or should be merged.

**Key interview insights**:
- User defaults to `recover` because higher-level fractures should be resolved before patching single-concept scatter
- The original success story (`detect` finding the grant lifecycle state manager) involved ~30 files — likely cross-subsystem enough that `recover` would have found it too
- User trusts `recover`'s "acceptable architecture" verdicts and doesn't feel intra-subsystem scatter needs a separate tool
- The two skills' detection mechanisms are complementary (bottom-up metrics vs. top-down scenario analysis) but the separation into two skills creates decision fatigue with no clear benefit

**Final confidence**: 95%
**Approach chosen**: Restructure — one skill with two detection lenses

---

## Overview

A single skill called `detect-missing-abstractions` that analyzes engine code exercised by a test suite to find missing or incomplete abstractions at any architectural level. It uses two parallel detection lenses — **structural scatter** (metrics-based, from the current `detect` skill) and **architectural fractures** (scenario-based, from the current `recover` skill) — feeding into a unified synthesis that ranks all findings by severity of authority confusion, not by where boundaries sit.

The current `recover-architectural-abstractions` skill is retired. The current `detect-missing-abstractions` skill is replaced.

## Pipeline Architecture

Six phases, with explicit parallelization:

```
Phase 1: GATHER          — Build exercised module set + git history
Phase 2: SCENARIO MAP    — Cluster tests into behavioral families
                           (Phases 1 & 2 run in parallel)
Phase 3: TRACE           — Build test-to-code traceability
                           (Often collapses into Phase 1, same as current recover)
Phase 4: DETECT           — Two parallel lenses:
  |-- Lens A: Structural Scatter   (from current detect)
  |   Scattered discriminant guards, repeated predicates,
  |   derived state recomputation, clone-like redundancy,
  |   optional-property lifecycle smells, workaround indicators
  |
  \-- Lens B: Architectural Fractures   (from current recover)
      Split protocols, authority leaks, projection drift,
      boundary inversions, concept aliasing, hidden seams,
      overloaded abstractions, orphan compatibility layers

Phase 5: SYNTHESIZE       — Merge findings from both lenses,
                           deduplicate, rank by authority confusion severity
Phase 6: VALIDATE         — Survival criteria + FOUNDATIONS alignment
```

**Key change from current skills**: Phase 4's two lenses operate on the same exercised module set and scenario families. Lens A works bottom-up (clustering files by shared concepts, then measuring structural signals). Lens B works top-down (mapping scenario families to subsystem boundaries, then detecting fractures). Findings that appear in both lenses get higher confidence automatically.

**What gets dropped**: The current `detect` skill's Phase 2 (IDENTIFY) becomes the first step of Lens A within Phase 4, not a standalone phase. It no longer needs its own phase because it shares the exercised module set from Phase 1.

**Sub-agent strategy**: For large test suites (>20 direct imports), Phases 1 and 2 each get 1-3 parallel Explore agents. Phase 4's two lenses are always parallelized as separate agents, each receiving the scenario family table and exercised module list as input.

## Key Decisions

### 1. Unified evidence threshold: two-signal minimum for all findings

The current `detect` flags clusters on any single strong signal. The current `recover` requires two signals. The merged skill adopts the stricter rule universally. Single-signal observations go in "Needs Investigation."

### 2. Projection drift no longer has an intra-subsystem carve-out

Current `recover` explicitly defers intra-subsystem projection drift to `detect`. Since there's no separate skill to defer to, the merged skill detects projection drift at all scales. Severity ranking handles the distinction.

### 3. Scenario families become the backbone for both lenses

Current `detect` clusters by filename/discriminant patterns. Current `recover` clusters by test behavior. The merged skill grounds everything in scenario families first (Phase 2), then Lens A adds structural metrics on top. A cluster that can't explain any test scenario gets demoted to "Needs Investigation."

### 4. The skill name stays `detect-missing-abstractions`

Simpler, more intuitive. Scale is handled by severity ranking, not skill selection.

### 5. Counter-evidence is mandatory for all findings, both lenses

Carried forward from `recover`.

### 6. Early-exit for fundamental accessors is preserved

Carried forward from `detect`. Prevents noise in Lens A.

## Detection Lenses — Detail

### Lens A: Structural Scatter

Operates bottom-up within the exercised module set:

1. **Concept clustering** — Group files by shared naming fragments, discriminant types, state-carrier types, and exported symbol prefixes. Apply file-count thresholds (>10% of analyzed files or 8+, floor of 5 for small analyses).

2. **Metric measurement** — For each cluster passing threshold and not early-exited: scattered discriminant guards, repeated predicate patterns, derived state recomputation, clone-like redundancy, optional-property lifecycle smells, repeated Map/Set mutation, simulator compensation, workaround indicators.

3. **Scenario grounding** (NEW) — Map each flagged cluster to scenario families from Phase 2. A cluster that can't explain any scenario family is demoted to "Needs Investigation."

### Lens B: Architectural Fractures

Operates top-down from scenario families to subsystem boundaries. Scans for 8 fracture types: split protocol, authority leak, projection drift, boundary inversion, concept aliasing, hidden seam, overloaded abstraction, orphan compatibility layer.

Change: Projection drift no longer excludes intra-subsystem cases.

### Cross-lens reinforcement

After both lenses complete:

- Overlapping modules across Lens A cluster + Lens B fracture → **merged finding**, confidence elevated
- Lens A cluster with no Lens B fracture → **contained scatter** finding, lower severity
- Lens B fracture with no Lens A cluster → **boundary-level fracture**
- Either lens, single signal only → "Needs Investigation"

## Synthesis and Severity Ranking

### Severity levels

| Level | Definition |
|-------|-----------|
| **Critical** | Multiple subsystems write the same truth with no single owner. Fixing a bug requires synchronized cross-boundary changes. |
| **High** | Lifecycle transitions scattered across subsystem boundaries (reads centralized), or protocol split so "what"/"when"/"whether" live in different modules. |
| **Medium** | Intra-subsystem scatter with strong structural signals (3+ scattered guards, repeated predicates). Contained but substantial. |
| **Low** | Single-subsystem scatter with moderate signals, or boundary-level fracture with limited blast radius. |

### Ranking rules

1. Cross-lens reinforced findings outrank single-lens findings at the same signal strength
2. Findings grounded in more scenario families outrank those grounded in fewer
3. Findings with temporal coupling evidence outrank those without
4. Within the same severity level, order by number of affected modules descending

### Two orthogonal axes

**Severity** = impact. **Confidence** = certainty. A finding can be high-severity but medium-confidence.

## Report Format

Single unified report at `reports/missing-abstractions-<date>-<context>.md`:

```markdown
# Missing Abstraction Analysis: <context>

**Date**: YYYY-MM-DD
**Input**: <test path>
**Engine modules analyzed**: <count>
**Prior reports consulted**: <list or "none">

## Executive Summary
<2-4 sentences>

## Scenario Families
| Family | Tests | Domain Concepts | Key Assertions |

## Traceability Summary
| Module/Cluster | Scenario Families | Confidence | Strategy |

## Findings

### F1: <Title> — <CRITICAL/HIGH/MEDIUM/LOW>

**Detection**: Lens A / Lens B / Cross-lens reinforced
**Kind**: <Protocol | Authority boundary | Bounded context | ...>
**Scope**: <subsystems or modules spanned>

**Owned truth**: <what this abstraction would own>
**Invariants**: <what must always hold>
**Owner boundary**: <which module should own this>

**Evidence**:
- <file:line> — <what was found> (lens + signal type)

**Scenario families explained**: <which families>
**Modules affected**: <list>
**Expected simplification**: <what gets cleaner>

**FOUNDATIONS alignment**:
- section N: aligned / strained / conflicts — <brief>

**Confidence**: High / Medium / Low
**Counter-evidence**: <what would falsify this>

## Acceptable Architecture
<Areas correctly architected. Most substantial section when no fractures found.>

## Needs Investigation
<Single-signal observations. What signal, what second signal to look for, what would falsify.>

## Recommendations
- **Spec-worthy**: <finding IDs>
- **Conditional**: <finding IDs + verification checks>
- **Acceptable**: <areas>
- **Needs investigation**: <areas>
```

## Hard Rules

1. **Read-only.** Do not modify source files. Do not run tests. Static analysis and git history only.
2. **No spec writing.** Only write the report.
3. **Two-signal minimum.** No finding in main Findings section unless supported by 2+ independent evidence sources.
4. **Every finding needs counter-evidence.**
5. **No pattern theater.** Never recommend a pattern name without naming owned truth and a real boundary.
6. **No abstraction without authority.** Cannot name the owner → "Needs Investigation."
7. **No wrapper-only recommendations.**
8. **Recovery first, judgement second.** Detect before applying FOUNDATIONS.
9. **Do not invent problems.** "Acceptable architecture" is valid and prominent.
10. **No archived prior reports.** Only `reports/` may be consulted.
11. **Scenario grounding required.** Lens A clusters that can't explain any scenario family → "Needs Investigation."
12. **Findings must be complete.** Title, severity, detection lens, kind, scope, owned truth, invariants, owner boundary, evidence, scenario families, FOUNDATIONS alignment, confidence, counter-evidence. All required.

## Migration and Cleanup

**Created**: `.claude/skills/detect-missing-abstractions/SKILL.md` — rewritten with unified design

**Retired**: `.claude/skills/recover-architectural-abstractions/` — entire directory deleted

**Updated**: Any skill referencing `recover-architectural-abstractions` updated to point to `detect-missing-abstractions`

**Unchanged**: Existing reports in `reports/`, `archive/`, `docs/FOUNDATIONS.md`
