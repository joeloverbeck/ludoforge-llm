# Learning Audit Skill Design

**Date**: 2026-03-29
**Status**: Approved

## Context

After completing tickets or complex tasks, valuable lessons often emerge — conventions that should be documented, workflows that should be standardized, or skills that need updating. Currently there is no systematic process for evaluating these learnings. The brainstorming document (`brainstorming/skill-modification-creation.md`) provides a clear 5-bucket decision framework, but it needs to be encoded as a skill so it's consistently applied.

## Skill Identity

- **Name**: `learning-audit`
- **Location**: `~/.claude/skills/learning-audit/SKILL.md`
- **Invocation**: Manual only (`/learning-audit`)
- **User-invocable**: yes
- **Description**: "Post-implementation learning audit. Use when a ticket or complex task has been completed and you need to evaluate whether the work revealed reusable lessons that warrant updating project guidance, modifying existing skills, or creating new skills."

## The 5 Buckets

1. **DO NOTHING** — one-off, unusual, or too unstable to standardize
2. **UPDATE PROJECT GUIDANCE** — repo-wide rule, convention, constraint (targets: CLAUDE.md, AGENTS.md, .claude/rules/*.md, memory files)
3. **MODIFY EXISTING SKILL** — existing skill's territory but missed steps, vague boundaries, or insufficient criteria
4. **CREATE NEW SKILL** — new repeatable one-job workflow with stable triggers, inputs, outputs, and checks
5. **ADD TOOL/SCRIPT/MCP** — workflow depends on deterministic execution or live external context

## Workflow

### Phase 1: Extract Lessons

Review the session's work and collect each distinct lesson:
- What was implemented, what difficulties arose, what corrections were needed
- What patterns emerged, what required repeated steering
- Each lesson noted with: what happened, why it was non-obvious, whether it recurred

### Phase 2: Route via Decision Tree

Each lesson runs through the 5-question litmus test:

```
Lesson identified
  |-- Q1: Will this come up again?
  |   |-- No -> DO NOTHING
  |   |-- Yes v
  |-- Q2: Did the agent need the same steering/corrections repeatedly?
  |   |-- No -> weaker signal (may still proceed)
  |   |-- Yes -> strong signal v
  |-- Q3: Is this one job with sharp boundaries?
  |   |-- No, standing rule/convention -> UPDATE PROJECT GUIDANCE
  |   |-- No, too broad -> DO NOTHING (premature)
  |   |-- Yes v
  |-- Q4: Can you state exactly when it should/shouldn't trigger?
  |   |-- No -> DO NOTHING (not stable enough)
  |   |-- Yes v
  |-- Q5: Can you define inputs, outputs, and checkable done?
  |   |-- No -> DO NOTHING (premature)
  |   |-- Yes v
  |-- Does it match an existing skill's territory?
  |   |-- Yes -> MODIFY EXISTING SKILL
  |   |-- No v
  |-- Does it depend on live/external systems or deterministic execution?
      |-- Yes -> ADD TOOL/SCRIPT/MCP
      |-- No -> CREATE NEW SKILL
```

### Phase 3: Present Report

Structured output per lesson: title, description, bucket, rationale, and (where applicable) recommended target, proposed change, or proposed skill name/trigger.

Summary counts by bucket.

## Anti-Bloat Safeguards

1. **Default to DO NOTHING**: Any failed litmus question routes to DO NOTHING
2. **Prefer PROJECT GUIDANCE over skills**: Standing rules belong in CLAUDE.md/AGENTS.md, not skills
3. **Rationalization table**: Explicit counters for "let's make a skill" impulses
4. **One lesson = one bucket**: No grab bags; each lesson evaluated independently

## Output Format

```
## Learning Audit Report

### Lessons Extracted: N

#### Lesson 1: [title]
- **What happened**: [description]
- **Bucket**: [bucket name]
- **Rationale**: [why this bucket]
- **Recommended target**: [file/skill] (if applicable)
- **Proposed change**: [specifics] (if applicable)

### Summary
- DO NOTHING: N
- UPDATE PROJECT GUIDANCE: N
- MODIFY EXISTING SKILL: N
- CREATE NEW SKILL: N
- ADD TOOL/SCRIPT/MCP: N
```

## Guidance Targets

For UPDATE PROJECT GUIDANCE, the skill considers:
- `CLAUDE.md` — Claude Code project instructions
- `AGENTS.md` — Codex/other agent instructions
- `.claude/rules/*.md` — Claude Code rule files
- `~/.claude/projects/*/memory/` — Auto-memory files
