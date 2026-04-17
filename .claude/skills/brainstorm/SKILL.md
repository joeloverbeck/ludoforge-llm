---
name: brainstorm
description: "Confidence-driven brainstorming skill. Interviews the user until 95% confidence about what they actually want, proposes approaches with tradeoffs, produces an approved design doc. Checks FOUNDATIONS.md alignment for implementation topics. Replaces the global superpowers:brainstorming for this repo."
user-invocable: true
arguments:
  - name: request
    description: "The brainstorming topic or question. If omitted, inferred from the preceding conversation context."
    required: false
  - name: reference_path
    description: "Optional path to a reference file (report, brainstorming doc, analysis) to read as context before starting the interview."
    required: false
---

# Brainstorm

Confidence-driven collaborative brainstorming. Interviews you until it understands what you **actually want** — not what you think you should want — then proposes approaches, builds a design, and lets you choose what happens next.

<HARD-GATE>
Do NOT write any code, scaffold any project, invoke any implementation skill, or take any implementation action until you have presented a design and the user has explicitly approved it. This applies to EVERY topic regardless of perceived simplicity.
</HARD-GATE>

## Process Flow

```
Read context (reference file + state inspection)
         |
         v
[If reference has verification criteria OR system state needs grounding] Pre-interview verification
         |
         v
Classify: design | decision/triage | operational
         |
         +--> DECISION MODE: short interview -> verify claims -> write specs/tickets directly
         |         +--> [If artifact needs design] transition to DESIGN Steps 3-4
         |         \--> [If no artifact warranted] confirm dismissal rationale -> end
         |
         +--> OPERATIONAL MODE: brief interview -> verify state -> write executable plan w/ verification
         |
         +--> DESIGN MODE (default):
              Confidence-driven interview loop (target: 95%)
                       |
                       v
              Propose 2-3 approaches with tradeoffs
                       |
                       v
              Present design section by section, get approval per section
                       |
                       v
              [If implementation topic] Validate against FOUNDATIONS.md
                       |
                       v
              Write design doc to docs/plans/
                       |
                       v
              Next-steps menu (user chooses)

(Under plan mode: artifact path is harness-specified; menu is replaced by ExitPlanMode.)
```

## Step 1: Read Context

1. **Reference file**: If `reference_path` is provided, read the entire file. Extract key claims, proposals, and open questions from it. Summarize what it contains in 2-3 sentences before proceeding.

2. **Topic classification**: Determine the brainstorm mode:
   - **Design** (default): The goal is to explore a problem and produce a design. Covers implementation-related topics (code changes, architecture, new features, bug fixes) and non-implementation topics (process, tooling, workflow, strategy, skill design). Follow the full Step 2-6 flow.
   - **Decision/triage**: The goal is to evaluate existing analysis and decide what artifacts to create (specs, tickets, or nothing). Triggered when the reference file contains analyzed findings with recommendations, and the user asks to act on them. Follow the shortened flow: brief interview (confirm intent + risk tolerance) -> verify claims if needed -> write artifacts directly. Skip Steps 3-5 (approaches, section-by-section design, design doc). **Dismiss outcome**: If triage concludes no artifact is warranted, confirm the dismissal rationale with the user and end. No output file is needed — the decision is recorded in the conversation context. Do not modify the reference file's original content without user approval. Appending a triage coverage table is permitted when the user has approved a plan that includes this step. **Transition to design**: If triage results in a non-trivial artifact that requires design (e.g., a skill rewrite, a spec with multiple interacting sections), transition to Steps 3-4 (Propose Approaches, Present Design) for the artifact construction phase. The shortened interview from triage mode still applies — do not restart the full interview. **Confidence blocks in short flows**: For triage flows where a single user answer resolves all gaps, the confidence block after verification results may be the only one needed. Transition directly to the outcome when the user's response is both an answer and a decision.
   - **Operational**: The goal is to safely execute a concrete destructive or system-affecting action (rollback, cleanup, repair, migration, dependency upgrade, environment reset). Triggered when the user requests a specific action with side effects, not a design or evaluation of analysis. Follow the shortened flow: brief interview to confirm scope and risk tolerance → verify current system state (git, fs, build, tests) → write an executable plan with explicit numbered steps, expected outputs, and verification checks. Skip Steps 3-4 (approaches, section-by-section design); the action is the request, the design is the step list. The artifact is a plan-style doc, not a spec or ticket. See Step 5 for output format. Operational tasks frequently run under plan mode — see "Plan Mode Interaction" below.
   - **Decision-requiring-design**: If a decision/triage question can only be answered by producing a design (e.g., "should X and Y be merged?" requires designing the merged version to evaluate feasibility), classify as design from the start. The decision is embedded in the design approval.
   - **External LLM analysis**: When the reference file is analysis produced by another LLM (e.g., ChatGPT evaluating a skill, architecture, or design), follow decision/triage mode if the user asks to evaluate the proposals, or design mode if the user asks to act on them. Verify factual claims about the codebase before accepting them as constraints.

3. **If implementation-related** (either mode): Read `docs/FOUNDATIONS.md`. You will need it to validate proposed approaches or artifact content against architectural principles.

4. **Confidence adjustment for rich reference files**: If the reference file provides detailed analysis with specific recommendations, counter-evidence, and tradeoffs, adjust your starting confidence accordingly. A directional report with general suggestions may start you at 60-70%. A report with specific, codebase-grounded proposals (concrete file references, verified claims, detailed tradeoffs) may start at 70-80% — the remaining gap is typically just user intent and risk tolerance.

5. **Project context**: Briefly check relevant project state (recent files, existing specs/tickets in the area) only if the topic clearly relates to a specific part of the codebase. Do not do a broad exploration — keep it targeted.

6. **Conversation context**: If the brainstorm follows extensive prior work in the same session (e.g., debugging, optimization campaigns, code exploration), treat the accumulated conversation context as equivalent to a rich reference file. Start confidence at 60-70% — you mainly need intent and scope clarification, not domain investigation.

7. **Existing artifact investigation**: When the brainstorm topic concerns existing codebase artifacts (skills, modules, configurations, files), read them during this step — before the first interview question. The interview is more productive when grounded in the actual artifact content rather than the user's summary of it.

## Step 1.5: Pre-Interview Verification (Optional)

Before the interview, run targeted verification when either of these triggers applies:

**Trigger A — Reference file has verification criteria.** The reference file contains hypotheses with explicit counter-evidence checks, verification criteria (e.g., "check whether X is true before proceeding"), or factual claims about the codebase that can be verified by reading code (e.g., "the skill only traces 2-3 levels deep", "the engine uses discriminated unions extensively").

**Trigger B — System/codebase state is part of the topic.** The brainstorm topic involves system state that can be queried directly (git status/log, filesystem layout, build state, test results, existing artifacts). Pre-checking state before the first user question makes interview questions more specific and reduces total question count.

Mode-specific behavior:

- **Design mode**: For Trigger A, present the checks to the user: "The report prescribes N verification checks. Should I run them now?" If yes, run them. For Trigger B, run inspections directly without asking — the cost is low and it shapes better questions.
- **Triage mode**: Proceed directly to verification without asking. The user invoked triage specifically to act on the report — verification is an expected prerequisite, not an optional step.
- **Operational mode**: Always run state verification (Trigger B). The plan's correctness depends on accurate observed state, not assumed state.
- Run checks using Explore agents, grep, git log, file reads — whatever the checks require
- Report results before proceeding to the interview
- Adjust confidence and approach based on what the checks reveal

Skip this step only if neither trigger applies.

## Plan Mode Interaction

When Claude Code's plan mode is active, the harness mandates a specific plan file path and requires `ExitPlanMode` for approval. The skill's flow adapts as follows — these adaptations cut across every subsequent step:

- **Step 5 output path**: Write to the harness-specified plan file path (e.g., `~/.claude/plans/<derived-name>.md`) instead of `docs/plans/...`, `specs/...`, or `tickets/...`. Include the same "Brainstorm Context" header content. Specs and tickets cannot be created during plan mode — defer their creation until after approval.
- **Step 6 next steps**: Replace the menu with `ExitPlanMode`. The user's plan-mode approval IS the next-step decision. After approval and exit from plan mode, if the original goal was to produce a spec or ticket, write it then. If the user has already stated their next step, proceed directly.
- **Hard gate**: Plan mode satisfies the hard gate automatically — execution cannot begin until the user approves via the plan-mode review UI.
- **Triage mode artifacts**: If triage would normally produce specs/tickets directly, the plan file should describe which artifacts will be created and where. Create them after plan-mode approval, not during.
- **Operational mode**: Operational tasks frequently run under plan mode because they have side effects. The plan file IS the executable plan; the menu is replaced by `ExitPlanMode`; execution begins after approval.

## Step 2: Confidence-Driven Interview

This is the core of the skill. Your goal is to reach **95% confidence** about what the user actually wants before proposing solutions.

### The Protocol

After each user answer, communicate confidence and remaining gaps explicitly. The fenced block format is one option:

```
Confidence: X%
Gaps: [list of remaining unknowns]
```

Inline prose is acceptable when gaps are short (e.g., "Confidence: 85% — main gap is whether scope includes Y"). Either way, name the percentage and the specific gaps. Vague phrasings like "I need more information" are not acceptable. Keep asking questions until confidence reaches 95%. Then announce: "I'm at 95% confidence. Moving to approaches."

### Interview Rules

1. **One question per message.** Never ask multiple questions at once. **Exception for triage mode**: Related independent decisions (e.g., disposition of item A + artifact format for item B) may be batched into a single AskUserQuestion call when the questions don't depend on each other's answers.
2. **Prefer multiple-choice questions** when the answer space is bounded. Open-ended is fine when it isn't.
3. **Probe motivations before solutions.** Ask "What problem does this solve?" and "What happens if we don't do this?" before "What do you want built?" The user's first request often describes a solution, not the problem. Your job is to find the problem.
4. **Challenge premature specificity.** If the user jumps to implementation details early, ask why that specific approach matters. Often the constraint is softer than stated.
5. **Detect "should want" vs "actually want".** Watch for:
   - Buzzword-heavy descriptions (the user may be echoing best practices they read, not their real need)
   - Over-scoped requests (wanting everything when they need one thing)
   - Vague success criteria ("it should be good" — probe for what "good" means concretely)
   - Solutions stated as requirements ("I need a microservice" — do they need a microservice, or do they need X capability?)
6. **Name your uncertainty.** When you display gaps, be specific: "I don't know whether this needs to handle edge case X" is useful. "I need more information" is not.
7. **Respect user expertise.** If the user gives a clear, well-reasoned answer, don't re-ask the same thing in different words. Advance.

### Confidence Scoring Guide

| Range | Meaning | Action |
|-------|---------|--------|
| 0-30% | Don't understand the problem yet | Ask about the problem, not the solution |
| 30-60% | Understand the problem, unclear on constraints | Ask about constraints, success criteria, scope |
| 60-80% | Understand problem + constraints, unclear on priorities | Ask about tradeoffs, what matters most |
| 80-95% | Clear picture, a few edge cases or preferences unknown | Ask targeted questions about specific gaps |
| 95%+ | Ready to propose | Transition to Step 3 |

### Early Exit

If the user says something like "just go" or "that's enough questions", respect it. Announce your current confidence, list remaining gaps as assumptions you'll make, and proceed to Step 3. Mark those assumptions explicitly in the design so the user can correct them.

### High-Confidence Start

If prior session context (e.g., extended debugging, codebase exploration, or diagnostic work earlier in the conversation) puts starting confidence above 80%, the interview may reduce to 1-2 targeted questions about remaining gaps. If confidence reaches 95% after context reading alone (no user questions needed), announce the confidence score with explicit gaps/assumptions and proceed directly to Step 3. The interview is a tool for gap-filling, not a mandatory ceremony.

### Investigation Questions

When a confidence gap can only be resolved by codebase investigation — not by asking the user — investigate directly rather than asking. This commonly happens for:

- **Scope decisions**: "How much should this cover?" → trace dependency graphs, check module boundaries
- **Feasibility**: "Can X and Y be separated?" → read call graphs, check circular dependencies
- **Existing infrastructure**: "Does something like this already exist?" → search for prior art in the codebase

Announce what you're investigating and why, present findings, then resume the interview with the new information incorporated into your confidence score. The user explicitly requesting investigation (e.g., "investigate the matter carefully") is a strong signal to use this path.

### Mid-Flow Investigation (Triage Mode)

If the user responds to a triage question with a request for additional investigation rather than a decision (e.g., "check against FOUNDATIONS.md", "investigate further before I decide"), perform the investigation, present findings with a recommendation, and resume the triage flow. This is not a confidence regression — it's a targeted inquiry within a decision that's otherwise scoped. Do not restart the interview or re-ask resolved questions.

## Step 3: Propose Approaches

Present **2-3 distinct approaches** with:

- **Name**: A short descriptive label
- **How it works**: 2-4 sentences
- **Tradeoffs**: What you gain, what you give up
- **Recommendation**: Lead with your recommended option and explain why

**If the reference file already contains evaluated approaches** with tradeoffs and counter-evidence, present those as the approach options rather than generating new ones. The brainstorm's value in this case is validation and decision, not ideation. You may add a new approach if the reference file's options have a clear gap.

**If triage produced a set of approved changes** (decision/triage → design transition), the approach options shift from "which changes" to "how to apply them" — e.g., incremental patches vs. structured rewrite vs. phased rollout. Present these implementation strategies as the approaches.

**If implementation-related**: For each approach, note which FOUNDATIONS.md principles it aligns with or tensions it creates. Use format: `Foundations: F1 (aligns), F8 (tensions — [reason])`.

**Wait for user to choose or ask questions.** Do not proceed until the user picks an approach (or asks you to refine/combine).

**If the user rejects all approaches** or asks for re-analysis, investigate the concerns raised, then present a revised set. This is not a confidence regression — it's an iteration on the solution space. Do not restart the interview unless the rejection reveals a misunderstanding of the problem.

## Step 4: Present Design

Once an approach is chosen, present the design **section by section**. Scale each section to its complexity — a sentence for trivial parts, up to 200 words for nuanced parts. For designs with fewer than 3 substantive sections, present the full design in a single message and ask for overall approval rather than section-by-section. Reserve section-by-section flow for designs with 4+ sections where individual sections warrant independent review.

Sections to cover (skip irrelevant ones):

1. **Overview**: What this design achieves in 1-2 sentences
2. **Architecture / Structure**: How the pieces fit together
3. **Key decisions**: Important choices and why
4. **Data flow / Process**: How information moves through the system
5. **Edge cases**: Known tricky scenarios and how they're handled
6. **Testing strategy**: How to verify this works (if implementation-related)
7. **FOUNDATIONS.md alignment**: Table of relevant principles and how the design respects them (if implementation-related)

"Implementation-related" means the design will result in changes to source code governed by FOUNDATIONS.md. Skill design, process changes, and tooling configurations are not implementation-related for this purpose, even if they indirectly influence implementation.

**After each section**, ask: "Does this section look right?" Wait for confirmation before presenting the next section. If the user pushes back, revise that section before continuing.

## Step 5: Write Output Artifacts

**Plan mode override**: If plan mode is active, the harness specifies the artifact path; write there instead of the per-mode default below. See "Plan Mode Interaction" earlier in this skill.

**Numbering convention (applies to spec/ticket outputs)**: When writing specs or tickets, check existing files in `specs/`, `specs/archive/`, and git history (`git log --oneline --all | grep -oP '[Ss]pec \K[0-9]+'`) to determine the next available number. Follow established formatting conventions from existing specs.

### Design mode (default)

Once all sections are approved, determine the output format:

- **If the design needs further refinement** (sections had significant revision, open questions remain, approach is exploratory): write to `docs/plans/YYYY-MM-DD-<topic>-design.md`. Include a "Brainstorm Context" header noting the original request, reference file (if any), key interview insights, and final confidence score with any assumptions.
- **If all sections were approved without revision and the output is a well-scoped implementation spec** (ready for ticket decomposition): write directly to `specs/<number>-<name>.md`. The design doc is a staging area for designs that need further discussion — not a mandatory waypoint when the brainstorm produces a finished spec.

Do NOT commit the file. Leave it for user review.

### Decision/triage mode

If the brainstorm's output is specs or tickets (not a design requiring further refinement), skip the design doc and write the artifacts directly:
- **Specs** go to `specs/<number>-<name>.md` following existing spec conventions
- **Tickets** go to `tickets/<PREFIX>-<NNN>-<name>.md` following the ticket template

### Operational mode

Write an executable plan with the following sections (scale each to its complexity):

- **Context**: Why the action is being taken — the problem, prompt, or intended outcome
- **Verified state**: Concrete observations from Step 1.5 (commit SHAs, file inventories, test results, etc.) so a reader can confirm the plan is grounded in current reality
- **Decisions**: Scope and risk decisions made during the interview, with rationale
- **Step-by-step execution**: Numbered steps with the exact commands or actions, expected outputs, and any conditional branches (e.g., "if dry-run reveals X, pause")
- **Verification checklist**: How to confirm the action succeeded (commands and expected results)
- **Recovery info**: How to undo if something goes wrong (where applicable — e.g., reflog, backup paths)
- **Files NOT touched**: Explicit list of paths/state intentionally outside scope, to prevent accidental over-reach during execution

Output to `docs/plans/YYYY-MM-DD-<action>.md` (or harness-specified plan path under plan mode). Do NOT execute. The plan is the artifact; execution is a separate user-approved step.

## Step 6: Next Steps Menu

**Plan mode override**: If plan mode is active, replace the menu with `ExitPlanMode`. The plan-mode approval IS the next-step decision. See "Plan Mode Interaction" earlier in this skill.

Present the user with options for what to do next. Adapt the menu to the output format:

**If output was a design doc** (`docs/plans/`):
```
What would you like to do next?
1. Write an implementation plan (invoke writing-plans skill)
2. Create a spec from this design (write to specs/)
3. Start implementing directly
4. Done for now — I'll review the design doc later
```

**If output was already a spec** (`specs/`):
```
What would you like to do next?
1. Decompose into implementation tickets (invoke spec-to-tickets)
2. Start implementing directly
3. Done for now — I'll review the spec later
```

**If triage produced spec(s) and/or report updates**:
```
What would you like to do next?
1. Decompose spec(s) into implementation tickets (invoke spec-to-tickets)
2. Run another missing-abstractions analysis on a different test suite
3. Done for now — I'll review the artifacts later
```

**If output was an operational plan** (`docs/plans/YYYY-MM-DD-<action>.md`):
```
What would you like to do next?
1. Execute the plan now (proceed step-by-step with verification at each gate)
2. Defer execution — I'll run it later or in a separate session
3. Revise the plan first (re-enter brainstorm with corrections)
```

**Continual Learning prompt** (only when applicable): If the brainstorm surfaced a concrete gap in `CLAUDE.md`, `docs/FOUNDATIONS.md`, or an existing skill (conflicting instructions, missing guidance, outdated references), append an option: "Propose updates to <file>". Do not include this option speculatively — only when the brainstorm produced specific evidence of a gap. This implements CLAUDE.md's Continual Learning rule.

If the user has already stated their next step (e.g., in the same message that approved the final design section, or immediately after artifact writing), skip the menu and proceed with their stated intent. If the brainstorm was invoked mid-task (e.g., during active troubleshooting or implementation) and the design is a targeted fix, present a brief confirmation ("Ready to implement — proceeding unless you'd prefer a different path") rather than the full menu. In triage mode, if all items have been triaged and artifacts written, the brainstorm is naturally complete — the menu may be skipped when continuation would add no value.

Use AskUserQuestion to present this as a proper choice. If the user picks an option that invokes another skill, invoke it. If they pick "done", end the session.

## Post-Design Requests

If the user requests follow-up deliverables after the design is written (e.g., migration guides, cross-repo reference documents, documentation), these are outside the brainstorm's scope — fulfill them directly without re-entering the brainstorm flow. The hard gate only applies to the design phase, not to post-design work.

If the design has cross-repo implications (e.g., the same pattern needs to be applied in another codebase), the user may request a migration guide. Write it to `reports/` as a reference document — it's not a spec or ticket, but a structured handoff for another brainstorm session.

## Guardrails

- **YAGNI ruthlessly**: Remove unnecessary features from all designs. If a proposed approach has optional extras, strip them unless the user explicitly asked for them.
- **One question at a time**: Never batch questions in design mode. In triage mode, related independent decisions may be batched (see Interview Rule 1).
- **No implementation before approval**: The hard gate at the top means exactly what it says.
- **FOUNDATIONS.md is authoritative**: For implementation topics, if a proposed approach violates a Foundation principle, flag it immediately. Do not propose approaches that violate Foundations without explicitly calling out the violation and getting user sign-off.
- **Worktree discipline**: If working in a worktree, all file paths use the worktree root.
- **No scope inflation**: The design covers what was asked for. Resist the urge to add "while we're at it" improvements.
- **Respect early exit**: If the user wants to skip ahead, let them. List your assumptions clearly.
- **Execution-time clarifications**: If post-approval execution surfaces a state that contradicts a plan assumption (e.g., a file that was supposed to disappear via reset turns out to predate the rollback target, or a command emits unexpected output), pause and ask via AskUserQuestion. Do not silently work around it. Brief the user on what changed and what the options are. This is consistent with CLAUDE.md's 1-3-1 rule.
