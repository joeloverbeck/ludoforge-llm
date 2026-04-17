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
2. Read `docs/FOUNDATIONS.md` if it has not already been read earlier in the same audit turn, or if earlier reads came from a different task slice and may no longer be reliable context.
3. Read `AGENTS.md` for repository conventions if it has not already been read earlier in the same audit turn, or if earlier reads came from a different task slice and may no longer be reliable context.
4. Reflect on the current session and identify:
   - which concrete task window, target interaction, or skill-use slice in the current session is being audited when multiple tasks or skills appear in the same conversation
   - moments where the skill's instructions were unclear or ambiguous
   - steps that were skipped, reordered, or worked around
   - cases the skill did not anticipate
   - places where Codex had to improvise because the skill lacked guidance
   - outcomes that diverged from the skill's stated intent
   - steps not exercised in this session
   - if the target skill was modified earlier in the same session, whether each finding applies to the pre-edit version, the current version, or both
   - if the same target was already audited earlier in the same session, which findings are newly resolved, which remain, and which are new
   - for same-session re-audits, explicitly map prior findings into `resolved`, `still open`, or `new` before drafting the report
   - when auditing `skill-audit` itself, keep the evidence scoped to the actual audit/report interactions in the current session and avoid inventing broader meta-findings that were not exercised
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
**Audit scope**: <optional specific turn window / interaction slice when helpful>

[Optional for same-target re-audits] **Delta from earlier audit**:
- `resolved`: <brief prior findings now fixed>
- `still open`: <brief prior findings still applicable>
- `new`: <brief newly discovered findings>

## Alignment Check

- **FOUNDATIONS.md**: <aligned / N violations found>
- **AGENTS.md**: <aligned / N deviations found>
[If violations exist, list the specific foundation number or AGENTS.md rule and the conflict]
[Optional when helpful] **What worked well**: <1 short line on where the skill guided the session effectively>
[Optional for `skill-audit` self-audits] **Self-audit rubric**:
- `target resolution`: <pass / minor drift / material drift>
- `scope selection`: <pass / minor drift / material drift>
- `report structure`: <pass / minor drift / material drift>
- `severity calibration`: <pass / minor drift / material drift>
- `handoff clarity`: <pass / minor drift / material drift>

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
[Optional] **Recommended next actions**: <top 1-2 follow-ups when the audit clearly points to concrete next steps>
```

## Guardrails

- Report only during the audit. Do not edit the target skill unless the user later asks for changes.
- If the user later asks to implement the audit recommendations, treat that as a new task: reopen the target skill, use the audit findings as implementation input, and switch out of report-only behavior for that follow-up turn.
- Later follow-up implementation turns may be used as evidence in a subsequent audit of the workflow, but the original audit should still be evaluated based on what happened during its own report-only phase.
- Do not invent findings for steps that were not exercised. Mark them as `not exercised this session`.
- Any suggestion that conflicts with `docs/FOUNDATIONS.md` must be rejected and called out explicitly.
- Stay within the target skill's stated scope. Do not expand the audit into a redesign of a different skill.
- Every `Issue` and `Improvement` must be grounded in actual session evidence. Pure hypotheticals belong in `Features` or should be omitted.
- Do not record a finding unless the session evidence shows the skill text itself was insufficient, misleading, or missing guidance. A one-off failure to follow the skill is not, by itself, evidence of a skill defect.
- If the target skill is part of a multi-skill workflow, report terminology or reference drift across sibling skills as issues when it affects correctness or usability.
- When re-auditing the same target within one session, prefer delta-oriented findings: note what was fixed since the last audit before repeating older items that still remain.
- Do not treat a re-audit as a blank-slate audit when prior findings exist in the same session; explicitly classify each prior finding as `resolved`, `still open`, or `new`.

## Re-audit Checklist

Use this only when the same target skill was already audited earlier in the current session.

If the current audit targets a different skill than any earlier audit in this session, treat it as a normal first-pass audit for that target; do not force prior-finding mapping across different skills.

1. Identify the earlier audit and whether the skill changed afterward.
2. List the earlier findings briefly.
3. Classify each earlier finding as `resolved`, `still open`, or `new context changed the assessment`.
   - Report this mapping at the start of the audit, either as a short delta block immediately before `## Issues` or as the first lines inside `## Summary` when that is more concise.
4. Report only the remaining open findings plus any genuinely new findings from the current session.
5. Avoid repeating unchanged narrative when a short delta statement is sufficient.

## Codex Adaptation Notes

- Do not assume slash-command invocation or Claude-specific argument plumbing.
- Use the current Codex conversation and tool history as the session evidence source.
- Use `AGENTS.md` rather than `CLAUDE.md` for repository-specific behavior.
- When auditing `skill-audit` itself, evidence should come from the actual audit interaction in the current session: target-skill read/validation, audit-scope selection, report structure/template usage, severity calibration, and whether the resulting recommendations were concrete enough for the next user turn to act on.
- For first-pass self-audits where no earlier audit of `skill-audit` exists in the same session, skip re-audit delta analysis and evaluate only the current audit interaction evidence plus the report you are producing now.
- For `skill-audit` self-audits, explicitly sanity-check this evidence set before drafting findings:
  - `target resolution`: did the audit validate and open the intended target skill cleanly?
  - `scope selection`: did the audit clearly name the session slice being evaluated?
  - `report structure`: did the audit follow the stated template and classification scheme?
  - `severity calibration`: were severities proportionate to the actual session evidence?
  - `handoff clarity`: were the resulting recommendations concrete enough for a follow-up implementation turn?
- For `skill-audit` self-audits, report those five dimensions explicitly in the final audit under `Alignment Check` using the optional `Self-audit rubric` block. Do not leave the rubric implicit.
- For self-audits, compare the immediately previous audit output against the report template before drafting findings. Explicitly check whether the required headings, summary fields, per-finding structure, and total-count summary were present.
- Use this optional self-audit rubric when deciding whether each evidence dimension passed:
  - `pass`: the audit satisfied the requirement cleanly
  - `minor drift`: the audit was usable but omitted structure or precision the skill asked for
  - `material drift`: the audit missed enough of the requirement that findings or handoff quality were meaningfully weakened
- For first-pass self-audits of `skill-audit`, use this mini-checklist before drafting findings:
  - confirm the target resolves to `.codex/skills/skill-audit/SKILL.md` or the equivalent requested path
  - identify the exact audit/report interaction slice being evaluated in the current session
  - confirm that this is a first-pass self-audit rather than a same-target re-audit
  - if it is first-pass, skip delta analysis and assess evidence use, structure, severity calibration, and handoff clarity directly

## Example Prompts

- `Use $skill-audit to review .codex/skills/implement-ticket`
- `Audit .claude/skills/spec-to-tickets and report only`
- `Review .codex/skills/skill-audit against this session and identify issues, improvements, and features`

## Self-Audit Example

```markdown
# Skill Audit: skill-audit

**Skill path**: .codex/skills/skill-audit/SKILL.md
**Session date**: 2026-04-13
**Session summary**: The skill was used to audit another skill and then to perform this self-audit.
**Audit scope**: The audit/report interactions in this session only.

## Alignment Check

- **FOUNDATIONS.md**: aligned
- **AGENTS.md**: aligned
- **What worked well**: The report stayed scoped to actual audit behavior rather than generic meta-commentary.
```
