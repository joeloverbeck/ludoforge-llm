---
name: skill-audit
description: Audit a skill against the current Codex session to identify issues, improvements, and missing features. Use when the user wants a report on how well a skill supported the work that actually happened, without editing the target skill during the audit.
---

# Skill Audit

Use this skill to evaluate a target skill against the work done in the current Codex session. Report only during the audit phase. Do not modify the target skill unless the user later asks for follow-up edits.

## Required Inputs

- A path to the target skill directory or its `SKILL.md`

## Workflow

1. Read the target skill. If the input is a directory, resolve `SKILL.md` inside it. If the target does not exist or is not a valid skill file, stop and report the error.
2. Read `docs/FOUNDATIONS.md` if it has not already been read in the current task.
3. Read `AGENTS.md` for repository conventions if it has not already been read in the current task.
4. Reflect on the current session and identify:
   - moments where the skill's instructions were unclear or ambiguous
   - steps that were skipped, reordered, or worked around
   - cases the skill did not anticipate
   - places where Codex had to improvise because the skill lacked guidance
   - outcomes that diverged from the skill's stated intent
   - steps not exercised in this session
   - if the target skill was modified earlier in the same session, whether each finding applies to the pre-edit version, the current version, or both
   - if the same target was already audited earlier in the same session, which findings are newly resolved, which remain, and which are new
5. Cross-check each finding against:
   - `docs/FOUNDATIONS.md`
   - `AGENTS.md`
   - nearby sibling skills if the target participates in a multi-skill workflow and consistency matters
6. Classify each finding:
   - `Issue`: broken, misleading, contradictory, or missing guidance that caused a real problem
   - `Improvement`: a refinement that would make the skill more effective
   - `Feature`: a new capability that fits the skill's stated intent but is not present
7. Assign severity to each finding:
   - `CRITICAL`
   - `HIGH`
   - `MEDIUM`
   - `LOW`
8. Present the report in the template below.

## Report Template

Output the audit in the conversation, not in a file.

```markdown
# Skill Audit: <skill-name>

**Skill path**: <path>
**Session date**: YYYY-MM-DD
**Session summary**: <1-2 sentences on how the skill was used in this session>

## Alignment Check

- **FOUNDATIONS.md**: <aligned / N violations found>
- **AGENTS.md**: <aligned / N deviations found>
[If violations exist, list the specific foundation number or AGENTS.md rule and the conflict]

## Issues

[If none: "No issues identified."]

1. **[SEVERITY]** <title>
   - **What happened**: <session evidence>
   - **Applies to**: <pre-edit / current / both> [optional when the target changed earlier in the same session]
   - **Evidence**: <brief session moment reference> [optional]
   - **Skill gap**: <what the skill says or fails to say>
   - **Suggestion**: <how to fix the skill>

## Improvements

[If none: "No improvements identified."]

1. **[SEVERITY]** <title>
   - **Current behavior**: <what the skill currently says>
   - **Applies to**: <pre-edit / current / both> [optional when the target changed earlier in the same session]
   - **Evidence**: <brief session moment reference> [optional]
   - **Why improve**: <session evidence or reasoning>
   - **Suggestion**: <proposed change>

## Features

[If none: "No features identified."]

1. **[SEVERITY]** <title>
   - **What's missing**: <gap description>
   - **Evidence**: <brief session moment reference> [optional]
   - **Why it fits**: <why this matches the skill's intent>
   - **Suggestion**: <proposed addition>

## Not Exercised

[Optional. Use only when specific parts of the target skill were not exercised in this session.]

- <step or area> — not exercised this session

## Summary

**Total**: N issues, N improvements, N features — N CRITICAL, N HIGH, N MEDIUM, N LOW

[If the skill was already updated and only low-severity findings remain, note that further auditing may have diminishing returns.]
```

## Guardrails

- Report only during the audit. Do not edit the target skill unless the user later asks for changes.
- Do not invent findings for steps that were not exercised. Mark them as `not exercised this session`.
- Any suggestion that conflicts with `docs/FOUNDATIONS.md` must be rejected and called out explicitly.
- Stay within the target skill's stated scope. Do not expand the audit into a redesign of a different skill.
- Every `Issue` and `Improvement` must be grounded in actual session evidence. Pure hypotheticals belong in `Features` or should be omitted.
- If the target skill is part of a multi-skill workflow, report terminology or reference drift across sibling skills as issues when it affects correctness or usability.
- When re-auditing the same target within one session, prefer delta-oriented findings: note what was fixed since the last audit before repeating older items that still remain.

## Codex Adaptation Notes

- Do not assume slash-command invocation or Claude-specific argument plumbing.
- Use the current Codex conversation and tool history as the session evidence source.
- Use `AGENTS.md` rather than `CLAUDE.md` for repository-specific behavior.

## Example Prompts

- `Use $skill-audit to review .codex/skills/implement-ticket`
- `Audit .claude/skills/spec-to-tickets and report only`
- `Review .codex/skills/skill-audit against this session and identify issues, improvements, and features`
