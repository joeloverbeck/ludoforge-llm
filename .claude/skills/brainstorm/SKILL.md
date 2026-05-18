---
name: brainstorm
description: "Confidence-driven brainstorming skill. Interviews the user until 95% confidence about what they actually want, proposes approaches with tradeoffs, produces an approved design doc. Checks FOUNDATIONS.md alignment for implementation topics."
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
Do NOT write any code, scaffold any project, invoke any implementation skill, or take any implementation action until you have presented a design (design mode) or a triage proposal listing the artifacts to be written and their scope (triage mode) and the user has explicitly approved it. This applies to EVERY topic regardless of perceived simplicity.
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
         +--> DESIGN MODE (default; includes Decision-requiring-design when
         |     evaluation requires producing the design):
              Confidence-driven interview loop (target: 95%)
                       |
                       v
              [Optional] External prior-art survey for architectural topics
                       |
                       v
              Propose 2-4 approaches with tradeoffs
                       |
                       v
              Present design section by section, get approval per section
                       |
                       v
              [If implementation topic] Validate against FOUNDATIONS.md
                       |
                       +--> [If recommendation is dismiss] confirm rationale + optional reports/ memo + Continual Learning -> end
                       |
                       v
              Write output artifact (per output-artifacts.md routing:
              docs/plans/, specs/, reports/, campaigns/<name>/,
              or .claude/skills/<name>/)
                       |
                       v
              Next-steps menu (user chooses)

(Under plan mode: artifact path is harness-specified; menu is replaced by ExitPlanMode.)
```

## Procedure

1. **Read context and classify the topic.** Load `references/context-and-classification.md`. Covers reference-file reading, the five topic-classification modes (design / decision-triage / operational / diagnostic / decision-requiring-design) plus the External-LLM trigger pattern (which redirects to one of the five based on user intent), starting-confidence adjustment from prior context (rich reference files, conversation context, artifact investigation, stacked triggers), and the Step 1.5 pre-interview verification rules.

2. **If plan mode is active**, load `references/plan-mode.md` before continuing — its adaptations override Steps 5 (output path) and 6 (next-steps menu).

3. **Run the confidence-driven interview** to 95% (or to the High-Confidence Start threshold when prior context warrants). Load `references/interview-protocol.md`. Covers the announcement template, interview rules (with terminal-round and triage-mode batching exceptions), confidence scoring guide, early-exit and high-confidence-start variants, Pre-Set Directives interactions ("no clarifying questions" / auto mode), investigation patterns, and the optional Step 2.5 external prior-art survey.

4. **Propose approaches and present the design.** Load `references/approaches-and-design.md`. Covers the 2-4 approach format with tradeoffs, FOUNDATIONS-tagging, the conditionally-foreclosed and tactical-strategic compound patterns, the dependency-direction rule for follow-up artifacts, the section-by-section design presentation menu, and the compound-move + auto-mode intersection rules (including the section-bullet preview gate).

5. **Write output artifacts** per the mode-specific routing. Load `references/output-artifacts.md`. Covers all four output modes (design / decision-triage / operational / multi-file-directory), the section-preview gate, the numbering and four-path replacement conventions, the Reassessment-section requirement for external-LLM outputs, phased-spec acceptance budgets, destructive-action sections, and the Design Dismiss outcome path.

6. **If Step 5 produced executable code or a new skill**, load `references/validate-executable-artifacts.md` and run the structural checks (syntax, permission/shebang, frontmatter, harness registration, optional smoke run) before handoff.

7. **Present next steps.** Load `references/next-steps-menu.md`. Covers the per-output-type menus (design doc / spec / triage tickets / triage spec+report / operational plan / measurement report / multi-file directory / new skill), namespace derivation, multi-spec and multi-phase adaptations, mixed primary + secondary mutation overlay, Continual Learning prompt evaluation, and auto-mode adaptation. **Continual Learning MUST be evaluated when** (a) brainstorm output contradicts a `CLAUDE.md` / `docs/FOUNDATIONS.md` / skill / `reports/` claim, (b) brainstorm supersedes a prior report's load-bearing recommendation, OR (c) brainstorm produces the named follow-up artifact a reference report explicitly deferred to — in the third case the offer is to append a `Follow-up: <spec/ticket>` breadcrumb to the source report. Skipping this evaluation is a common miss when reference loading is shortcut.

## Post-Design Requests

If the user requests follow-up deliverables after the design is written (e.g., migration guides, cross-repo reference documents, documentation), these are outside the brainstorm's scope — fulfill them directly without re-entering the brainstorm flow. The hard gate only applies to the design phase, not to post-design work.

If the design has cross-repo implications (e.g., the same pattern needs to be applied in another codebase), the user may request a migration guide. Write it to `reports/` as a reference document — it's not a spec or ticket, but a structured handoff for another brainstorm session.

## Guardrails

- **YAGNI ruthlessly**: Remove unnecessary features from all designs. If a proposed approach has optional extras, strip them unless the user explicitly asked for them.
- **One question at a time**: Design mode is strict by default — one question per message. Batching is allowed in triage mode and in design-mode terminal rounds where all remaining gaps are multiple-choice terminal decisions that the Step 3 approach selection will close (see Interview Rule 1 in `references/interview-protocol.md` for full exception criteria).
- **No implementation before approval**: The hard gate at the top means exactly what it says.
- **Reference loading is mandatory**: Each numbered Procedure step requires loading its named `references/<file>` before executing the step's behavior — even in high-confidence flows where the topic feels familiar. The Procedure-step summaries are pointers to the load-bearing rules, not substitutes for them. Skipping reference loading is the most common cause of missed transparency gates and missed Continual Learning offers in this skill.
- **Section-bullet preview is non-waivable under compound-move**: When Step 2 used the compound-move variant (High-Confidence Start, auto-mode, or "no clarifying questions"), the section-bullet preview MUST land before the Write tool call. "No clarifying questions" constrains interview rounds, not transparency gates. Bundling the section bullets in the same prose message as the approach + findings recap is permitted; what is forbidden is sending the bullets only inside (or immediately alongside) the Write call. See `references/output-artifacts.md` Section-preview gate and `references/interview-protocol.md` Pre-Set Directives §4 for the canonical specification.
- **FOUNDATIONS.md is authoritative**: For implementation topics, if a proposed approach violates a Foundation principle, flag it immediately. Do not propose approaches that violate Foundations without explicitly calling out the violation and getting user sign-off.
- **Worktree discipline**: If working in a worktree, all file paths use the worktree root.
- **No scope inflation**: The design covers what was asked for. Resist the urge to add "while we're at it" improvements.
- **Respect early exit**: If the user wants to skip ahead, let them. List your assumptions clearly.
- **Execution-time clarifications**: If post-approval execution surfaces a state that contradicts a plan assumption (e.g., a file that was supposed to disappear via reset turns out to predate the rollback target, or a command emits unexpected output), pause and ask via AskUserQuestion. Do not silently work around it. Brief the user on what changed and what the options are. This is consistent with CLAUDE.md's 1-3-1 rule.
