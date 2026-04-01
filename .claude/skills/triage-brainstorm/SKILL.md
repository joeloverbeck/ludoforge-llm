---
name: triage-brainstorm
description: "Triage an external LLM brainstorming document against the codebase and FOUNDATIONS.md. Classifies findings as spec-worthy, deferred, or rejected. Writes specs for approved findings and updates the brainstorming doc with a coverage status table."
user-invocable: true
arguments:
  - name: brainstorming_doc_path
    description: "Path to the brainstorming document (e.g., brainstorming/agent-dsl-improvements.md)"
    required: true
---

# Triage Brainstorm

Systematically triage an external architecture review or brainstorming document against the actual codebase and `docs/FOUNDATIONS.md`. Classify each finding as spec-worthy, deferred, or rejected. Write specs for approved findings. Update the brainstorming doc with a coverage status table.

## Invocation

```
/triage-brainstorm <brainstorming-doc-path>
```

**Arguments** (required, positional):
- `<brainstorming-doc-path>` — path to the brainstorming document (e.g., `brainstorming/agent-dsl-improvements.md`)

If the argument is missing, ask the user to provide it before proceeding.

## Worktree Awareness

If working inside a worktree (e.g., `.claude/worktrees/<name>/`), **all file paths in this skill** — reads, writes, globs, greps — must be prefixed with the worktree root. The default working directory is the main repo root; paths without an explicit worktree prefix will silently operate on main, not the worktree. This applies to every path reference below.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Mandatory Reads

Read ALL of these files before any analysis:

1. **The brainstorming document** (from the argument) — read the entire file
2. **`docs/FOUNDATIONS.md`** — architectural commandments; every spec must align with these principles

Also determine the **next available spec number**:
- Scan `specs/` and `archive/specs/` for all files matching `<N>-*.md`
- Find the highest number N across both directories
- The next available spec number is N+1

Record this number — it will be used in Step 6 for auto-assigning spec numbers.

### Step 2: Extract Findings

Parse the brainstorming document and identify every discrete finding — issues, improvements, and feature proposals. For each finding, record:

- **ID**: Sequential number (`#1`, `#2`, etc.)
- **Title**: Short descriptive name
- **Claim**: What the external reviewer asserts is wrong or missing
- **Proposed fix**: What the reviewer recommends changing
- **Architectural area**: Which part of the system is affected (e.g., kernel, compiler, agents, runner)

If the brainstorming document is structured with explicit sections or numbered items, use those as the natural finding boundaries. If it is unstructured prose, identify distinct claims and group them logically.

### Step 3: Codebase Validation

For each finding, validate its claims against the actual codebase:

1. **Does the problem exist?** — Grep/Glob for the code or types the reviewer references. Does the architecture actually have the gap they describe?
2. **Is it already fixed?** — Check if a spec, ticket, or recent implementation has already addressed this. Search `specs/`, `archive/specs/`, `tickets/`, `archive/tickets/`.
3. **Is the proposed fix compatible?** — Does the reviewer's recommendation work with current architecture, or does it assume a different codebase state?
4. **Is the claim overstated or misunderstood?** — External reviewers often lack full codebase access. Note where a claim is directionally correct but factually imprecise.

For brainstorming docs with many findings (>5), use an Explore agent to validate all findings in parallel. Include the findings list and ask the agent to validate each claim against the codebase, checking for existence of referenced types/files/functions, existing specs that address the issue, and architectural compatibility.

Record validation results for each finding. Do not present findings yet.

### Step 4: FOUNDATIONS.md Triage

For each validated finding, evaluate against `docs/FOUNDATIONS.md` and classify:

- **Spec-worthy**: The finding reveals a real architectural gap that is not already addressed, and the proposed fix aligns with (or improves alignment with) FOUNDATIONS.md principles. This finding will produce a spec.
- **Deferred**: The finding is directionally valid but: (a) not blocking current work, (b) depends on unstarted work (e.g., evolution pipeline), or (c) is an enhancement rather than a gap. Note what it's waiting for or why it's not urgent.
- **Rejected**: The finding is factually wrong about the codebase, already addressed by an existing spec/implementation, violates a FOUNDATIONS.md principle, or does not meaningfully improve the architecture.

For each classification, record:
- The verdict (spec-worthy / deferred / rejected)
- The reasoning (1-2 sentences)
- Which FOUNDATIONS.md principles are relevant (by number)
- Any corrections to the external reviewer's claims

Apply YAGNI ruthlessly. Only classify as spec-worthy if the finding addresses a real architectural gap — not "might be nice" improvements.

### Step 5: Present Triage Table

Present all findings in a structured triage table:

```
## Triage: <brainstorming-doc-name>

| # | Finding | Verdict | Reasoning | Foundations |
|---|---------|---------|-----------|-------------|
| 1 | <title> | Spec'd  | <reason>  | F1, F12     |
| 2 | <title> | Deferred | <reason> | F2          |
| 3 | <title> | Rejected | <reason> | F14         |

### Spec-worthy findings
1. **#N: <title>** — <1-2 sentence scope for the spec to be written>

### Deferred findings
1. **#N: <title>** — <why deferred, what it's waiting for>

### Rejected findings
1. **#N: <title>** — <why rejected, correction to external claim if applicable>

### Reassessment notes
- <corrections to external reviewer claims — what they got right vs. wrong>
```

**Wait for user approval.** The user may:
- Override any classification (e.g., promote a deferred finding to spec-worthy, or reject a spec-worthy one)
- Adjust the scope description for spec-worthy findings
- Ask for deeper analysis of specific findings

Do not proceed to Step 6 until the user has approved the triage table.

If the user requests deeper analysis of a specific finding, perform the investigation using read-only tools and re-present the updated triage before asking for approval again.

### Step 6: Write Specs

For each approved spec-worthy finding, write a spec file to `specs/<N>-<slug>.md` where:
- `<N>` is the next available spec number (auto-incremented from Step 1)
- `<slug>` is a kebab-case short name derived from the finding title

Each spec MUST follow the project's standard format:

```markdown
# Spec <N>: <Title>

**Status**: Draft
**Priority**: <P1|P2|P3>
**Complexity**: <S|M|L>
**Dependencies**: <other specs or "None">
**Blocks**: <downstream specs or "None">
**Estimated effort**: <range in days>

## Problem Statement

<What architectural gap this addresses. Include corrections to the external reviewer's original claim if their description was imprecise or overstated.>

## Goals

- <goal 1>
- <goal 2>

## Non-Goals

- <explicit exclusion 1>

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **N. <Name>** | <how this spec aligns> |

## Design

<Implementation design with parts/sections as needed>

## Testing

<Numbered test scenarios>

## Migration Checklist

- [ ] <migration step>
```

**Spec quality requirements:**
- Every type, file path, and function referenced in the spec must be validated against the actual codebase
- The FOUNDATIONS.md Alignment table must reference every principle that the spec touches
- The spec must be structured so `/reassess-spec` and `/spec-to-tickets` can consume it downstream
- If a finding is too large for one spec, split it into multiple specs with explicit dependency ordering

Write all spec files. Do not commit.

### Step 7: Update Brainstorming Doc

Prepend a "Spec Coverage Status" table to the brainstorming document, matching the format established in `brainstorming/agent-dsl-improvements.md`:

```markdown
## Spec Coverage Status (<today's date>)

This document was produced by an external reviewer without codebase access. After reassessing each claim against the actual codebase and `docs/FOUNDATIONS.md`, the following specs were created:

| Issue | Status | Spec |
|-------|--------|------|
| #1 <title> | **Spec'd** | Spec <N> — <full title> |
| #2 <title> | **Deferred** | <reason> |
| #3 <title> | **Rejected** | <reason> |

Reassessment notes:
- <correction 1>
- <correction 2>

---
```

Insert this above the original document content. Preserve all existing content below the table.

### Step 8: Final Summary

Present:
- Number of findings: total, spec'd, deferred, rejected
- List of spec files created with paths
- Suggested next steps: `/reassess-spec specs/<N>-<slug>.md` for each spec

Do NOT commit. Leave files for user review.

## Guardrails

- **FOUNDATIONS alignment is mandatory**: Every spec must respect `docs/FOUNDATIONS.md`. Never write a spec for a change that violates a Foundation principle, even if the external reviewer recommends it.
- **Codebase truth**: All references in specs must be validated against the actual codebase. Never propagate stale claims from the external reviewer.
- **YAGNI ruthlessly**: Only spec findings that address real architectural gaps. "Might be nice" proposals are deferred, not spec'd. Enhancements that don't improve alignment with FOUNDATIONS.md are deferred.
- **No scope inflation**: Each spec covers a discrete, well-bounded change. If a finding is too large, split it into multiple specs with explicit dependencies.
- **External reviewer corrections**: When the brainstorming doc makes a claim that's partially wrong or overstated, record what was correct and what was corrected — in both the spec and the brainstorming doc's reassessment notes.
- **Downstream compatibility**: Specs must be structured so `/reassess-spec` and `/spec-to-tickets` can consume them. Use the standard spec format with all required sections.
- **Preserve downstream structure**: Preserve all metadata fields and section headings in the standard spec format.
- **No implementation**: This skill writes specs only. It does not create tickets, write code, or start implementation.
- **Worktree discipline**: If working in a worktree, ALL file operations use the worktree root path.
