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

Parse the spec's metadata: Status, Priority, Dependencies, Goals, Non-Goals, FOUNDATIONS.md Alignment table (if present), and all implementation sections. If standard metadata fields (Status, Priority, Complexity, Dependencies) are absent, record this as an Improvement finding — downstream skills like spec-to-tickets depend on these fields.

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
- **Discriminant values and union variants** (e.g., AST tag numbers, enum values, union member names) — verify that claimed variants exist in the actual union type definition
- **DSL-level identifiers** (e.g., candidate feature names, action IDs, profile names) — these may exist only in YAML game data files (`data/`), compiled JSON fixtures (`test/fixtures/`), or DSL documentation (`docs/`), not in TypeScript source. Search data and fixture files in addition to source code

For each reference, validate against the actual codebase:

1. **File paths**: Glob/Grep to confirm they exist at the stated location. If a file was moved, renamed, or deleted, record the discrepancy and the actual location (if found).
2. **Types and interfaces**: Grep for each type name. Confirm it exists, check its current shape (fields, members). If the spec assumes a field that does not exist or has a different name/type, record the discrepancy. If the spec references a type that doesn't exist but a structurally compatible type does (e.g., a base interface or union variant with the same fields), recommend adopting the existing type name in the spec. Do not propose new type aliases solely to match the spec's naming.
3. **Functions and methods**: Grep for each function. Confirm signature, module location, and export status. Note any signature differences from what the spec assumes.
4. **Dependencies (specs/tickets)**: If Dependencies is `None` and no Related specs are listed, skip this sub-step. Otherwise, for each dependency, verify whether it lives in `specs/`, `archive/specs/`, `tickets/`, or `archive/tickets/`. Record the correct path. If a dependency is listed as incomplete but has since been implemented, note this. For archived dependencies, also check for associated active ticket series (`tickets/<NAMESPACE>-*`) and note them — they indicate whether the dependency's work is in progress or completed. For specs that list the assessed spec as a dependency, verify their assumptions about the assessed spec's deliverables are still valid. If the assessed spec's scope changes, flag impacted downstream specs. **Related specs**: For specs listed as "Related" (not dependencies), verify that the assessed spec's proposed changes don't invalidate assumptions in the related spec. Flag if a scope change would require updating the related spec.
5. **YAML/config fields**: Grep for field names in schema files, type definitions, and example YAML files. Confirm the spec's assumptions about available fields.
6. **Downstream consumers (blast radius)**: For types or interfaces the spec proposes to modify, grep for all import sites and usage points **in both source and test files**. For functions called from multiple code paths (e.g., a shared evaluation core called by both Phase 1 and Phase 2), verify that the spec acknowledges all callers and the impact on each — shared code path modifications are a common source of unacknowledged blast radius. For non-exported types or functions (module-internal), note "internal — zero external blast radius" and skip consumer grep. Focus blast radius effort on exported symbols. Record the blast radius separately for source files (which need code changes) and test files (which need fixture/construction updates). Test migration scope is frequently underestimated in specs — flag it explicitly. For functions that currently throw errors, also grep for the error code/type across the codebase — errors propagate through call chains, so downstream catch sites may not directly import the modified function. Skip error-code grep when the spec only adds new return paths (e.g., new switch cases) without modifying or adding error-throwing behavior. For standalone scripts or CLI entry points (e.g., campaign `run-tournament.mjs` files), identify consumers by tracing the data flow (what parses their output, what invokes them) rather than grepping for import sites.
7. **Existing implementations**: **Refactoring/consolidation specs** (splitting, merging, or reorganizing existing code): the relevant check is whether the refactoring has already been performed — e.g., the source file still exists in its pre-split form, the target module doesn't already exist, or the shared function hasn't already been extracted. Skip the broader pattern search below — it targets novel artifacts, not reorganization. **New artifact specs**: For each major proposed artifact (new types, new files, new patterns), search the codebase for existing implementations with similar names or functionality. Check whether the proposal duplicates existing infrastructure. This catches specs whose premise has been overtaken by prior work. Search using both exact names from the spec AND broader patterns (e.g., if the spec proposes `CompiledTokenFilter`, also search for `tryCompile*`, `*compiler.ts`, `Compiled*` to find related infrastructure that the spec may not reference). **Infrastructure-proposal specs** (adding a new subsystem or declaration mechanism): also search for existing pipelines that auto-generate or synthesize the proposed artifacts — check compiler synthesis functions (e.g., `synthesize*`, `auto*`), auto-generation patterns, and compiled output fixtures (e.g., `*-game-def.json`, `dist/` files) for evidence that the proposed artifacts are already produced by a different mechanism. This catches specs that propose building plumbing which already exists under a different name or via auto-synthesis. **Short-circuit**: If the initial exact-name search returns zero matches, note "no existing implementation found" and skip the broader pattern search — the proposal is genuinely novel.
8. **Quantitative claims**: If the spec states numeric metrics (file counts, function counts, workaround counts), verify them against codebase grep/glob results. Correct inaccurate numbers in the updated spec. **Line counts are especially fragile** — they change with every commit. Always verify line count claims explicitly (e.g., via file reads or `wc -l`), and instruct Explore agents to do the same. **Theoretical projections** (performance estimates, timing budgets, overhead percentages) cannot be verified via grep — note them as "theoretical, not codebase-verifiable" and move on.
9. **Causal/behavioral claims**: If the spec describes a root cause, failure mechanism, or execution flow, trace the actual code path to confirm. The most valuable discrepancies are often not wrong names but wrong explanations — a spec may correctly name a function but misunderstand its behavior or miss a branching path (e.g., an optimization that short-circuits the described flow, or a pipeline vs non-pipeline routing distinction the spec doesn't account for). Instruct Explore agents to trace call chains for any claimed failure mechanism.
10. **Campaign-scoped files**: For specs modifying campaign-level files that exist in multiple campaign directories (e.g., `run-tournament.mjs`, `harness.sh`, `program.md`), verify whether the spec explicitly scopes which copies are affected. If not, flag as an Issue — the spec must state its campaign scope to avoid ambiguity during ticket decomposition.

For specs with many references (>5 types/functions/paths), use up to 2 Explore agents to perform extraction and validation. Split across agents by whatever axis minimizes cross-agent dependency — e.g., internal structure vs external blast radius, structural validation (files, signatures, line counts) vs semantic validation (type shapes, pattern search, consumer analysis), or infrastructure layer (engine vs harness/campaign vs skill) when the spec touches multiple layers. A single agent prompt covering both axes tends to produce shallow results on one or both. For specs that describe failure mechanisms or execution flows, prefer isolating behavioral claim tracing (Step 2.9) into one agent and structural validation (files, types, blast radius) into the other — behavioral claims produce the highest-value discrepancies but require deeper code reading. For specs with fewer than ~10 references, a single agent suffices. Provide each agent with either the full spec content or a comprehensive structured extraction of all references in its scope. If summarizing, ensure you capture every reference from every section — including those embedded in prose, code blocks, tables, and footnotes. The goal is completeness, not format. This is read-only — agent-based exploration is safe and significantly faster.

**Blast radius is mandatory**: The agent prompt MUST explicitly request blast radius analysis — grep for all import sites and consumer files of any type or interface the spec proposes to modify. This is the highest-value output from the Explore agent and must not be omitted.

After the Explore agent returns, you may need to read specific files in full to understand control flow or logic that the agent's summary-level output doesn't capture. This is expected — the agent handles breadth (types, signatures, blast radius), you handle depth (code flow, pseudocode accuracy, insertion points).

After Explore agents return, verify spec/ticket dependencies separately if not covered by agent prompts — a quick glob for each dependency path (`specs/<id>*`, `archive/specs/<id>*`) is sufficient. This check is easy to overlook when drafting agent prompts focused on types and blast radius.

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

Organize all findings from Steps 2 and 3 into the following categories:

- **Issues**: Something in the spec is factually wrong, stale, or violates FOUNDATIONS.md. The spec cannot go to tickets without fixing this.
- **Obsolescence**: The spec's core proposal is already implemented, superseded, or invalidated by codebase evolution. The entire premise needs rethinking, not just refinement.
- **Improvements**: The spec is not wrong, but a refinement would make the implementation cleaner, safer, or more aligned with existing patterns.
- **Additions**: A feature or deliverable not in the spec that would be beneficial and aligns with the spec's stated goals. Apply YAGNI ruthlessly — only propose additions that are natural extensions of the spec's scope, not tangential features.

For each finding, record:
- What the spec says (or omits)
- What the codebase actually has (with file paths and line references)
- The recommended change to the spec

**Cascading corrections**: When a finding has ripple effects on other spec sections (e.g., adding a writer module means updating the writer count in the overview, adding acceptance criteria entries, updating the In Scope description), identify all affected sections during classification. When removing an entire section, trace all references to it: overview counts ("three layers" → "two"), problem statement references, acceptance criteria items, and dependency lists. Pay special attention to the Problem Statement — it often contains summary numbers (line counts, family counts, file counts) that must match the Evidence section after corrections. The diff summary in Step 6 must cover all sections that will change, including cascading corrections — not just the primary finding location. For reassessments with >15 findings or complex ripple effects, tag each finding in the Step 5 report with its cascading scope: append "(cascading: also affects \<section names\>)" to give the user early visibility. For smaller reassessments, the diff summary in Step 6 provides sufficient visibility — cascading tags in Step 5 are optional.

**Handling Obsolescence**: When a spec's core proposal is already implemented or superseded, present two options: (a) archive the spec as completed/superseded, (b) rewrite with a narrower scope targeting the remaining gap. Wait for user direction before proceeding to Step 6. If the user chooses rewrite, the Step 6 output may be a substantially new spec rather than a refinement of the existing one. **Partial obsolescence**: If the spec's infrastructure is already implemented but its configuration/usage goal remains unachieved (e.g., the engine supports metrics but the game data doesn't declare them), classify the infrastructure mismatch as Issues (wrong approach) rather than Obsolescence (invalid premise). Reserve Obsolescence for cases where the entire stated goal — not just the implementation approach — is already satisfied.

**Scope-collapsing reframing**: When findings collectively reveal that the spec's proposed implementation approach is substantially wrong (e.g., engine changes proposed when only data/configuration changes are needed), recommend reframing the spec's Proposed Changes section entirely rather than patching individual claims. Flag the Complexity metadata field for re-evaluation — approach simplification often reduces complexity. Note the reframing in the diff summary so the user sees the full scope of the change.

### Step 5: Present Findings

Present all findings to the user in a structured report:

```
## Reassessment: <spec-name>

### Codebase Status
[Include when the spec extends, modifies, or depends on existing infrastructure. Omit only when the spec proposes entirely novel artifacts with no existing counterpart.]
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

**Plan mode**: Present the full findings report as text first (the structured report from Steps 2-4), then handle questions based on the scenario:

1. **All factual, no questions**: All findings are unambiguous factual corrections (wrong names, wrong paths, wrong counts, or missing documentation of verified codebase facts). Present findings inline → proceed directly to plan file write → ExitPlanMode. The ExitPlanMode approval gate subsumes the Step 5 wait.
2. **Mostly factual, 1-2 blocking questions**: Present findings inline → use `AskUserQuestion` for only the blocking questions. In the inline `### Questions` section, reference the AskUserQuestion call by number (e.g., "See questions below for selection") rather than duplicating the full question text.
3. **Multiple questions (up to 3)**: Present findings inline → use a single `AskUserQuestion` call containing all questions (the tool supports up to 4 per invocation). This gives the user full context before being asked to decide.

In all cases, inline text questions won't block in plan mode — `AskUserQuestion` is required for blocking interaction.

If the user's answers raise new questions or invalidate previous findings, present a follow-up round (same format, same question limit). Repeat until all findings are resolved.

If the user defers a decision back to you (e.g., "you decide", "reassess based on FOUNDATIONS"), first validate any additional context the user provided with their deferral (e.g., facts about how other games use the system, claims about existing architecture) against the codebase using read-only tools — the FOUNDATIONS recommendation is only as sound as the facts it's based on. Then analyze the question against `docs/FOUNDATIONS.md` principles, present your recommendation with the specific Foundation justification, and treat it as approved unless the user objects. If the recommendation does not expand the spec's scope (e.g., it only adds a clarifying note or corrects a factual claim), treat it as approved immediately without blast radius re-assessment. If the recommendation expands the spec's scope (e.g., adding a prerequisite refactor justified by Foundation 15), re-assess the blast radius for the expanded scope before treating the recommendation as approved — add any newly-affected files to the findings. Scale the analysis depth to the question type:
- **Simple factual questions**: A one-line Foundation reference suffices.
- **Design questions with a clear FOUNDATIONS answer**: Evaluate each option against the relevant Foundations. Identify the decisive Foundation(s) — the one(s) that make one option clearly superior. Lead the recommendation with that Foundation. Provide a focused paragraph — state the recommendation, cite the Foundation(s), and briefly explain the implementation consequence. Do not enumerate alternatives at length. If reaching the recommendation requires briefly explaining _why_ alternatives are inferior, a short comparison is acceptable — the prohibition targets open-ended design discussions where no Foundation is decisive, not cases where the comparison itself demonstrates the Foundation's applicability.
- **Architectural questions with multiple viable alternatives**: Provide a brief comparison of alternatives against FOUNDATIONS.md principles before presenting the recommendation.

If a deferred question is rendered moot by another approved decision (e.g., the section containing the threshold is removed), note the mooted state and move on — no FOUNDATIONS analysis needed.

If the user requests deeper analysis of a specific finding before deciding, perform the investigation using read-only tools (reading additional source files, tracing call chains, etc.) and present updated findings before re-asking for approval. This investigation round does not count toward the follow-up question limit — it is resolution of the original question, not a new question.

### Step 6: Write the Updated Spec

After all findings are resolved and the user has approved the changes:

1. **Draft the updated spec** incorporating all approved changes. Preserve the spec's existing structure and voice. Do not rewrite sections that have no findings — change only what was agreed upon.
2. **Present the diff summary** to the user as a numbered list: `N. **<section name>**: <one-line change description>`. Include metadata field changes (Status, Priority, Complexity, Dependencies) in the diff summary when they change as a consequence of the reassessment findings — these affect downstream ticket decomposition.
3. **Wait for final approval** before writing the file.
4. **Write the updated spec** to the same path as the original, overwriting it.

If the user requests changes to the draft, incorporate them and re-present before writing.

**Plan mode note**: If invoked during plan mode, Steps 1-5 proceed normally (read-only). Step 6 (writing the updated spec) is deferred until plan mode is exited. All AskUserQuestion rounds (including user-deferred FOUNDATIONS analysis) must be fully resolved before writing the plan file — the plan file should capture the final approved changes, not intermediate proposals. Record the approved changes in the system-provided plan file (including the diff summary), then call ExitPlanMode. Title the plan file section "Approved Changes (Diff Summary)" — this serves as the Step 6.2 presentation. The plan file version of the diff summary should be at least as detailed as the inline presentation — the plan file is the durable artifact. ExitPlanMode approval covers both the plan and the diff summary — a separate Step 6 approval is not needed. After ExitPlanMode approval, proceed directly to Step 6.4 (write the updated spec) — do not re-present the diff summary in conversation.

### Step 7: Post-Write Verification and Final Summary

After writing the updated spec, verify that all file paths referenced in the updated spec exist (quick glob per path). This catches stale references introduced during the rewrite.

Then present:

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
- **No approach proposals**: This is reassessment, not greenfield design. Do not propose 2-3 alternative architectures. The spec already has a design — validate and refine it. Exception: when a user-deferred decision is resolved via FOUNDATIONS.md analysis and the recommended fix requires expanding the spec's scope to address a root cause (Foundation 15), present the scope expansion as an Addition finding with explicit Foundation justification.
- **Preserve spec voice**: When editing, match the spec's existing writing style. Do not rewrite unchanged sections for stylistic preferences.
- **Preserve downstream structure**: When writing the updated spec, preserve all metadata fields (Status, Priority, Complexity, Dependencies, etc.) and section headings that downstream skills (e.g., spec-to-tickets) may depend on. Do not rename or remove standard sections.
- **Worktree discipline**: If working in a worktree, ALL file operations use the worktree root path.
