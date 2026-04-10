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
Read context (reference file + detect topic type)
         |
         v
[If reference has verification criteria] Run counter-evidence checks
         |
         v
Classify: design | decision/triage
         |
         +--> DECISION MODE: short interview -> verify claims -> write specs/tickets directly
         |         +--> [If artifact needs design] transition to DESIGN Steps 3-4
         |         \--> [If no artifact warranted] confirm dismissal rationale -> end
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
```

## Step 1: Read Context

1. **Reference file**: If `reference_path` is provided, read the entire file. Extract key claims, proposals, and open questions from it. Summarize what it contains in 2-3 sentences before proceeding.

2. **Topic classification**: Determine the brainstorm mode:
   - **Design** (default): The goal is to explore a problem and produce a design. Covers implementation-related topics (code changes, architecture, new features, bug fixes) and non-implementation topics (process, tooling, workflow, strategy, skill design). Follow the full Step 2-6 flow.
   - **Decision/triage**: The goal is to evaluate existing analysis and decide what artifacts to create (specs, tickets, or nothing). Triggered when the reference file contains analyzed findings with recommendations, and the user asks to act on them. Follow the shortened flow: brief interview (confirm intent + risk tolerance) -> verify claims if needed -> write artifacts directly. Skip Steps 3-5 (approaches, section-by-section design, design doc). **Dismiss outcome**: If triage concludes no artifact is warranted, confirm the dismissal rationale with the user and end. No output file is needed — the decision is recorded in the conversation context. Do not modify the reference file without user approval. **Transition to design**: If triage results in a non-trivial artifact that requires design (e.g., a skill rewrite, a spec with multiple interacting sections), transition to Steps 3-4 (Propose Approaches, Present Design) for the artifact construction phase. The shortened interview from triage mode still applies — do not restart the full interview. **Confidence blocks in short flows**: For triage flows where a single user answer resolves all gaps, the confidence block after verification results may be the only one needed. Transition directly to the outcome when the user's response is both an answer and a decision.
   - **Decision-requiring-design**: If a decision/triage question can only be answered by producing a design (e.g., "should X and Y be merged?" requires designing the merged version to evaluate feasibility), classify as design from the start. The decision is embedded in the design approval.
   - **External LLM analysis**: When the reference file is analysis produced by another LLM (e.g., ChatGPT evaluating a skill, architecture, or design), follow decision/triage mode if the user asks to evaluate the proposals, or design mode if the user asks to act on them. Verify factual claims about the codebase before accepting them as constraints.

3. **If implementation-related** (either mode): Read `docs/FOUNDATIONS.md`. You will need it to validate proposed approaches or artifact content against architectural principles.

4. **Confidence adjustment for rich reference files**: If the reference file provides detailed analysis with specific recommendations, counter-evidence, and tradeoffs, adjust your starting confidence accordingly. A directional report with general suggestions may start you at 60-70%. A report with specific, codebase-grounded proposals (concrete file references, verified claims, detailed tradeoffs) may start at 70-80% — the remaining gap is typically just user intent and risk tolerance.

5. **Project context**: Briefly check relevant project state (recent files, existing specs/tickets in the area) only if the topic clearly relates to a specific part of the codebase. Do not do a broad exploration — keep it targeted.

6. **Conversation context**: If the brainstorm follows extensive prior work in the same session (e.g., debugging, optimization campaigns, code exploration), treat the accumulated conversation context as equivalent to a rich reference file. Start confidence at 60-70% — you mainly need intent and scope clarification, not domain investigation.

7. **Existing artifact investigation**: When the brainstorm topic concerns existing codebase artifacts (skills, modules, configurations, files), read them during this step — before the first interview question. The interview is more productive when grounded in the actual artifact content rather than the user's summary of it.

## Step 1.5: Counter-Evidence Verification (Optional)

If the reference file contains hypotheses with explicit counter-evidence checks, verification criteria (e.g., "check whether X is true before proceeding"), or factual claims about the codebase that can be verified by reading code (e.g., "the skill only traces 2-3 levels deep", "the engine uses discriminated unions extensively"), offer to run those checks before the interview. This grounds the brainstorm in verified facts rather than unvalidated claims.

- Present the checks to the user: "The report prescribes N verification checks. Should I run them now?"
- If yes, run them (using Explore agents, grep, git log, file reads — whatever the checks require)
- Report results before proceeding to the interview
- Adjust confidence and approach based on what the checks reveal

Skip this step if the reference file has no explicit verification criteria.

## Step 2: Confidence-Driven Interview

This is the core of the skill. Your goal is to reach **95% confidence** about what the user actually wants before proposing solutions.

### The Protocol

After each user answer, display a confidence block:

```
Confidence: X%
Gaps: [list of remaining unknowns]
```

Keep asking questions until confidence reaches 95%. Then announce: "I'm at 95% confidence. Moving to approaches."

### Interview Rules

1. **One question per message.** Never ask multiple questions at once.
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

### Investigation Questions

When a confidence gap can only be resolved by codebase investigation — not by asking the user — investigate directly rather than asking. This commonly happens for:

- **Scope decisions**: "How much should this cover?" → trace dependency graphs, check module boundaries
- **Feasibility**: "Can X and Y be separated?" → read call graphs, check circular dependencies
- **Existing infrastructure**: "Does something like this already exist?" → search for prior art in the codebase

Announce what you're investigating and why, present findings, then resume the interview with the new information incorporated into your confidence score. The user explicitly requesting investigation (e.g., "investigate the matter carefully") is a strong signal to use this path.

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

## Step 4: Present Design

Once an approach is chosen, present the design **section by section**. Scale each section to its complexity — a sentence for trivial parts, up to 200 words for nuanced parts.

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

**Numbering convention (applies to both modes)**: When writing specs or tickets, check existing files in `specs/`, `specs/archive/`, and git history (`git log --oneline --all | grep -oP '[Ss]pec \K[0-9]+'`) to determine the next available number. Follow established formatting conventions from existing specs.

### Design mode (default)

Once all sections are approved, determine the output format:

- **If the design needs further refinement** (sections had significant revision, open questions remain, approach is exploratory): write to `docs/plans/YYYY-MM-DD-<topic>-design.md`. Include a "Brainstorm Context" header noting the original request, reference file (if any), key interview insights, and final confidence score with any assumptions.
- **If all sections were approved without revision and the output is a well-scoped implementation spec** (ready for ticket decomposition): write directly to `specs/<number>-<name>.md`. The design doc is a staging area for designs that need further discussion — not a mandatory waypoint when the brainstorm produces a finished spec.

Do NOT commit the file. Leave it for user review.

### Decision/triage mode

If the brainstorm's output is specs or tickets (not a design requiring further refinement), skip the design doc and write the artifacts directly:
- **Specs** go to `specs/<number>-<name>.md` following existing spec conventions
- **Tickets** go to `tickets/<PREFIX>-<NNN>-<name>.md` following the ticket template

## Step 6: Next Steps Menu

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

If the user has already stated their next step (e.g., in the same message that approved the final design section, or immediately after artifact writing), skip the menu and proceed with their stated intent.

Use AskUserQuestion to present this as a proper choice. If the user picks an option that invokes another skill, invoke it. If they pick "done", end the session.

## Post-Design Requests

If the user requests follow-up deliverables after the design is written (e.g., migration guides, cross-repo reference documents, documentation), these are outside the brainstorm's scope — fulfill them directly without re-entering the brainstorm flow. The hard gate only applies to the design phase, not to post-design work.

If the design has cross-repo implications (e.g., the same pattern needs to be applied in another codebase), the user may request a migration guide. Write it to `reports/` as a reference document — it's not a spec or ticket, but a structured handoff for another brainstorm session.

## Guardrails

- **YAGNI ruthlessly**: Remove unnecessary features from all designs. If a proposed approach has optional extras, strip them unless the user explicitly asked for them.
- **One question at a time**: Never batch questions. This is non-negotiable.
- **No implementation before approval**: The hard gate at the top means exactly what it says.
- **FOUNDATIONS.md is authoritative**: For implementation topics, if a proposed approach violates a Foundation principle, flag it immediately. Do not propose approaches that violate Foundations without explicitly calling out the violation and getting user sign-off.
- **Worktree discipline**: If working in a worktree, all file paths use the worktree root.
- **No scope inflation**: The design covers what was asked for. Resist the urge to add "while we're at it" improvements.
- **Respect early exit**: If the user wants to skip ahead, let them. List your assumptions clearly.
