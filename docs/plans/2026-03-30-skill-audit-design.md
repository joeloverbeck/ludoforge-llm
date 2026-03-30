# Skill Audit Skill — Design

**Date**: 2026-03-30

## Context

At the end of Claude Code sessions, we routinely analyze skills that were used during the session to check for issues, improvements, and missing features. This manual process is always the same: read the skill, reflect on the session work, cross-check against FOUNDATIONS.md, and report findings. Formalizing it into a skill eliminates the need to re-explain the process each time.

## Design

### Identity

- **Name**: `skill-audit`
- **Location**: `.claude/skills/skill-audit/SKILL.md`
- **Invocation**: `/skill-audit <path-to-skill-SKILL.md>`
- **Output**: Report only — never modifies the target skill file.

### Checklist

1. **Read the target skill** — Read the SKILL.md file at the provided path. Parse its name, description, and full content.
2. **Read alignment documents** — Read `docs/FOUNDATIONS.md` and the project-level `CLAUDE.md` to establish the quality bar.
3. **Session reflection** — Review the current conversation context to identify:
   - Moments where the skill's instructions were unclear or ambiguous
   - Steps that were skipped, reordered, or worked around
   - Behaviors the skill didn't anticipate (edge cases, unexpected inputs)
   - Places where Claude had to improvise because the skill didn't provide guidance
   - Outcomes that diverged from what the skill intended
4. **Cross-check alignment** — For each finding from step 3, check whether the skill contradicts or fails to implement principles from FOUNDATIONS.md or conventions from CLAUDE.md.
5. **Classify findings** — Categorize each finding into:
   - **Issue**: Something broken, misleading, or contradictory
   - **Improvement**: A refinement to existing behavior
   - **Feature**: A new capability aligned with the skill's intent
6. **Severity-tag each finding** — CRITICAL / HIGH / MEDIUM / LOW
7. **Present the report** — Output the structured report (see template below).

### Report Template

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
   - **What happened**: <session evidence>
   - **Skill gap**: <what the skill says or fails to say>
   - **Suggestion**: <how to fix>

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
```

### Guardrails

- **Report only** — Never modifies the target skill file.
- **No false positives** — If a step wasn't exercised during the session, note "not exercised this session" rather than speculating.
- **FOUNDATIONS alignment is mandatory** — Suggestions that would violate FOUNDATIONS.md are flagged and rejected.
- **Scope discipline** — Does not propose expanding the skill's scope beyond its stated intent.

## Implementation

Single deliverable: create `.claude/skills/skill-audit/SKILL.md` containing the skill definition with frontmatter, checklist, report template, and guardrails.

## Verification

1. Invoke `/skill-audit .claude/skills/train-operation-ui-evaluate/SKILL.md` in a session where that skill was used
2. Confirm the report is produced, covers all three categories, and does not modify the target file
3. Confirm FOUNDATIONS.md and CLAUDE.md are read and cross-checked
