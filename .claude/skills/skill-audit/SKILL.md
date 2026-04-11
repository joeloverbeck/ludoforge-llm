---
name: skill-audit
description: Session-aware skill quality audit. Analyzes a skill file against the current session's work to find issues, improvements, and missing features. Cross-checks against FOUNDATIONS.md and CLAUDE.md. Invoke at end of session with the skill path as argument.
---

# Skill Audit

Analyze a skill file against the work done in the current Claude Code session to determine whether the skill has issues, could be improved, or needs new features. Report only — never modify the target skill.

## Invocation

```
/skill-audit <path-to-skill-directory>
```

Example: `/skill-audit .claude/skills/improve-loop`

The argument is the skill directory path. The framework automatically resolves `SKILL.md` within it.

## Checklist

1. **Read the target skill** — The skill content may already be loaded by the command framework (visible above the `ARGUMENTS:` line). If not, read the SKILL.md file at the provided path. Parse its name, description, and full content. If the file does not exist or is not a skill file, stop and report the error. If the skill directory contains a `references/` subdirectory, read all `.md` files in it — these contain the skill's extracted instructions and are the primary audit surface. The SKILL.md may be a thin entry point that delegates to references.
2. **Read alignment documents** — Read `docs/FOUNDATIONS.md` — skip if its contents are already in conversation context (e.g., read directly or returned by a sub-agent earlier in this session). Do not rely on memory or training knowledge as a substitute. `CLAUDE.md` is always available via system context injection and does not need explicit reading.
3. **Session reflection** — Review the current conversation context to identify:
   - Moments where the skill's instructions were unclear or ambiguous
   - Steps that were skipped, reordered, or worked around
   - Behaviors the skill didn't anticipate (edge cases, unexpected inputs)
   - Places where Claude had to improvise because the skill didn't provide guidance
   - Outcomes that diverged from what the skill intended
   - Steps that were not exercised this session (mark as "not exercised" — do not speculate about issues)

   When auditing a skill exercised earlier in this session, session evidence is direct (execution gaps, workarounds, improvisation). When auditing a skill being used for the first time in this session (including self-audit), evidence is observational — focus on: (a) instructions that could be read ambiguously, (b) missing guidance for edge cases visible in the skill text, (c) cross-skill consistency with workflow partners. When identifying findings, note whether the gap is an over-constrained assumption (skill says X but should allow Y) or missing coverage (skill says nothing about Z) — this distinction guides whether the fix is relaxing a constraint vs adding new guidance.
4. **Cross-check alignment** — For each finding from step 3, check whether the skill contradicts or fails to implement:
   - Principles from `docs/FOUNDATIONS.md` (reference by foundation number, e.g., "Foundation 7: Immutability")
   - Conventions from `CLAUDE.md` (reference by section name)
5. **Classify findings** — Categorize each finding into one of three buckets:
   - **Issue**: Something broken, misleading, or contradictory in the skill
   - **Improvement**: A refinement to existing behavior that would make the skill more effective
   - **Feature**: A new capability that aligns with the skill's stated intent but is currently missing
6. **Severity-tag each finding** — CRITICAL / HIGH / MEDIUM / LOW
7. **Present the report** — Output the structured report using the template below.

Scale analysis depth to skill complexity. For small skills (<50 lines, <3 steps), the reflection can be a single paragraph. For large skills (>150 lines, >6 steps), each sub-item in step 3 deserves explicit consideration.

## Report Template

Output this structure to the conversation (do not write to a file):

```markdown
# Skill Audit: <skill-name>

**Skill path**: <path>
**Session date**: YYYY-MM-DD
**Session summary**: <1-2 sentence description of what work was done with this skill>
**Session evidence**: <rich / moderate / thin>
(rich = skill executed 2+ times or across multiple scenarios; moderate = single full execution or partial use; thin = self-audit or first-time observation only)

## Alignment Check

- **FOUNDATIONS.md**: <aligned / N violations found>
- **CLAUDE.md**: <aligned / N deviations found>
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
  1. Read the target skill file before starting edits (required by the Edit tool contract).
  2. Process edits top-to-bottom within the file to avoid offset drift.
  3. Combine adjacent or overlapping suggestions into a single Edit call. Findings that address the same skill location may be combined into a single edit even if classified separately — especially when they form a coherent section or paragraph together (e.g., an Issue fix and a Feature addition to the same section). Use judgment: if the combined edit reads as a unified addition, combine; if the findings are logically independent, keep separate. When findings target adjacent but independent bullets in a list, prefer separate Edit calls in top-to-bottom order — this keeps each finding traceable and avoids offset drift from combining unrelated content.
  4. When a finding requires edits across multiple files (e.g., cross-skill consistency fixes), process files independently. Complete all edits and verification for one file before moving to the next. After completing all files, verify cross-file references are consistent (e.g., step numbers referenced in SKILL.md match headings in reference files).
  5. After edits, verify by re-reading. Use this decision tree:
     - **Adjacent/overlapping edits** → verify after each edit (catch offset drift)
     - **4+ edits touching adjacent sections, numbered lists, or shared structures** → single full-file re-read after all edits
     - **4+ non-adjacent, structurally independent edits** → targeted spot-checks (re-read edited section + 10 lines context)
     - **<4 non-adjacent edits** → batched re-read after all edits
     - **Edits spanning >50 lines** → full-file re-read
  6. Watch for numbered list breakage — insertions commonly break numbering, create duplicate headings, or split contiguous lists.
  7. If a session interruption occurred between audit report and implementation, re-read the target skill before editing to verify it hasn't been modified by another process.
  8. If the system enforces plan mode, write a brief plan listing edits top-to-bottom, then execute after approval.
  9. The user may run a subsequent `/skill-audit` on the same skill after edits — this is a normal audit-edit-reaudit workflow.
- **Cross-skill consistency** — If the target skill is part of a multi-skill workflow, scan sibling skills for inconsistent file references, terminology, or shared constants. Report cross-skill inconsistencies as Issues. Sibling skills are those in the same explicit workflow — triple patterns (e.g., `*-evaluate`, `*-plan`, `*-implement`), complementary pairs (e.g., audit/consolidate), or any skills that explicitly name each other as workflow partners. Standalone skills with no workflow partners do not require cross-skill checks — note "standalone skill, no cross-skill check needed" and move on. When auditing skill-audit itself, the cross-skill check applies to skill-consolidate (its complementary pair). For the audit/consolidate pair, verify that skill-consolidate's description of its relationship to skill-audit (in its introduction) accurately reflects skill-audit's current behavior and scope. Self-referential audit is valid but findings should focus on the skill's instructions, not its meta-properties. Skills with `references/` subdirectories were likely created by `skill-extract-references` — the reference files are the primary instruction surface, not SKILL.md.
