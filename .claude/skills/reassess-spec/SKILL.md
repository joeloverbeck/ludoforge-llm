---
name: reassess-spec
description: "Reassess a spec against the codebase and FOUNDATIONS.md. Validates assumptions, identifies issues/improvements/additions, asks clarifying questions, then writes the updated spec. Use when preparing a spec for ticket decomposition."
user-invocable: true
arguments:
  - name: spec_path
    description: "Path to the spec file (e.g., specs/106-zone-token-observer-integration.md)"
    required: true
---

# Reassess Spec

Validate a spec's proposed implementation against the actual codebase and FOUNDATIONS.md. Identify issues, improvements, and beneficial additions. Deliver an updated spec ready for ticket decomposition.

## Invocation

```
/reassess-spec <spec-path>
```

**Arguments** (required, positional):
- `<spec-path>` — path to the spec file (e.g., `specs/106-zone-token-observer-integration.md`)

If the argument is missing, ask the user to provide it before proceeding.

## Worktree Awareness

If working inside a worktree (e.g., `.claude/worktrees/<name>/`), **all file paths in this skill** — reads, writes, globs, greps — must be prefixed with the worktree root. The default working directory is the main repo root; paths without an explicit worktree prefix will silently operate on main, not the worktree. This applies to every path reference below, including paths passed to Explore agents.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Mandatory Reads

Read ALL of these files before any analysis:

1. **The spec file** (from the argument) — read the entire file
2. **`docs/FOUNDATIONS.md`** — architectural commandments; every spec must align with these principles

Parse the spec's metadata: Status, Priority, Dependencies, Goals, Non-Goals, FOUNDATIONS.md Alignment table (if present), and all implementation sections.

### Step 2: Extract and Validate References

This step combines reference extraction and codebase validation into a single pass.

From the spec, extract every concrete codebase reference:

- **File paths** mentioned or implied (e.g., `src/cnl/compile-observers.ts`, `data/games/fitl/`)
- **Type names** (e.g., `GameDef`, `CompiledObserverProfile`, `ZoneId`)
- **Function/method names** (e.g., `derivePlayerObservation`, `lowerObservers`)
- **Module names** (e.g., `kernel`, `cnl`, `agents`)
- **Config keys or YAML fields** (e.g., `zones`, `surfaces`, `dataAssets`)
- **Test file paths or test names** referenced
- **Other specs or tickets** listed in Dependencies

For each reference, validate against the actual codebase:

1. **File paths**: Glob/Grep to confirm they exist at the stated location. If a file was moved, renamed, or deleted, record the discrepancy and the actual location (if found).
2. **Types and interfaces**: Grep for each type name. Confirm it exists, check its current shape (fields, members). If the spec assumes a field that does not exist or has a different name/type, record the discrepancy.
3. **Functions and methods**: Grep for each function. Confirm signature, module location, and export status. Note any signature differences from what the spec assumes.
4. **Dependencies (specs/tickets)**: For each dependency, verify whether it lives in `specs/`, `archive/specs/`, `tickets/`, or `archive/tickets/`. Record the correct path. If a dependency is listed as incomplete but has since been implemented, note this. For archived dependencies, also check for associated active ticket series (`tickets/<NAMESPACE>-*`) and note them — they indicate whether the dependency's work is in progress or completed. For specs that list the assessed spec as a dependency, verify their assumptions about the assessed spec's deliverables are still valid. If the assessed spec's scope changes, flag impacted downstream specs.
5. **YAML/config fields**: Grep for field names in schema files, type definitions, and example YAML files. Confirm the spec's assumptions about available fields.
6. **Downstream consumers (blast radius)**: For types or interfaces the spec proposes to modify, grep for all import sites and usage points. Record the blast radius — files that would need updating.
7. **Existing implementations**: For each major proposed artifact (new types, new files, new patterns), search the codebase for existing implementations with similar names or functionality. Check whether the proposal duplicates existing infrastructure. This catches specs whose premise has been overtaken by prior work. Search using both exact names from the spec AND broader patterns (e.g., if the spec proposes `CompiledTokenFilter`, also search for `tryCompile*`, `*compiler.ts`, `Compiled*` to find related infrastructure that the spec may not reference).

For specs with many references (>5 types/functions/paths), use an Explore agent to perform extraction and validation in a single pass. Include the spec content in the agent prompt so it can both identify references and validate them. Explicitly request blast radius analysis — the agent should grep for all import sites and consumer files of any type or interface the spec proposes to modify. This is read-only — agent-based exploration is safe and significantly faster.

Do not present findings yet. Collect everything for Step 3.

### Step 3: FOUNDATIONS.md Alignment Check

Review each section of the spec against `docs/FOUNDATIONS.md`:

1. If the spec has a FOUNDATIONS.md Alignment table, verify each claimed alignment is accurate. Flag any principle the spec claims to satisfy but actually violates.
2. Identify any Foundation principle the spec does **not** address but should, given its scope. Pay particular attention to:
   - **Foundation 1** (Engine Agnosticism) — does the spec introduce game-specific logic in engine code?
   - **Foundation 2** (Evolution-First) — does the spec put rule-authoritative data outside YAML?
   - **Foundation 8** (Determinism) — does the spec introduce non-deterministic behavior?
   - **Foundation 11** (Immutability) — does the spec mutate state?
   - **Foundation 14** (No Backwards Compatibility) — does the spec leave compatibility shims or defer migration?
   - **Foundation 15** (Architectural Completeness) — does the spec patch a symptom instead of fixing root cause?
3. Record each alignment issue with the specific Foundation number and what conflicts.

### Step 4: Classify Findings

Organize all findings from Steps 2 and 3 into three categories:

- **Issues**: Something in the spec is factually wrong, stale, or violates FOUNDATIONS.md. The spec cannot go to tickets without fixing this.
- **Obsolescence**: The spec's core proposal is already implemented, superseded, or invalidated by codebase evolution. The entire premise needs rethinking, not just refinement.
- **Improvements**: The spec is not wrong, but a refinement would make the implementation cleaner, safer, or more aligned with existing patterns.
- **Additions**: A feature or deliverable not in the spec that would be beneficial and aligns with the spec's stated goals. Apply YAGNI ruthlessly — only propose additions that are natural extensions of the spec's scope, not tangential features.

For each finding, record:
- What the spec says (or omits)
- What the codebase actually has (with file paths and line references)
- The recommended change to the spec

**Handling Obsolescence**: When a spec's core proposal is already implemented or superseded, present two options: (a) archive the spec as completed/superseded, (b) rewrite with a narrower scope targeting the remaining gap. Wait for user direction before proceeding to Step 6. If the user chooses rewrite, the Step 6 output may be a substantially new spec rather than a refinement of the existing one.

### Step 5: Present Findings

Present all findings to the user in a structured report:

```
## Reassessment: <spec-name>

### Codebase Status
[Optional — include when the spec's proposal overlaps with existing infrastructure.]
<Brief summary of what already exists in the codebase that is relevant to the spec's proposal. Helps contextualize all subsequent findings.>

### Issues (must fix)
[If none: "No issues found."]
1. **<title>** — <what the spec says> vs. <what the codebase has>. Recommendation: <change>.

### Obsolescence (premise invalidated)
[If none: omit this section entirely.]
1. **<title>** — <what the spec proposes> is already implemented / superseded by <what exists>. Options: (a) archive the spec, (b) rewrite with a new scope targeting <remaining gap>.

### Improvements (should fix)
[If none: "No improvements found."]
1. **<title>** — <current spec text> could be improved because <reason>. Recommendation: <change>.

### Additions (consider adding)
[If none: "No additions proposed."]
1. **<title>** — <what's missing> would be beneficial because <reason>. Recommendation: <new section or deliverable>.

### FOUNDATIONS.md Alignment
- <Foundation N>: <aligned | issue description>

### Questions
[If none: "No questions."]
1. <question>
```

**Question discipline**: Ask at most 3 questions in this initial report. If you have more than 3, prioritize the ones that block further reassessment and defer the rest to a follow-up round after the user responds.

**Wait for user response.** Do not proceed to Step 6 until the user has:
- Approved, rejected, or modified each finding
- Answered all questions

If the user's answers raise new questions or invalidate previous findings, present a follow-up round (same format, same question limit). Repeat until all findings are resolved.

If the user defers a decision back to you (e.g., "you decide", "reassess based on FOUNDATIONS"), analyze the question against `docs/FOUNDATIONS.md` principles, present your recommendation with the specific Foundation justification, and treat it as approved unless the user objects.

If the user requests deeper analysis of a specific finding before deciding, perform the investigation using read-only tools (reading additional source files, tracing call chains, etc.) and present updated findings before re-asking for approval. This investigation round does not count toward the follow-up question limit — it is resolution of the original question, not a new question.

### Step 6: Write the Updated Spec

After all findings are resolved and the user has approved the changes:

1. **Draft the updated spec** incorporating all approved changes. Preserve the spec's existing structure and voice. Do not rewrite sections that have no findings — change only what was agreed upon.
2. **Present the diff summary** to the user as a numbered list: `N. **<section name>**: <one-line change description>`.
3. **Wait for final approval** before writing the file.
4. **Write the updated spec** to the same path as the original, overwriting it.

If the user requests changes to the draft, incorporate them and re-present before writing.

**Plan mode note**: If invoked during plan mode, Steps 1-5 proceed normally (read-only). Step 6 (writing the updated spec) is deferred until plan mode is exited. Record the approved changes in the system-provided plan file following the plan-mode workflow, then execute Step 6 after the user approves the plan and plan mode is exited.

### Step 7: Final Summary

After writing the updated spec, present:

- Number of issues fixed, improvements applied, and additions incorporated
- Any deferred items the user chose not to address now
- Suggested next step: `/spec-to-tickets <spec-path> <NAMESPACE>` to decompose into tickets

Do NOT commit. Leave the file for user review.

## Guardrails

- **FOUNDATIONS alignment is mandatory**: Every change to the spec must respect `docs/FOUNDATIONS.md`. Never approve a spec change that violates a Foundation principle, even if the user requests it — flag the conflict instead.
- **Codebase truth**: All references in the updated spec must be validated against the actual codebase. Never propagate stale file paths, renamed types, or removed functions.
- **One question at a time in follow-ups**: After the initial report (which may have up to 3 questions), follow-up rounds ask one question at a time to avoid overwhelming the user.
- **YAGNI ruthlessly**: Additions must be natural extensions of the spec's scope. Do not propose features that "might be nice" but are not aligned with the spec's stated goals.
- **No scope creep**: The deliverable is the updated spec file. Do not write design docs, create tickets, or start implementation.
- **No approach proposals**: This is reassessment, not greenfield design. Do not propose 2-3 alternative architectures. The spec already has a design — validate and refine it.
- **Preserve spec voice**: When editing, match the spec's existing writing style. Do not rewrite unchanged sections for stylistic preferences.
- **Preserve downstream structure**: When writing the updated spec, preserve all metadata fields (Status, Priority, Complexity, Dependencies, etc.) and section headings that downstream skills (e.g., spec-to-tickets) may depend on. Do not rename or remove standard sections.
- **Worktree discipline**: If working in a worktree, ALL file operations use the worktree root path.
