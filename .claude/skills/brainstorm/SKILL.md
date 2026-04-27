---
name: brainstorm
description: "Confidence-driven brainstorming skill. Interviews the user until 95% confidence about what they actually want, proposes approaches with tradeoffs, produces an approved design doc. Checks FOUNDATIONS.md alignment for implementation topics. Replaces the global superpowers:brainstorming for this repo."
user-invocable: true
arguments:
  - name: request
    description: "The brainstorming topic or question. If omitted, inferred from the preceding conversation context."
    required: false
  - name: reference_paths
    description: "Optional path(s) to one or more reference files (report, brainstorming doc, analysis) to read as context before starting the interview. Multiple paths are common when the brainstorm builds on layered prior analysis (e.g., research report → spec → deferred-work section of that spec)."
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
              [Optional] External prior-art survey for architectural topics
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

1. **Reference files**: If one or more reference paths are provided, read each entire file. Extract key claims, proposals, and open questions from each. Summarize what they contain in 2-3 sentences before proceeding. When references form a chain (e.g., a research report that spawned a spec, plus a deferred-work section of that spec asking for extension), read them in the order provided and treat the latest as primary; earlier references are background. Reference plurality also applies when one document names another document that is load-bearing for the brainstorm — read the named document too rather than treating the user's list as exhaustive.

2. **Topic classification**: Determine the brainstorm mode:
   - **Design** (default): The goal is to explore a problem and produce a design. Covers implementation-related topics (code changes, architecture, new features, bug fixes) and non-implementation topics (process, tooling, workflow, strategy, skill design). Follow the full Step 2-6 flow.
   - **Decision/triage**: The goal is to evaluate existing analysis and decide what artifacts to create (specs, tickets, or nothing). Triggered when the reference file contains analyzed findings with recommendations, and the user asks to act on them. Follow the shortened flow: brief interview (confirm intent + risk tolerance) -> verify claims if needed -> write artifacts directly. Skip Steps 3-5 (approaches, section-by-section design, design doc). **Dismiss outcome**: If triage concludes no artifact is warranted, confirm the dismissal rationale with the user and end. No output file is needed — the decision is recorded in the conversation context. Do not modify the reference file's original content without user approval. Appending a triage coverage table is permitted when the user has approved a plan that includes this step. **Transition to design**: If triage results in a non-trivial artifact that requires design (e.g., a skill rewrite, a spec with multiple interacting sections), transition to Steps 3-4 (Propose Approaches, Present Design) for the artifact construction phase. The shortened interview from triage mode still applies — do not restart the full interview. **Confidence blocks in short flows**: For triage flows where a single user answer resolves all gaps, the confidence block after verification results may be the only one needed. Transition directly to the outcome when the user's response is both an answer and a decision.
   - **Operational**: The goal is to safely execute a concrete destructive or system-affecting action (rollback, cleanup, repair, migration, dependency upgrade, environment reset). Triggered when the user requests a specific action with side effects, not a design or evaluation of analysis. Follow the shortened flow: brief interview to confirm scope and risk tolerance → verify current system state (git, fs, build, tests) → write an executable plan with explicit numbered steps, expected outputs, and verification checks. Skip Steps 3-4 (approaches, section-by-section design); the action is the request, the design is the step list. The artifact is a plan-style doc, not a spec or ticket. See Step 5 for output format. Operational tasks frequently run under plan mode — see "Plan Mode Interaction" below.
   - **Decision-requiring-design**: If a decision/triage question can only be answered by producing a design (e.g., "should X and Y be merged?" requires designing the merged version to evaluate feasibility), classify as design from the start. The decision is embedded in the design approval.
   - **External LLM analysis**: When the reference file is analysis produced by another LLM (e.g., ChatGPT evaluating a skill, architecture, or design), follow decision/triage mode if the user asks to evaluate the proposals, or design mode if the user asks to act on them. Verify factual claims about the codebase before accepting them as constraints.

   Announce the chosen classification in one sentence before proceeding (e.g., "Topic classification: design — producing a campaign infrastructure artifact."). This forces conscious classification, especially when the topic could plausibly fit two modes (e.g., a campaign design that also launches a destructive worktree-modifying loop), and creates an audit trail for the rest of the conversation.

3. **If implementation-related** (either mode): Read `docs/FOUNDATIONS.md`. You will need it to validate proposed approaches or artifact content against architectural principles. *"Implementation-related" means the design will result in changes to source code governed by FOUNDATIONS.md — skill design, process changes, and tooling configurations are not, even if they indirectly influence implementation.*

4. **Confidence adjustment for rich reference files**: If the reference file provides detailed analysis with specific recommendations, counter-evidence, and tradeoffs, adjust your starting confidence accordingly. A directional report with general suggestions may start you at 60-70%. A report with specific, codebase-grounded proposals (concrete file references, verified claims, detailed tradeoffs) may start at 70-80% — the remaining gap is typically just user intent and risk tolerance.

5. **Project context**: Briefly check relevant project state (recent files, existing specs/tickets in the area) only if the topic clearly relates to a specific part of the codebase. Do not do a broad exploration — keep it targeted.

6. **Conversation context**: If the brainstorm follows extensive prior work in the same session (e.g., debugging, optimization campaigns, code exploration), treat the accumulated conversation context as equivalent to a rich reference file. Start confidence at 60-70% — you mainly need intent and scope clarification, not domain investigation.

7. **Existing artifact investigation**: When the brainstorm topic concerns existing codebase artifacts (skills, modules, configurations, files), read them during this step — before the first interview question. The interview is more productive when grounded in the actual artifact content rather than the user's summary of it. Heavy artifact investigation without a reference file (e.g., reading sibling code, workflow YAMLs, convention examples) typically yields a 70-80% starting confidence — comparable to a rich reference file under Step 1.4.

## Step 1.5: Pre-Interview Verification (Optional)

Before the interview, run targeted verification when either of these triggers applies:

**Trigger A — Reference file has verification criteria.** The reference file contains hypotheses with explicit counter-evidence checks, verification criteria (e.g., "check whether X is true before proceeding"), or factual claims about the codebase that can be verified by reading code (e.g., "the skill only traces 2-3 levels deep", "the engine uses discriminated unions extensively").

**Trigger B — System/codebase state is part of the topic.** The brainstorm topic involves system state that can be queried directly (git status/log, filesystem layout, build state, test results, existing artifacts). Pre-checking state before the first user question makes interview questions more specific and reduces total question count.

Mode-specific behavior:

- **Design mode**: For Trigger A, present the checks to the user: "The report prescribes N verification checks. Should I run them now?" If yes, run them. For Trigger B, distinguish by cost: cheap inspections (reads, grep, git status, single commands, orientation-level source reads) run directly without asking — the cost is low and they shape better questions. Moderately expensive inspections (multi-minute simulator runs, full test suites, builds that exceed ~1 minute of wall-clock time) still run autonomously under auto mode, but outside auto mode announce the expected cost ("this will run ~5 minutes against the engine") and proceed unless the user redirects. When the topic spans multiple subsystems (kernel + simulator + agents + protocol + UI, etc.), orientation-level reads — `docs/architecture.md`, `docs/project-structure.md`, and representative source files at module boundaries — are a legitimate Trigger B activity; keep the read scoped to what makes the first interview question specific rather than attempting a full codebase survey. "Inspections" in this skill is shorthand for both prescribed checks and scoped orientation reads.
- **Triage mode**: Proceed directly to verification without asking. The user invoked triage specifically to act on the report — verification is an expected prerequisite, not an optional step.
- **Operational mode**: Always run state verification (Trigger B). The plan's correctness depends on accurate observed state, not assumed state.
- Run checks using Explore agents, grep, git log, file reads — whatever the checks require
- Report results before proceeding to the interview
- Adjust confidence and approach based on what the checks reveal
- Verification artifacts created during this step (diagnostic scripts, probe fixtures, measurement logs) fall into one of three disposition categories. State which category applies in the Step 6 summary so the user knows what was left behind:
  - **promoted to repo** — the artifact covers a failure mode no existing tool reproduces; add it under `campaigns/`, `packages/*/test/fixtures/`, or equivalent so future sessions can reuse it.
  - **ephemeral (/tmp or equivalent)** — the artifact was a convenience wrapper around existing tooling and does not add coverage. Left in `/tmp` where the OS will clean it up; no repo footprint.
  - **deleted** — the artifact was exploratory, did not produce usable coverage, and was not even a useful convenience wrapper. Removed explicitly.

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

After each user answer, communicate confidence and remaining gaps explicitly. Two display formats are acceptable — pick based on gap length.

Fenced block (multi-gap or long list):

```
Confidence: X%
Gaps: [list of remaining unknowns]
```

Inline prose (short gap statement): `Confidence: 85% — main gap is whether scope includes Y`.

Either way, name the percentage and the specific gaps. Vague phrasings like "I need more information" are not acceptable. Keep asking questions until confidence reaches 95%. Then announce: "I'm at 95% confidence. Moving to approaches."

### Interview Rules

1. **One question per message.** Never ask multiple questions at once. **Exception — triage mode**: Related independent decisions (e.g., disposition of item A + artifact format for item B) may be batched into a single AskUserQuestion call when the questions don't depend on each other's answers. **Exception — terminal design-mode rounds**: At ≥ 95% confidence (or under the 90–94% approach-closes-gaps exception in the Confidence Scoring Guide) where every remaining gap is a multiple-choice terminal decision that the Step 3 approach selection or a scoped scope/amendment choice will close, those gaps may be batched in the same message as the approach presentation. The inverse does not hold: open-ended "what problem are you solving?"–class questions must still be one per message.
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

**90–94% exception**: If the remaining gaps are user-intent questions that the Step 3 approach choice will resolve (e.g., scope preferences that map directly onto distinct approach options), advance after stating the gaps explicitly — the approach selection closes them. Do not use this exception to skip problem- or constraint-level gaps; those must reach 95% through interview or investigation first.

### Early Exit

If the user says something like "just go" or "that's enough questions", respect it. Announce your current confidence, list remaining gaps as assumptions you'll make, and proceed to Step 3. Mark those assumptions explicitly in the design so the user can correct them.

### High-Confidence Start

If prior session context (e.g., extended debugging, codebase exploration, or diagnostic work earlier in the conversation) puts starting confidence above 80%, the interview may reduce to 1-2 targeted questions about remaining gaps. If confidence reaches 95% after context reading alone (no user questions needed), announce the confidence score with explicit gaps/assumptions and proceed directly to Step 3. The interview is a tool for gap-filling, not a mandatory ceremony.

**Compound-move variant at 80–94%**: When the remaining gaps are all multiple-choice terminal decisions (which approach, is scope X in or out, amend foundation Y), the Step 3 approach presentation and the final gap-closer questions may be combined into a single message — the user's choice of approach simultaneously resolves the remaining gaps. This is the natural flow when the gaps are "which option" rather than "what's the problem", and the approach recommendations already implicitly argue for one scope/amendment answer over the others. The message shape: short findings recap → 2-3 approaches with tradeoffs → explicit batched gap-closers ending with "pick one and call out the other gaps". See Interview Rule 1's terminal-round exception.

### Investigation Questions

When a confidence gap can only be resolved by codebase investigation — not by asking the user — investigate directly rather than asking. This commonly happens for:

- **Scope decisions**: "How much should this cover?" → trace dependency graphs, check module boundaries
- **Feasibility**: "Can X and Y be separated?" → read call graphs, check circular dependencies
- **Existing infrastructure**: "Does something like this already exist?" → search for prior art in the codebase

Announce what you're investigating and why, present findings, then resume the interview with the new information incorporated into your confidence score. The user explicitly requesting investigation (e.g., "investigate the matter carefully") is a strong signal to use this path.

In design mode, investigation may legitimately span Step 1, 1.5, and 2 as the problem boundary shifts — an artifact read in Step 1 may surface a diagnostic worth running in Step 1.5, which in turn may surface a broader sweep worth running mid-Step 2. There is no cap on investigation stages as long as each is justified, announced, and proportionate to the decision at stake. Record the confidence delta each phase produces so the accumulated investigation is visible rather than implicit.

### Mid-Flow Investigation (Triage Mode)

If the user responds to a triage question with a request for additional investigation rather than a decision (e.g., "check against FOUNDATIONS.md", "investigate further before I decide"), perform the investigation, present findings with a recommendation, and resume the triage flow. This is not a confidence regression — it's a targeted inquiry within a decision that's otherwise scoped. Do not restart the interview or re-ask resolved questions.

## Step 2.5: External Prior-Art Survey (Optional)

Before proposing approaches, run a targeted external prior-art survey when either trigger applies:

**Trigger A — User requested external research.** The user asked to "research online", "look up prior art", or similar. Proceed without re-asking.

**Trigger B — Architectural topic without prior-art coverage in references.** The brainstorm designs cross-cutting architecture (kernel, protocol, state model, public API) and the reference files do not already survey how similar systems solved the same problem. External survey grounds Step 3's approaches in real systems rather than speculation, which serves FOUNDATIONS #15 (Architectural Completeness).

Execution:

- Run 3–5 parallel web searches scoped to systems that solved the *same* problem, not adjacent ones. Frame searches as "What repository or framework made this architectural choice for this reason?" rather than broad topic surveys.
- Cite sources when presenting approaches in Step 3 — short URL lists under each approach are sufficient.
- Capture canonical pattern names (e.g., "IExtendedSequence stack", "information sets", "factored action spaces") so the design can reference shared vocabulary.
- Skip the step entirely when the reference file already inventories prior art, when the topic is project-specific with no natural external analog (data fixtures, private DSL details, game-specific tuning), or when neither trigger applies.

This is a solution-space survey, not an interview replacement. Do not substitute prior-art reading for unresolved user-intent gaps from Step 2. If prior-art findings reveal that approach options depend on a user decision not yet covered, pause the survey and return to Step 2 for the missing interview round — treat it as one more investigation stage under Step 2's "no cap on investigation stages" rule.

## Step 3: Propose Approaches

Present **2-3 distinct approaches** with:

- **Name**: A short descriptive label
- **How it works**: 2-4 sentences
- **Tradeoffs**: What you gain, what you give up
- **Recommendation**: Lead with your recommended option and explain why

**If the reference file already contains evaluated approaches** with tradeoffs and counter-evidence, present those as the approach options rather than generating new ones. The brainstorm's value in this case is validation and decision, not ideation. You may add a new approach if the reference file's options have a clear gap.

**If triage produced a set of approved changes** (decision/triage → design transition), the approach options shift from "which changes" to "how to apply them" — e.g., incremental patches vs. structured rewrite vs. phased rollout. Present these implementation strategies as the approaches.

**If implementation-related**: For each approach, note which FOUNDATIONS.md principles it aligns with or tensions it creates. Use format: `Foundations: F1 (aligns), F8 (tensions — [reason])`. Omit the line for an approach that is FOUNDATIONS-neutral relative to its alternatives — only tag when it surfaces a real differentiator (alignment unique to this approach, or a tension absent in the others). When all approaches are FOUNDATIONS-equivalent, defer per-approach tagging entirely and address FOUNDATIONS in the Step 4 design section.

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

The list above is a starting menu, not a fixed schema — domain-appropriate substitutions (e.g., "Phases" or "Step-by-step execution" in place of "Data flow / Process") are expected for non-implementation designs.

"Implementation-related" means the design will result in changes to source code governed by FOUNDATIONS.md. Skill design, process changes, and tooling configurations are not implementation-related for this purpose, even if they indirectly influence implementation.

**After each section**, ask: "Does this section look right?" Wait for confirmation before presenting the next section. If the user pushes back, revise that section before continuing.

**Auto-mode adaptation**: When Claude Code's auto mode is active, section-by-section gating compresses to consolidated presentation with a single approval. Present the remaining sections together and proceed to Step 5 artifact writing unless the user has pushed back on a prior section. This matches auto mode's "prefer action over planning" posture while preserving substantive review — the user still sees every section before the artifact is written. If a user objection arises mid-consolidation, stop, revise the flagged section, and present the revision for approval before continuing.

**Compound-move + auto-mode intersection**: When Step 2's compound-move variant was used (approach presentation merged with terminal gap-closer), the consolidated Step 4 design preview is still required as a separate message before the artifact write — section-name bullets with a one-line summary each are sufficient, full prose is not. The compound-move's approach-level overview does NOT satisfy the section preview promise, since later sections (edge cases, recovery info, files NOT touched, step-by-step execution) are typically not enumerated at approach time. Skip the preview only when the user has explicitly waived it ("just write the file", "skip the preview", or equivalent).

## Step 5: Write Output Artifacts

**Plan mode override**: If plan mode is active, the harness specifies the artifact path; write there instead of the per-mode default below. See "Plan Mode Interaction" earlier in this skill.

**Numbering convention (applies to spec/ticket outputs)**: When writing specs or tickets, check existing files in `specs/`, `specs/archive/`, and git history (`git log --oneline --all | grep -oP '[Ss]pec \K[0-9]+'`) to determine the next available number. Follow established formatting conventions from existing specs.

### Design mode (default)

Once all sections are approved, determine the output format:

- **If the design needs further refinement** (sections had significant revision, open questions remain, approach is exploratory): write to `docs/plans/YYYY-MM-DD-<topic>-design.md`. Include a "Brainstorm Context" header noting the original request, reference file (if any), key interview insights, and final confidence score with any assumptions.
- **If all sections were approved without revision and the output is a well-scoped implementation spec** (ready for ticket decomposition): write directly to `specs/<number>-<name>.md`. The design doc is a staging area for designs that need further discussion — not a mandatory waypoint when the brainstorm produces a finished spec.
- **If the brainstorm produces a new user-invocable skill**: write to `.claude/skills/<name>/SKILL.md`. Follow the convention visible in sibling skills under `.claude/skills/` — frontmatter (`name`, `description`, `user-invocable: true`, optional `arguments` with `name`/`description`/`required`), worktree-awareness section, numbered Process steps, Guardrails. Use the multi-file directory pattern (`SKILL.md` + `references/`) only when SKILL.md would exceed ~250 lines or when distinct instruction surfaces warrant extraction; defer to `skill-extract-references` for retroactive splitting rather than pre-splitting at creation time.

**Destructive-action sections**: If the design prescribes destructive or irreversible actions (file deletion, branch-protection edits, dependency changes, schema migrations, force-push, etc.), include the operational-mode sections — *Verified state*, *Step-by-step execution*, *Verification checklist*, *Recovery info*, and *Files NOT touched* — regardless of which output format above applies. These sections turn a design into a safe-to-execute plan and prevent the implementor from improvising recovery on the spot.

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

### Multi-file artifact directory

When the brainstorm's output is a multi-file directory (e.g., an `improve-loop` campaign, a plugin scaffold, a harness scaffold) rather than a single prose document:

- **Output path**: a new directory whose location follows existing repo convention (e.g., `campaigns/<name>/` for improve-loop campaigns; `<plugin-root>/<name>/` for plugin scaffolds). Confirm the convention by listing the parent directory before writing.
- **Required artifacts** (campaign example): one human-readable instruction spec (e.g., `program.md`) that captures the approved design verbatim, plus the executable scaffolding the design prescribes (harness script, runner script, fixtures). Generate the spec and the scaffolding in the same brainstorm — do not defer scaffolding to a follow-up.
- **Section-by-section approval applies to the spec only.** The executable scaffolding (harness, runner) is mechanical translation from the approved spec, not new design. Compound-move + auto-mode rules from Step 4 still apply to the spec; under auto mode, write the scaffolding immediately after the spec is approved without further per-file approval.
- **Do NOT commit the directory.** Leave it for user review like any other Step 5 artifact.
- **Smoke-validate** the executable scaffolding per Step 5.5 before handoff.

## Step 5.5: Validate Executable Artifacts

When Step 5 produces executable code (harness scripts, benchmark runners, plugins, generated config) — not just prose — run cheap structural checks before handing off to the user. Skill artifacts (`.claude/skills/<name>/SKILL.md`) get a parallel set of checks documented under "Skill artifact checks" below.

**Mandatory checks** (every executable artifact):

- **Syntax check**: `node --check <file.mjs|.js>`, `bash -n <file.sh>`, `python -m py_compile <file.py>`, or the language equivalent. These catch import errors, scoping bugs (e.g., referencing a class declaration before its definition), missing braces, and similar mechanical defects in <1 second.
- **Permission/shebang check**: if the artifact is meant to be invoked directly (`./harness.sh`, executable via shebang), verify the executable bit (`ls -l`) and shebang line.

**Optional checks** (when the runtime is bounded, typically <2 minutes per mode):

- **Smoke run**: invoke the artifact once per declared operating mode (e.g., `--mode on`, `--mode off`) and confirm it produces structurally valid output (expected JSON keys, exit code 0, expected order of magnitude on declared metrics). Skip when a single invocation would exceed ~2 minutes unless the user explicitly opts in.
- **Cross-mode comparison** (when applicable): if the artifact has a declared expected relationship between modes (e.g., a watchdog mode should be ~baseline-time, a primary mode should reproduce a known regression), confirm the relationship holds within reasonable noise.

**Skill artifact checks** (every new SKILL.md produced by Step 5):

- **Frontmatter validity**: the YAML frontmatter parses; contains `name`, `description`, and `user-invocable`; if `arguments` is present, each entry has `name`, `description`, and `required`.
- **Directory layout**: matches sibling-skill convention under `.claude/skills/`. Single `SKILL.md` by default; `SKILL.md` + `references/` only when SKILL.md is a thin entry point.
- **Harness registration**: the new skill name appears in the next system-injected available-skills list. The harness re-loads its index after a write; registration is observable in the next message's system-reminder block. If the skill does not appear, re-check frontmatter and file path before handoff.

Skill artifacts are prose, not executable code, so syntax/permission/smoke checks do not apply. The disposition rules below cover frontmatter typos (mechanical → fix in-place) and missing-design-section gaps (structural → raise to user).

**Defect disposition**:

- **Mechanical defects** (syntax errors, missing imports, typos, executable-bit not set): fix in-place silently. This is artifact-correctness, not re-design — it does not require re-approval.
- **Structural defects** (wrong scope, missed requirement, design assumption violated by the smoke run): raise back to the user with a one-line summary of what the smoke run revealed, propose a corrected design, and re-validate after the correction is approved. This IS a design correction — surface it, do not silently rewrite the artifact.

The hard gate at the top of this skill is preserved: validation confirms structural correctness of the *approved* design, it does not introduce new behavior.

## Step 6: Next Steps Menu

**Plan mode override**: If plan mode is active, replace the menu with `ExitPlanMode`. The plan-mode approval IS the next-step decision. See "Plan Mode Interaction" earlier in this skill.

Present the user with options for what to do next. Adapt the menu to the output format:

**If output was a design doc** (`docs/plans/`):
```
What would you like to do next?
1. Write an implementation plan (invoke superpowers:writing-plans skill)
2. Create a spec from this design (write to specs/)
3. Start implementing directly
4. Done for now — I'll review the design doc later
```

**If output was already a spec** (`specs/`):
```
What would you like to do next?
1. Decompose into implementation tickets (invoke spec-to-tickets with namespace <SUGGESTED>)
2. Review the spec first — recommended for XL specs (many tickets, broad scope) where direct implementation would skip the decomposition step
3. Start implementing directly — appropriate for small specs (single ticket or small contiguous slice)
4. Done for now — I'll review the spec later
```

Suggest a namespace for option 1 derived from the spec title at menu time. The existing repo convention (visible in `tickets/`) is `<spec-number><UPPERCASE-INITIALS-OF-FIRST-3-TO-4-MEANINGFUL-WORDS>` — e.g., spec 139 "constructibility-certificate-legality-contract" → `139CCONLEGCONT`; spec 140 "microturn-native-decision-protocol" → `140MICRODECPRO`. Surfacing the namespace in the menu saves the user a round-trip through spec-to-tickets' "ask for namespace" prompt.

Option 2 vs option 3 is a size heuristic, not a hard rule: specs that decompose into 4+ tickets across 3+ implementation waves generally benefit from review-first; smaller specs may go straight to implementation. Adapt the menu wording to the actual spec shape when presenting it.

**If triage produced spec(s) and/or report updates**:
```
What would you like to do next?
1. Decompose spec(s) into implementation tickets (invoke spec-to-tickets with namespace <SUGGESTED-PER-SPEC>, derived from each spec title using the same convention as the spec-output menu)
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

**If output was a multi-file artifact directory** (`campaigns/<name>/`, plugin scaffold, etc.):
```
What would you like to do next?
1. Launch the workflow now (e.g., `/improve-loop campaigns/<name>` for campaigns; equivalent invocation for other directory artifacts)
2. Smoke-test the harness/runner first (run one mode end-to-end at baseline cost before launching the loop)
3. Done for now — I'll launch later
```

Adapt option 1 to the directory's downstream consumer — `/improve-loop` for campaigns, the relevant plugin-loader command for plugin scaffolds, etc. Option 2 applies when Step 5.5's optional smoke run was deferred (e.g., per-mode runtime exceeds the ~2-minute bounded threshold and the user did not opt in earlier).

**If output was a new skill** (`.claude/skills/<name>/SKILL.md`):
```
What would you like to do next?
1. Validate via `/skill-audit .claude/skills/<name>` (catches frontmatter and cross-skill issues before first real use)
2. Exercise the skill on a representative real-world case
3. Done — I'll exercise it next time the trigger arises
```

Recommend option 1 when the new skill has more than ~150 lines or invokes other skills as chain neighbors. For short, self-contained skills, option 3 is reasonable.

**Continual Learning prompt** (only when applicable): If the brainstorm surfaced a concrete gap in `CLAUDE.md`, `docs/FOUNDATIONS.md`, or an existing skill (conflicting instructions, missing guidance, outdated references), append an option: "Propose updates to <file>". Do not include this option speculatively — only when the brainstorm produced specific evidence of a gap. This implements CLAUDE.md's Continual Learning rule.

If the user has already stated their next step (e.g., in the same message that approved the final design section, or immediately after artifact writing), skip the menu and proceed with their stated intent. If the brainstorm was invoked mid-task (e.g., during active troubleshooting or implementation) and the design is a targeted fix, present a brief confirmation ("Ready to implement — proceeding unless you'd prefer a different path") rather than the full menu. In triage mode, if all items have been triaged and artifacts written, the brainstorm is naturally complete — the menu may be skipped when continuation would add no value.

**Auto-mode adaptation**: Under Claude Code's auto mode, the multi-option menu is replaced by a brief recommendation + one-beat pause. State the recommended next step (typically option 1 for well-scoped specs and operational plans, or option 2 for XL specs that benefit from review-first), explain in one sentence why it is the recommendation, and offer the user a chance to redirect before proceeding. If the user is silent or affirms the recommendation, proceed with it. This matches auto mode's "prefer action over planning" directive without forgoing substantive user control — the user still sees what will happen and can veto. The disposition of any Step 1.5 verification artifacts (promoted / ephemeral / deleted) belongs in this same auto-mode recommendation so the user can object before the next step starts.

Use AskUserQuestion to present this as a proper choice (skip under auto-mode adaptation above). If the user picks an option that invokes another skill, invoke it. If they pick "done", end the session.

## Post-Design Requests

If the user requests follow-up deliverables after the design is written (e.g., migration guides, cross-repo reference documents, documentation), these are outside the brainstorm's scope — fulfill them directly without re-entering the brainstorm flow. The hard gate only applies to the design phase, not to post-design work.

If the design has cross-repo implications (e.g., the same pattern needs to be applied in another codebase), the user may request a migration guide. Write it to `reports/` as a reference document — it's not a spec or ticket, but a structured handoff for another brainstorm session.

## Guardrails

- **YAGNI ruthlessly**: Remove unnecessary features from all designs. If a proposed approach has optional extras, strip them unless the user explicitly asked for them.
- **One question at a time**: Design mode is strict by default — one question per message. Batching is allowed in triage mode and in design-mode terminal rounds where all remaining gaps are multiple-choice terminal decisions that the Step 3 approach selection will close (see Interview Rule 1 for full exception criteria).
- **No implementation before approval**: The hard gate at the top means exactly what it says.
- **FOUNDATIONS.md is authoritative**: For implementation topics, if a proposed approach violates a Foundation principle, flag it immediately. Do not propose approaches that violate Foundations without explicitly calling out the violation and getting user sign-off.
- **Worktree discipline**: If working in a worktree, all file paths use the worktree root.
- **No scope inflation**: The design covers what was asked for. Resist the urge to add "while we're at it" improvements.
- **Respect early exit**: If the user wants to skip ahead, let them. List your assumptions clearly.
- **Execution-time clarifications**: If post-approval execution surfaces a state that contradicts a plan assumption (e.g., a file that was supposed to disappear via reset turns out to predate the rollback target, or a command emits unexpected output), pause and ask via AskUserQuestion. Do not silently work around it. Brief the user on what changed and what the options are. This is consistent with CLAUDE.md's 1-3-1 rule.
