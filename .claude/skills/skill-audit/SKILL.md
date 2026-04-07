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

1. **Read the target skill** — The skill content may already be loaded by the command framework (visible above the `ARGUMENTS:` line). If not, read the SKILL.md file at the provided path. Parse its name, description, and full content. If the file does not exist or is not a skill file, stop and report the error.
2. **Read alignment documents** — Read `docs/FOUNDATIONS.md` — skip if it was read via the Read tool earlier in this session. Do not rely on memory or training knowledge as a substitute. `CLAUDE.md` is always available via system context injection and does not need explicit reading.
3. **Session reflection** — Review the current conversation context to identify:
   - Moments where the skill's instructions were unclear or ambiguous
   - Steps that were skipped, reordered, or worked around
   - Behaviors the skill didn't anticipate (edge cases, unexpected inputs)
   - Places where Claude had to improvise because the skill didn't provide guidance
   - Outcomes that diverged from what the skill intended
   - Steps that were not exercised this session (mark as "not exercised" — do not speculate about issues)
4. **Cross-check alignment** — For each finding from step 3, check whether the skill contradicts or fails to implement:
   - Principles from `docs/FOUNDATIONS.md` (reference by foundation number, e.g., "Foundation 7: Immutability")
   - Conventions from `CLAUDE.md` (reference by section name)
5. **Classify findings** — Categorize each finding into one of three buckets:
   - **Issue**: Something broken, misleading, or contradictory in the skill
   - **Improvement**: A refinement to existing behavior that would make the skill more effective
   - **Feature**: A new capability that aligns with the skill's stated intent but is currently missing
6. **Severity-tag each finding** — CRITICAL / HIGH / MEDIUM / LOW
7. **Present the report** — Output the structured report using the template below.

## Report Template

Output this structure to the conversation (do not write to a file):

```markdown
# Skill Audit: <skill-name>

**Skill path**: <path>
**Session date**: YYYY-MM-DD
**Session summary**: <1-2 sentence description of what work was done with this skill>

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

[If follow-up edits were made to the target skill this session, recommend a reaudit: "`/skill-audit <path>` to verify convergence."]
```

## Guardrails

- **Report only** — Never modify the target skill file. Output the report to the conversation only.
- **No false positives** — If a step in the skill wasn't exercised during the session, note "not exercised this session" rather than speculating about potential issues.
- **FOUNDATIONS alignment is mandatory** — Any suggestion that would violate a principle in `docs/FOUNDATIONS.md` must be flagged and rejected, even if it would otherwise be an improvement.
- **Scope discipline** — Do not propose expanding the skill's scope beyond its stated intent. The audit evaluates the skill as written, not what it could become.
- **Session evidence required** — Every Issue and Improvement must cite specific session evidence. For Issues, cite what went wrong. For Improvements, cite where you hesitated, improvised, or made an arbitrary judgment call that the skill could have guided. Findings based purely on hypothetical scenarios belong in Features, not Issues.
- **Follow-up implementation** — After the report is presented, the user may request implementation of specific suggestions. At that point, edit the target skill file directly — the "report only" guardrail applies only to the audit phase, not to user-directed follow-up. When implementing multiple suggestions, process edits top-to-bottom within the file to avoid offset drift. When two suggestions target adjacent or overlapping text, combine them into a single Edit call. After making follow-up edits, always re-read at minimum each edited section plus 10 lines of surrounding context to verify edits don't conflict with each other or with unchanged skill content. A full-file re-read is required when edits touch adjacent sections or shared structures that span more than 30 lines; for shorter spans, reading the full affected structure (e.g., the entire numbered list containing both edits) suffices. Pay particular attention to numbered lists and sequential structures — insertions commonly break numbering, create duplicate headings, or split contiguous lists with stray text. The user may run a subsequent `/skill-audit` on the same skill after edits to validate the changes — this is a normal audit-edit-reaudit workflow.
- **Cross-skill consistency** — If the target skill is part of a multi-skill workflow, scan sibling skills for inconsistent file references, terminology, or shared constants. Report cross-skill inconsistencies as Issues. Sibling skills are those in the same explicit workflow — triple patterns (e.g., `*-evaluate`, `*-plan`, `*-implement`), complementary pairs (e.g., audit/consolidate), or any skills that explicitly name each other as workflow partners. Standalone skills with no workflow partners do not require cross-skill checks — note "standalone skill, no cross-skill check needed" and move on. When auditing skill-audit itself, the cross-skill check applies to skill-consolidate (its complementary pair). Self-referential audit is valid but findings should focus on the skill's instructions, not its meta-properties.
