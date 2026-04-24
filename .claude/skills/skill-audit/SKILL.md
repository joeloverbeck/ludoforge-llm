---
name: skill-audit
description: Session-aware skill quality audit. Analyzes a skill file against the current session's work (direct evidence) or observationally when no session exercise exists, to find issues, improvements, and missing features. Cross-checks against FOUNDATIONS.md and CLAUDE.md. Invoke at end of session with the skill path as argument.
---

# Skill Audit

Analyze a skill file against the work done in the current Claude Code session to determine whether the skill has issues, could be improved, or needs new features. Report only — never modify the target skill.

## Invocation

```
/skill-audit <path-to-skill-directory>
```

Example: `/skill-audit .claude/skills/improve-loop`

The argument is the skill directory path. The framework automatically resolves `SKILL.md` within it.

## Worktree Awareness

If working inside a worktree (e.g., `.claude/worktrees/<name>/`), ALL file paths — target skill reads, FOUNDATIONS reads, sibling skill reads for cross-skill checks, and follow-up edits — must use the worktree root as the base path. The default working directory is the main repo root; tool calls without an explicit worktree path will silently operate on main.

## Checklist

1. **Read the target skill** — The skill content may already be loaded by the command framework (visible above the `ARGUMENTS:` line). If not, read the SKILL.md file at the provided path. Parse its name, description, and full content. If the file does not exist or is not a skill file, stop and report the error. If the skill directory contains a `references/` subdirectory, read all `.md` files in it — these contain the skill's extracted instructions and are the primary audit surface. The SKILL.md may be a thin entry point that delegates to references.
2. **Read alignment documents** — Read `docs/FOUNDATIONS.md` unless its full text has appeared in a prior tool result (Read, or Agent tool result) this session. Partial excerpts from grep output and summaries embedded in CLAUDE.md do not substitute — re-read if you need the full principle text for cross-check. Do not rely on memory or training knowledge. `CLAUDE.md` is always available via system context injection and does not need explicit reading.
3. **Session reflection** — Review the current conversation context to identify:
   - Moments where the skill's instructions were unclear or ambiguous
   - Steps that were skipped, reordered, or worked around
   - Behaviors the skill didn't anticipate (edge cases, unexpected inputs)
   - Places where Claude had to improvise because the skill didn't provide guidance
   - Outcomes that diverged from what the skill intended
   - Steps that were not exercised this session (mark as "not exercised" — do not speculate about issues)

   When auditing a skill exercised earlier in this session, session evidence is direct (execution gaps, workarounds, improvisation). When auditing a skill being used for the first time in this session (including self-audit), evidence is observational — focus on: (a) instructions that could be read ambiguously, (b) missing guidance for edge cases visible in the skill text, (c) cross-skill consistency with workflow partners. **Self-audit special case**: If the target skill is `skill-audit` itself AND it was already exercised earlier in this session against another target (e.g., you audited some-other-skill, then turn the lens on skill-audit), evidence is direct from that prior execution — observational only when no prior exercise exists. When identifying findings, note whether the gap is an over-constrained assumption (skill says X but should allow Y) or missing coverage (skill says nothing about Z) — this distinction guides whether the fix is relaxing a constraint vs adding new guidance. Convergence (per the Summary template below) applies per-audited-skill, not per-invocation: self-auditing `skill-audit` after using it to audit another skill this session does NOT trigger convergence for `skill-audit` itself. Convergence requires `skill-audit` to have been previously audited AND updated this session — prior execution as an auditor does not count.
4. **Cross-check alignment** — For each finding from step 3, check whether the skill contradicts or fails to implement:
   - Principles from `docs/FOUNDATIONS.md` (reference by foundation number, e.g., "Foundation 7: Immutability")
   - Conventions from `CLAUDE.md` (reference by section name)
5. **Classify findings** — Categorize each finding into one of three buckets:
   - **Issue**: Something broken, misleading, or contradictory in the skill
   - **Improvement**: A refinement to existing behavior that would make the skill more effective
   - **Feature**: A new capability that aligns with the skill's stated intent but is currently missing

   When in doubt between Improvement and Feature: *Improvement* refines prose or output structure of an existing instruction. *Feature* adds a new capability path — something the skill couldn't produce before but now can. Structural templates or output-format refinements for existing behaviors are Improvements, not Features. *Example*: adding a new subsection (e.g., "Suggested follow-up") to an existing summary template is an *Improvement* — the summary already existed and is being structurally refined. Adding an entirely new output artifact the skill didn't previously produce would be a *Feature*.
6. **Severity-tag each finding** — CRITICAL (skill produces wrong output or violates guardrails) / HIGH (common path confused or blocked) / MEDIUM (uncommon path confused or suboptimal outcome) / LOW (minor friction or edge-case gap). When a finding could fit two tiers, let actual session impact break the tie: if the skill gap caused improvisation, a misstep, or a user-visible workaround *this session*, escalate to the higher tier.
7. **Present the report** — Output the structured report using the template below.

Scale analysis depth to skill complexity. For small skills (<50 lines, <3 steps), the reflection can be a single paragraph. For large skills (>150 lines, >6 steps), each sub-item in step 3 deserves explicit consideration.

If 2+ findings target the same section heading or share a coherent theme (same failure mode, same user pain point), group them using either (a) a shared lead-in sentence before a flat list (e.g., "Three Step 2 Confidence-handling findings:") or (b) a thematic subsection heading per group (e.g., `### Step 2 Confidence-handling`) — both patterns preserve per-finding traceability. Each finding retains its own bullet, classification, and severity — the lead-in or subsection heading is presentation scaffolding only, not a merger. Single-finding groups stay flat — no lead-in sentence and no subsection heading — to avoid scaffolding inflation when a theme contains only one finding.

## Report Template

Output this structure to the conversation (do not write to a file):

```markdown
# Skill Audit: <skill-name>

**Skill path**: <path>
**Session date**: YYYY-MM-DD
**Session summary**: <1-2 sentence description of what work was done with this skill>
**Session evidence**: <rich / moderate / thin>
(rich = skill executed 2+ times or across multiple scenarios; moderate = single full execution, or single execution with audit-driven edits applied to the target skill; thin = self-audit or first-time observation only. "Audit-driven edits" means edits to the *target skill* produced from this audit's own findings — not downstream use of the target skill's own outputs. For self-audit of skill-audit specifically: thin = skill-audit used zero or one time this session as auditor with no follow-up implementation; moderate = one prior execution as auditor plus follow-up implementation against some target (does NOT require the self-audit itself to have been implemented yet); rich = 2+ auditor executions this session, with or without follow-up implementation.)

## Alignment Check

- **FOUNDATIONS.md**: <aligned / N violations found>
- **CLAUDE.md**: <aligned / N deviations found>
- **Cross-skill check**: <standalone — no partners / checked: <skill-names> — no findings / N issues reported below>
[If violations: bullet list with specific foundation # or CLAUDE.md section + what conflicts]

## Issues

[If none: "No issues identified."]

1. **[SEVERITY]** <title>
   - **What happened**: <session evidence — what went wrong or was confusing>
   - **Skill gap**: <what the skill says or fails to say that caused this>
   - **Suggestion**: <how to fix the skill>

## Improvements

[If none: "No improvements identified."]

1. **[SEVERITY]** <title>
   - **Current behavior**: <what the skill currently says>
   - **Why improve**: <session evidence or reasoning>
   - **Suggestion**: <proposed change>

## Features

[If none: "No features identified."]

1. **[SEVERITY]** <title>
   - **What's missing**: <gap description>
   - **Why it fits**: <how this aligns with the skill's stated intent>
   - **Suggestion**: <proposed addition>

## Not Exercised This Session

[List skill steps that were not exercised during this session. Do not speculate about potential issues — just record for completeness.]

## Summary

**Total**: N issues, N improvements, N features — N CRITICAL, N HIGH, N MEDIUM, N LOW

[If all findings are LOW severity and *this specific skill* was already audited and updated earlier in this session, note: "The skill has converged — further auditing has diminishing returns." Convergence applies per-skill, not per-session — auditing a different skill is always valid even if another skill has converged.]

[If follow-up edits were made to the target skill this session, recommend a reaudit: "`/skill-audit <path>` to verify convergence." Re-audit can be deferred to the next session if the edits were straightforward and the audit-edit cycle has already iterated once this session.]
```

If analysis during classification disproves an initial impression, withdraw the finding inline with a brief explanation rather than omitting it silently — this documents the reasoning for completeness.

## Guardrails

- **Report only** — Never modify the target skill file. Output the report to the conversation only.
- **No false positives** — If a step in the skill wasn't exercised during the session, note "not exercised this session" rather than speculating about potential issues.
- **FOUNDATIONS alignment is mandatory** — Any suggestion that would violate a principle in `docs/FOUNDATIONS.md` must be flagged and rejected, even if it would otherwise be an improvement.
- **Scope discipline** — Do not propose expanding the skill's scope beyond its stated intent. The audit evaluates the skill as written, not what it could become.
- **Session evidence required** — Every Issue and Improvement must cite specific session evidence. For Issues, cite what went wrong. For Improvements, cite where you hesitated, improvised, or made an arbitrary judgment call that the skill could have guided. Findings based purely on hypothetical scenarios belong in Features, not Issues.
- **Follow-up implementation** — After the report is presented, the user may request implementation of specific suggestions. At that point, edit the target skill file directly — the "report only" guardrail applies only to the audit phase, not to user-directed follow-up.
  1. Read the target skill file with the Read tool before starting edits. The Edit tool tracks whether its specific target has been Read this session and will reject edits without one — content visible from the command framework or earlier session context does not satisfy this check.
  2. Process edits top-to-bottom within the file to avoid offset drift. Parallel tool-call batching (multiple Edits in one message) is safe when each Edit's `old_string` is unique across the file — `Edit` uses exact string matching, so offset drift is a non-issue when old_strings cannot collide. Use sequential calls when old_strings could collide (e.g., `replace_all` near a repeated phrase), when one edit's content becomes the next edit's anchor, or when insertions are adjacent enough that they might shift each other's anchor text.
  3. Combine or separate Edit calls using the following decision rules, evaluated in order (first match wins):
     - **Same skill location or coherent paragraph** (including in-place restructuring of a single bullet into nested sub-bullets, or splitting a flat paragraph into lead-in + child items) → combine into one Edit, even if findings are classified differently (e.g., an Issue fix and a Feature addition that form a unified section together).
     - **Different items within the same short numbered list (<10 items)** → combine into one Edit to avoid mid-list offset drift.
     - **Adjacent but independent bullets across separate logical sections** → separate Edits in top-to-bottom order (keeps each finding traceable).
     - **Default (no rule above applies)** → combine if adjacent or overlapping; separate if non-adjacent.
  4. When a finding requires edits across multiple files (e.g., cross-skill consistency fixes), process files independently. Complete all edits and verification for one file before moving to the next. After completing all files, verify cross-file references are consistent (e.g., step numbers referenced in SKILL.md match headings in reference files).
  5. After edits, verify by re-reading. **Default**: grep for a unique phrase from each edit to confirm it landed. **Override** for special cases: if edits are adjacent or overlapping, verify after each edit to catch offset drift; if the cumulative inserted or replaced content across all Edits exceeds ~50 lines, do a full-file re-read instead of targeted greps. Cumulative volume is the threshold — not the file-line distance between the first and last edit. Small, non-adjacent edits scattered across a long file stay on the Default path regardless of distance. **Phrase selection**: pick unique phrases that avoid regex metacharacters (`*`, `?`, `[`, `(`, `|`, `^`, `$`, `.`, `\`) when possible — skill files contain markdown syntax (`**bold**`, inline code, bulleted lists) that collides with BRE/ERE interpretation and forces manual escaping. When a phrase must contain metacharacters, use `grep -F <phrase>` (fixed-string match) to avoid escaping errors.
  6. Watch for numbered list breakage — insertions commonly break numbering, create duplicate headings, or split contiguous lists. When inserting a new top-level section between numbered Steps, the core principle is to avoid renumbering existing numbered steps. Two insertion patterns satisfy this:
     - **Unnumbered descriptive section name** — e.g., adding "## Plan Mode Interaction" between "## Step 1.5" and "## Step 2". Appropriate when the target skill does not already use sub-numbered sections, or when the new section is a cross-cutting concern rather than a step in the primary flow.
     - **Sub-numbered insertion following existing convention** — e.g., adding "## Step 2.5: External Prior-Art Survey" between "## Step 2" and "## Step 3" in a skill that already uses "Step 1.5". Appropriate and often stylistically preferable when the target skill already establishes a sub-numbered pattern, and when the new section belongs in the primary step sequence.
     Pick whichever matches the target skill's established convention. Both patterns avoid renumbering and preserve intra-document references and external links.
  7. If a session interruption occurred between audit report and implementation, re-read the target skill before editing to verify it hasn't been modified by another process.
  8. If the system enforces plan mode, write a brief plan listing edits top-to-bottom, then execute after approval.
  9. The user may run a subsequent `/skill-audit` on the same skill after edits — this is a normal audit-edit-reaudit workflow.
- **Cross-skill consistency** — If the target skill is part of a multi-skill workflow, scan sibling skills for inconsistent file references, terminology, or shared constants. Report cross-skill inconsistencies as Issues. Sibling skills are those in the same explicit workflow — triple patterns (e.g., `*-evaluate`, `*-plan`, `*-implement`), complementary pairs (e.g., audit/consolidate), or any skills that explicitly name each other as workflow partners. **Workflow chains** also count: if the target skill explicitly invokes or recommends a specific downstream skill by name (e.g., a Step 6 menu that says "invoke spec-to-tickets" or "invoke writing-plans", or a "Suggested next step" line naming the next command), those downstream skills are chain neighbors. For chain neighbors, read the downstream skill's input contract (typically its first numbered step or Invocation section — under ~30 lines) and confirm the target's output shape matches what the downstream expects. Skip the read only if the output shape is a well-known convention (e.g., `specs/<NNN>-<name>.md`, `tickets/<PREFIX>-<NNN>.md`) already validated elsewhere in this session. For meta-skills that operate on other skills (like the `skill-*` family), the downstream input is typically a skill directory path — treat this as a well-known convention and skip the downstream read unless the skill explicitly declares a non-standard argument shape. This is input-format compatibility only, not full bilateral consistency, since the relationship is unidirectional. Standalone skills with no workflow partners do not require cross-skill checks — note "standalone skill, no cross-skill check needed" and move on. When auditing skill-audit itself, the cross-skill check applies to skill-consolidate (its complementary pair). For the audit/consolidate pair, verify that skill-consolidate's description of its relationship to skill-audit (in its introduction) accurately reflects skill-audit's current behavior and scope. Self-referential audit is valid but findings should focus on the skill's instructions, not its meta-properties. Skills with `references/` subdirectories were likely created by `skill-extract-references` — the reference files are the primary instruction surface, not SKILL.md.
