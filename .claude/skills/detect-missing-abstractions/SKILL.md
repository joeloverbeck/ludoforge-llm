---
name: detect-missing-abstractions
description: "Analyze engine code exercised by a test suite to find missing or incomplete abstractions at any architectural level — from intra-subsystem scatter to cross-subsystem fractures. Uses two parallel detection lenses (structural scatter + architectural fractures) with unified severity ranking. Outputs a report with severity-ranked findings."
user-invocable: true
arguments:
  - name: test_path
    description: "Path to a test file or test directory (e.g., packages/engine/test/kernel/grant-lifecycle.test.ts or packages/engine/test/)"
    required: true
  - name: prior_reports
    description: "Optional: paths to earlier missing-abstractions reports in reports/. The skill builds on previous analysis rather than rediscovering known issues. Never use reports from archive/."
    required: false
---

# Detect Missing Abstractions

Analyze engine code exercised by a test suite to find missing or incomplete abstractions at any architectural level. Uses two parallel detection lenses — **structural scatter** (bottom-up metrics on concept clusters) and **architectural fractures** (top-down scenario-to-boundary analysis) — feeding into a unified synthesis that ranks all findings by severity of authority confusion.

## Invocation

```
/detect-missing-abstractions <test-file-or-directory> [--prior-reports path1 path2 ...]
```

**Parameter**: Path to a test file or directory that exercises the engine area to analyze.

**Optional**: `--prior-reports` — paths to earlier reports **in `reports/`**. The skill builds on previous analysis rather than rediscovering known issues. **Never use reports from `archive/`** — archived reports are already exploited and no longer reflect current code.

**Output**: Structured report at `reports/missing-abstractions-<date>-<context>.md`. `<context>` is derived from the input: for a test file, strip the path prefix and `.test.ts`/`.test.js` suffix; for a directory, use the directory name; for a glob pattern matching multiple files, use the common prefix of matched filenames after stripping the directory path.

**Incremental mode** (optional): If a previous report exists for the same test path (check `reports/missing-abstractions-*-<context>.md`), read it at the start of Phase 2. Carry forward unchanged "Acceptable" verdicts for clusters/areas whose file counts changed by <20% and that include no newly added modules. Note "incremental — carried forward from <previous date>" for reused verdicts.

## Background

Missing abstractions manifest at two scales:

**Intra-subsystem scatter**: A single semantic concept whose state transitions or readiness checks are scattered across many files within a functional area — with no unifying type, or with a type that lacks sufficient derived state, forcing callers to re-compute readiness/applicability from scratch. Symptoms: scattered switch/if over the same discriminated union in 3+ files, repeated predicate patterns, derived state recomputation, optional properties modelling implicit lifecycle phases.

**Cross-subsystem fractures**: Architectural problems that span multiple subsystems — where the boundary between subsystems is wrong, where authority over shared truth is split, or where the same concept lives under different names in neighboring modules. Symptoms: fixing a bug in subsystem A requires compensating changes in subsystem B; the same eligibility predicate is computed from scratch in multiple subsystems; error handlers in one layer catch problems that another layer should prevent; files across module boundaries repeatedly change together.

Both are authority confusion at different scales. This skill detects both.

## Methodology

### Phase Dependency Graph

```
Phase 1: GATHER ----+
                    +--> Phase 3: TRACE --> Phase 4: DETECT --> Phase 5: SYNTHESIZE --> Phase 6: VALIDATE
Phase 2: SCENARIO --+                        |         |
  MAP                                   Lens A    Lens B
                                      (parallel) (parallel)
```

Phases 1 and 2 run in parallel (both start from the test files). Phase 3 should be deferred until Phase 1 completes — it frequently collapses into Phase 1's outputs. Phase 4's two lenses are always parallelized. Phases 5-6 are sequential after Phase 4.

### Phases 1-3: Gathering

Load `references/gathering-phases.md`. Follow GATHER (Phase 1), SCENARIO MAP (Phase 2), and TRACE (Phase 3) procedures.

### Phase 4: Detection

Load `references/detection-lenses.md`. Run Lens A (Structural Scatter) and Lens B (Architectural Fractures) in parallel, then perform Cross-Lens Reinforcement.

### Phases 5-6: Synthesis and Validation

Load `references/synthesis-and-validation.md`. Rank findings by authority confusion severity (Phase 5), then apply survival criteria and FOUNDATIONS alignment (Phase 6).

### Report Output

Load `references/report-format.md`. Write the report to `reports/missing-abstractions-<date>-<context>.md` using the template.

## Hard Rules

Load `references/hard-rules-and-notes.md` and follow all rules throughout.

Key rules (always active):
- **Read-only** — do not modify source files or run tests.
- **Two-signal minimum** — no finding in main Findings without two independent evidence sources.
- **Every finding needs counter-evidence.**
- **No pattern theater** — no pattern names without owned truth and a real boundary.
- **Recovery first, judgement second** — gather and detect BEFORE applying FOUNDATIONS.
- **Do not invent problems** — "acceptable architecture" is a valid outcome.

## Workflow Context

Typically invoked after implementing a spec or after identifying coverage gaps. Output feeds into spec authoring for proposal implementation. The workflow is:

1. Implement spec -> 2. `/detect-missing-abstractions` (structural debt + architectural fractures) -> 3. Spec authoring from findings

**Plan mode**: If invoked in plan mode, the report file is the deliverable. No implementation plan is produced — write the report directly and exit. The skill is read-only by design; plan mode's edit restrictions are compatible.
