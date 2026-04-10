---
name: detect-missing-abstractions
description: "Analyze engine code exercised by a test suite to find cross-cutting concepts with implicit state machines or scattered logic across many files — the signature of a missing or incomplete first-class abstraction. Outputs a report compatible with /recover-architectural-abstractions and spec authoring."
user-invocable: true
arguments:
  - name: test_path
    description: "Path to a test file or test directory (e.g., packages/engine/test/kernel/grant-lifecycle.test.ts or packages/engine/test/)"
    required: true
---

# Detect Missing Abstractions

Analyze engine code exercised by a test suite to find implicit state machines, scattered logic, and cross-cutting concepts that indicate a missing or incomplete first-class abstraction.

## Invocation

```
/detect-missing-abstractions <test-file-or-directory-path>
```

**Parameter**: Path to a test file or directory that exercises the engine area to analyze.

**Output**: Structured report at `reports/missing-abstractions-<date>-<context>.md`. `<context>` is derived from the input: for a test file, strip the path prefix and `.test.ts`/`.test.js` suffix (e.g., `fitl-policy-agent-canary`); for a directory, use the directory name.

**Incremental mode** (optional): If a previous report exists for the same test path (check `reports/missing-abstractions-*-<context>.md`), read it at the start of Phase 2. Focus Phase 3 measurement only on clusters whose file counts changed by >20% or that include newly added modules since the previous report. Carry forward unchanged "Acceptable" verdicts without re-measuring. Note "incremental — carried forward from <previous date>" for reused verdicts.

## Background

Missing or incomplete abstractions manifest as: a single semantic concept (e.g., "grant lifecycle") whose state transitions or readiness checks are scattered across many files with no unifying type, or with a type that lacks sufficient derived state — forcing callers to re-compute readiness/applicability from scratch. In a TypeScript kernel codebase with discriminated unions and immutable state, symptoms include:

- Scattered switch/if over the same discriminated union (`kind`, `type` fields) in 3+ files with similar-but-not-identical logic
- The same combination of property checks or predicate patterns appears in multiple locations
- A single concept requires touching files across 3+ kernel subdirectories
- Functions in different modules compute the same derived value from the same inputs
- A lifecycle type exists but callers still scatter readiness checks across many files
- The simulator needs special handling for what should be a kernel concern
- Optional properties model implicit lifecycle phases (`pending?`, `done?`, `consumed?`) with no explicit state type

## Methodology

**Execution Strategy**: Phases 1-3 are parallelizable. For large analyses (>30 modules), launch up to 3 Explore agents in parallel — e.g., one for Phase 1 tracing, one for Phase 3 scattered-discriminant detection, one for Phase 3 repeated-predicate detection. Phase 4 requires FOUNDATIONS context and should run sequentially after Phases 1-3 complete.

### Phase 1: TRACE — Build the Exercised Module Set

Starting from the test file(s), build a list of engine source modules that the tests exercise.

**Short-circuit for integration/simulation tests**: If the test calls a top-level simulation step function (e.g., `runSim()`, `resolveAction()`, `advanceTurn()`, or equivalent) in a loop or sequence, treat the whole resolution pipeline and its registered handlers as exercised. Skip per-import tracing (steps 3-5) and enumerate all `.ts` files in the relevant `packages/engine/src/` subdirectories directly, excluding barrel/index files that only re-export.

**Otherwise, trace per-import**:

1. If the input is a directory, collect all `.ts` test files in it. If a single file, use that file.
2. Read the test file(s) and extract all `import` statements targeting `packages/engine/src/**`.
3. For each imported engine module, read it and extract ITS imports. Barrel/index re-export files count as zero depth — trace through to the actual defining module.
4. Continue following imports until the exercised set stabilizes (no new modules added in a pass) or after 10 iterations, whichever comes first. This is a fixed-point closure with cycle detection — skip modules already in the set.
5. Produce a deduplicated list of all engine source files exercised by the test suite.

**Tool usage**: Read test files, Grep for imports, Read imported modules. For large test suites (>20 direct imports or barrel re-exports), delegate the import tracing to 1-3 parallel Explore sub-agents. Each agent traces a subset of the import tree (e.g., kernel barrel, test helpers, compiler barrel). Merge their deduplicated file lists.

### Phase 2: IDENTIFY — Find Concept Clusters

Within the exercised modules, find cross-cutting concept clusters using multiple signals:

1. **Filename clustering**: Glob for `packages/engine/src/kernel/*-*.ts` and extract hyphenated prefixes/suffixes. Count files sharing each fragment. Common concept fragments include multi-word patterns (e.g., `free-operation`, `turn-flow`, `token-filter`) and camelCase prefixes in exported symbols.

2. **Discriminant clustering**: Grep for key discriminated union fields (`kind:`, `type:`) in the exercised modules. Any discriminant value that is checked (via switch/if/ternary) in 3+ files is a cluster seed — name the cluster after the discriminant type (e.g., "EffectKind" cluster, "DecisionType" cluster).

3. **State-carrier clustering**: Identify types used as function parameters or return types in 3+ exercised files. Types that flow through many modules without a single owning file indicate a cross-cutting concept.

4. **Repeated guard clustering**: Grep for recurring property-check patterns (e.g., the same combination of `if (x.foo && x.bar)` or `x.kind === 'abc'` guards) appearing in 2+ files. Group files that share the same guard structure.

5. **Exported symbol clustering** (supplement): Extract exported function/type/constant names from each module and look for recurring name prefixes across 3+ files.

6. Name each cluster by its dominant concept (e.g., "freeOperation" cluster, "turnFlow" cluster, "EffectKind" cluster).

7. Filter to clusters exceeding the file-count threshold: >10% of analyzed files, or 8+ files, whichever is larger. For small analyses (<50 modules), use 5+ files as the floor. When >80% of exercised modules come from barrel re-exports rather than direct imports, apply the 10% threshold against only the modules *directly reachable* from the test's non-barrel imports — or use a fixed floor of 8 files, whichever is larger.

8. **Three counts per cluster**: Report separately: (a) defining files — files that export symbols matching the concept, (b) consumer files — files that import/use those symbols but don't define them, (c) temporally-coupled files — files that co-changed with defining files in 5+ commits (use `git log --name-only` on defining files, count co-occurrences). Defining files drive the file-count threshold; consumer and temporal counts provide coupling context.

9. If two clusters share >50% of their defining files, merge them into a single cluster named by the broader concept. Track the sub-concepts as facets within the merged cluster.

**Tool usage**: Grep for `export (const|function|type|interface)`, Grep for `kind:` and `type:` discriminants, Grep for repeated guard patterns, Bash for git log co-change analysis.

### Phase 3: MEASURE — Quantify Structural Signals

For each concept cluster meeting the file-count threshold, first apply the early-exit check, then compute structural metrics for remaining clusters.

**Early-exit for fundamental accessors**: If a cluster's symbols are predominantly single-property accessors (read-only queries, simple getters, type narrowing helpers) and no discriminant in the cluster is being matched in multiple files, mark the cluster as "Acceptable — fundamental accessor" and skip to the next cluster. Reserve full measurement for clusters centered on discriminated unions, lifecycle types, or multi-component derived predicates.

**Full measurement** (for clusters that did not early-exit):

| Metric | How to measure | Signal strength |
|--------|---------------|-----------------|
| **File count** | Distinct source files containing the concept (defining + consumer) | Baseline — spread indicates cross-cutting concern |
| **Scattered discriminant guards** | Grep for `switch`/`if`/ternary expressions on the cluster's key discriminated unions (`kind`, `type` fields); count files with similar-but-not-identical branching logic on the same discriminant | **Strong** — callers re-deriving meaning the type should carry |
| **Repeated predicate patterns** | Grep for recurring combinations of property checks, `.filter()` predicates, or boolean expressions that test the same conceptual condition in 2+ locations | **Strong** — missing derived/cached concept |
| **Derived state recomputation** | Functions that compute the same derived value from the same inputs in different modules (same parameter types, same return semantics, different call sites) | **Strong** — should be a method on the type or a shared utility |
| **High fan-in** | Count distinct callers of the cluster's exported functions from outside the cluster. Fan-in >10 from >3 directories is a signal | **Moderate** — high fan-in + any other strong signal = high confidence finding |
| **Clone-like redundancy** | Near-duplicate logic blocks (same structure, slightly different field names or constants) in 2+ files within or across clusters | **Strong** — missing parameterized abstraction |
| **Optional-property lifecycle smell** | Types with 2+ optional properties that model implicit phases (`pending?`, `done?`, `active?`, `consumed?`, `resolved?`) without an explicit state discriminant | **Strong** — implicit state machine encoded as optional fields |
| **Repeated Map/Set mutation** | The same conceptual collection (e.g., "eligible grants", "active tokens") being rebuilt or filtered from scratch in 2+ modules instead of maintained as authoritative state | **Moderate** — truth recomputation |
| **Simulator compensation** | Error handlers in `sim/` that compensate for kernel gaps. Zero `sim/` compensation is a positive signal — report either way | **Strong** — boundary violation |
| **Workaround indicators** | Comments containing "workaround", "hack", "safety net", "fallback", "broadened" (case-insensitive); functions named with `fallback`, `defer`, `recover`, `retry`; catch blocks that return fallback values instead of re-throwing | **Supporting** — rare in this codebase but should not be ignored when found |

**Scoring**: A cluster is flagged for diagnosis if it meets **ANY** of:
- Scattered discriminant guards in 3+ files on the same type
- Repeated predicate patterns in 3+ locations
- Derived state recomputation in 2+ locations
- Clone-like redundancy in 2+ files
- Optional-property lifecycle smell with 2+ implicit phases
- Any simulator compensation handlers
- Any workaround indicators

A cluster that meets only the file-count threshold but none of the above is reported as "Acceptable — spread without structural debt."

**Tool usage**: Grep for patterns, Read specific functions for manual comparison when grep finds potential matches. For clusters with >20 defining files, delegate scanning to 1-3 parallel Explore sub-agents.

### Phase 4: DIAGNOSE — Check Against FOUNDATIONS.md

**Prerequisite**: Read `docs/FOUNDATIONS.md` in full before this phase (skip if already read in this session).

For each cluster flagged in Phase 3, apply diagnostic questions:

1. **Implicit state machine?** Does the concept have identifiable phases (created → ready → active → consumed → removed) with no explicit lifecycle type? Do transitions happen in different files? If yes, this is a **missing abstraction**.

2. **Incomplete abstraction?** Does a lifecycle type exist but lack derived/cached state that callers need, forcing them to re-compute readiness/applicability from scratch in multiple locations? This is distinct from a missing abstraction — the type exists but doesn't carry enough information.

3. **Redundant computation?** Is the same "readiness" or "eligibility" check computed from scratch in multiple locations instead of being stored as state?

4. **Boundary violation?** Does the simulator need special error handling for what should be a kernel concern? (FOUNDATIONS §5: One Rules Protocol)

5. **Architectural completeness?** Are there workarounds that address symptoms rather than root causes? (FOUNDATIONS §15)

6. **Determinism risk?** Could scattered state transitions produce different results depending on execution order? (FOUNDATIONS §8)

For each diagnosed cluster, also check FOUNDATIONS alignment:

| Principle | Check |
|-----------|-------|
| **§5** — One Rules Protocol | Does scattering force the simulator to compensate for kernel gaps? |
| **§8** — Deterministic Replay | Could scattered transitions produce order-dependent results? |
| **§11** — Immutability | Is the scattering working around immutability constraints instead of modelling state transitions properly? |
| **§15** — Architectural Completeness | Are workarounds addressing symptoms rather than root causes? |
| **§17** — Strongly Typed Domain Identifiers | Does the concept lack a first-class type that would make its identity and lifecycle explicit? |

### Phase 4.5: CROSS-CLUSTER PATTERNS

After diagnosing individual clusters, check whether 2+ clusters share a common structural pattern:

1. Compare structural signals across diagnosed clusters. Look for shared discriminant types matched in both clusters, shared predicate patterns, parallel fallback structures, or clone-like redundancy that spans cluster boundaries.
2. If a cross-cutting pattern is found, name it and assess whether it warrants its own abstraction (separate from any individual cluster's abstraction). Cross-cluster patterns are the strongest signal of a missing abstraction — they indicate a single concept that no cluster fully owns.
3. Report these in a dedicated "Cross-Cutting Findings" section in the report.

### Phase 5: REPORT — Write Structured Output

Write to `reports/missing-abstractions-<date>-<context>.md` where `<date>` is YYYY-MM-DD and `<context>` is derived from the test path (e.g., `fitl-grant-lifecycle`, `kernel-tests`).

Use this template:

```markdown
# Missing Abstraction Analysis: <context>

**Date**: <YYYY-MM-DD>
**Input**: <test path>
**Engine modules analyzed**: <count>
**Incremental**: <Yes — carried forward N clusters from <previous date> | No — full analysis>

## Executive Summary

<1-3 sentences: were missing abstractions found? How severe? How many clusters flagged vs acceptable?>

## Cluster Summary

| Cluster | Defining Files | Consumer Files | Temporal Files | Scattered Guards | Repeated Predicates | Recomputation | Verdict |
|---------|---------------|---------------|---------------|-----------------|--------------------|--------------:|---------|
| <name>  | N             | N             | N             | N files          | N locations         | N locations   | Missing / Incomplete / Boundary / Acceptable |

## Concept Clusters

### <Cluster Name> (Defining: N, Consumer: N, Temporal: N)

**Modules**: <bulleted list of source file paths>

**Key symbols**: <bulleted list of pub items most relevant to the concept>

**Scattered discriminant guards** (if found):
- `<file:line>` — branches on `TypeName.kind` with <description of logic>
- `<file:line>` — branches on `TypeName.kind` with <similar but different logic>

**Repeated predicates** (if found):
- Pattern: `<description of repeated check>` appears in:
  - `<file1:line>`
  - `<file2:line>`

**Derived state recomputation** (if found):
- `<file1:fn_name>` and `<file2:fn_name>` both compute <what> from <same inputs>

**Clone-like redundancy** (if found):
- `<file1:lines>` and `<file2:lines>` — near-duplicate logic: <description>

**Optional-property lifecycle smell** (if found):
- Type `<TypeName>` uses optional fields `<field1>?`, `<field2>?` to model implicit phases

**FOUNDATIONS alignment**:
- §<N> (<short name>): violated / strained / satisfied — <one-line explanation>

**Diagnosis**: Missing abstraction / Incomplete abstraction / Boundary violation / Acceptable complexity

**Rationale**: <2-3 sentences explaining the diagnosis>

---

## Proposals

For each cluster diagnosed as Missing, Incomplete, or Boundary violation. Number proposals sequentially (P1, P2, ...).

### P<N>: <Title>

**Claim**: <What is missing, incomplete, or misplaced — stated as a factual observation>
**Owned truth**: <What single piece of authoritative state or logic this abstraction would own — e.g., "the canonical lifecycle phase of a grant">
**Invariants**: <What must always be true if this abstraction exists — e.g., "a grant in phase 'consumed' can never transition back to 'active'">
**Rightful owner**: <The module or directory that should own this abstraction — e.g., `packages/engine/src/kernel/grant-lifecycle.ts`>
**Evidence**:
- <file:line> — <what was found>
- <file:line> — <what was found>
**FOUNDATIONS references**: §<N> (<name>), §<N> (<name>)
**Proposed change**: <What a spec should address — e.g., "Introduce a GrantPhase discriminated union in kernel/ that carries readiness state, eliminating scattered guards in sim/ and agents/">
**Priority**: <Critical / High / Medium — based on structural signal strength, file spread, and FOUNDATIONS severity>
**Confidence**: <High / Medium / Low — how certain is the diagnosis?>
**Counter-evidence**: <What evidence would disprove this diagnosis? What alternative explanation exists for the structural signals? If none, state "None identified.">

**Hard rule**: No proposal is valid unless it names the owned truth, its invariants, and the rightful owner module. Architecture reconstruction is iterative — proposals that skip these fields produce specs that solve the wrong problem.

---

## Cross-Cutting Findings

<If 2+ clusters share a common structural pattern, describe the shared pattern here. Name it, list the clusters it spans, and assess whether it warrants its own abstraction. If no cross-cluster patterns found, write "No cross-cluster patterns identified.">

---

## Acceptable Clusters

For each cluster that met the file-count threshold but showed no structural debt:

### <Cluster Name>

<1-2 sentences explaining why the spread is architecturally correct — e.g., "turnFlow touches 12 files because turn sequencing is inherently cross-cutting: kernel defines the state machine, sim drives it, agents query it. Each module owns its own concern cleanly.">

---

## Codebase Health Observations (optional)

<Notable architectural strengths discovered during analysis — effective centralization patterns, clean boundaries, low workaround density. This section highlights what is working well.>
```

## Important Rules

1. **READ-ONLY** — Do not modify any source files.
2. **No test execution** — Static analysis only. Do not run `node --test` or any other test command.
3. **No spec writing** — Only write the report. Spec authoring is a separate step.
4. **Always read `docs/FOUNDATIONS.md`** before the DIAGNOSE phase.
5. **Focus on structural signals** — scattered discriminant guards, repeated predicates, recomputation, clone-like redundancy, optional-property lifecycle smells. Do not check for general code smells, style issues, or naming conventions.
6. **Report must be actionable** — each finding either gets a proposal or is explicitly marked acceptable.
7. **Proposals must be complete** — each proposal has: ID, claim, owned truth, invariants, rightful owner, evidence with file:line references, FOUNDATIONS references, proposed change, priority, confidence, and counter-evidence. Incomplete proposals are invalid.
8. **Do not invent problems** — if no missing abstractions are found, say so. A clean result is a valid and valuable finding.
9. **Signal strength > file count** — a cluster with scattered discriminant guards in 3 files is a stronger signal than a concept that simply appears in 40 files with clean boundaries.
10. **If a report already exists** at the target path, overwrite it — each run produces a complete standalone report (unless in incremental mode, where carried-forward verdicts are noted).

## Workflow Context

Typically invoked after implementing a spec or after identifying coverage gaps. Output feeds into `/recover-architectural-abstractions` for higher-level architectural analysis, and into spec authoring for proposal implementation. The workflow is:

1. Implement spec → 2. `/detect-missing-abstractions` (structural debt) → 3. `/recover-architectural-abstractions` (architectural fractures, optional) → 4. Spec authoring from proposals
