# Upstream Sync Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `/upstream-sync` skill that researches top forks of `karpathy/autoresearch`, triages findings, and applies approved changes to the improve-loop skill and iterative-improvement-logic report.

**Architecture:** Single SKILL.md file following existing skill conventions (frontmatter + linear step process). Uses `gh` CLI for GitHub API access. Produces dated triage reports. Offers interactive apply phase after user approval.

**Tech Stack:** Markdown (skill file), `gh` CLI (GitHub API), shell commands

---

### Task 1: Create the skill directory and SKILL.md

**Files:**
- Create: `.claude/skills/upstream-sync/SKILL.md`

**Step 1: Verify the parent directory exists**

Run: `ls .claude/skills/`
Expected: Lists existing skill directories (improve-loop, reassess-agent-dsl-cookbook, etc.)

**Step 2: Create the skill file**

Write `.claude/skills/upstream-sync/SKILL.md` with the complete skill content below.

The file structure follows the same conventions as `.claude/skills/reassess-agent-dsl-cookbook/SKILL.md`:
- YAML frontmatter with `name` and `description`
- Title and summary paragraph
- Invocation section
- Prerequisites section
- Linear step-by-step process
- Report template
- Important rules

Here is the complete content for the file:

````markdown
---
name: upstream-sync
description: Research top forks of karpathy/autoresearch, triage findings as bug fixes / improvements / new features, and apply approved changes to the improve-loop skill and iterative-improvement-logic report.
---

# Upstream Sync

Periodically research the most active forks of `karpathy/autoresearch` to discover bug fixes, improvements, and new features that can be backported to our improve-loop skill and its conceptual extraction. Our version has diverged significantly (UCB1, MAD confidence, Goodhart defenses, tiered mutability, lesson stores, etc.), so analysis operates at the conceptual level — extracting the idea behind each fork change, not comparing code line-by-line.

## Invocation

```
/upstream-sync
```

No arguments. The upstream repo, target files, and report location are hardcoded.

## Constants

| Constant | Value |
|----------|-------|
| Upstream repo | `karpathy/autoresearch` |
| Target: process changes | `.claude/skills/improve-loop/SKILL.md` |
| Target: conceptual changes | `reports/iterative-improvement-logic.md` |
| Report output | `reports/upstream-sync-YYYY-MM-DD.md` |
| Max forks to analyze | 15 |

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status` should succeed)
- Internet access for GitHub API calls

## Process

Follow these steps in order. Do not skip any step.

### Step 1: DISCOVER — Find and Rank Forks

1. **List forks** using the GitHub API:
   ```bash
   gh api repos/karpathy/autoresearch/forks --paginate --jq '.[] | {full_name, stargazers_count, pushed_at, default_branch}' 2>/dev/null
   ```
   If the repo has many forks, paginate to get all of them.

2. **For each fork**, fetch how many commits it is ahead of upstream:
   ```bash
   gh api repos/karpathy/autoresearch/compare/main...<fork-owner>:<fork-default-branch> --jq '.ahead_by' 2>/dev/null
   ```
   If the compare API fails (e.g., diverged too far), fall back to checking the fork's commit count and last push date as proxies.

3. **Score each fork** using the composite formula:
   ```
   recency_days = days since last push
   recency_score = max(0, 1.0 - recency_days / 365)
   score = stars * 0.3 + commits_ahead * 0.4 + recency_score * 0.3
   ```

4. **Filter**: Remove forks with 0 commits ahead (exact mirrors with no changes).

5. **Rank**: Sort by composite score descending. Take the top 15.

6. **Baseline tracking**: Read any existing `reports/upstream-sync-*.md` files (glob for them). Extract the fork URLs listed under `## Findings` sections. For each top-15 fork that appeared in the most recent prior report:
   - If the fork's `pushed_at` is unchanged since that report's date, mark it as "no new changes" and skip detailed analysis (but still list it in the report's `## Previously Reviewed` section).
   - If the fork has new pushes since the last report, analyze it fully.

7. **Deduplication**: If multiple forks contain identical changes (same diff against upstream — common when forks track a shared PR), group them. Credit the fork with the most stars. List the others as aliases.

Present the ranked fork list to the user before proceeding to analysis. Format:
```
## Fork Discovery Results
| Rank | Fork | Stars | Ahead | Last Push | Score | Status |
|------|------|-------|-------|-----------|-------|--------|
| 1 | user/autoresearch | 12 | 45 | 2d ago | 19.8 | NEW |
| 2 | user2/autoresearch | 5 | 30 | 1w ago | 13.5 | UPDATED |
| 3 | user3/autoresearch | 8 | 15 | 3mo ago | 7.1 | UNCHANGED |
```

### Step 2: ANALYZE — Extract Conceptual Changes

For each fork marked NEW or UPDATED:

1. **Fetch the diff** against upstream:
   ```bash
   gh api repos/karpathy/autoresearch/compare/main...<fork-owner>:<fork-default-branch> --jq '.commits[].commit.message' 2>/dev/null
   ```
   Also fetch the file-level diff summary:
   ```bash
   gh api repos/karpathy/autoresearch/compare/main...<fork-owner>:<fork-default-branch> --jq '.files[] | {filename, status, additions, deletions, patch}' 2>/dev/null
   ```
   For forks with many commits, focus on the most impactful files (highest additions + deletions).

2. **Read commit messages** to understand the intent of each change.

3. **Extract conceptual changes**: For each meaningful change, write a 1-2 sentence summary of the IDEA, not the code. Examples:
   - "Added exponential backoff to retry logic when harness crashes"
   - "Replaced fixed plateau threshold with adaptive window based on recent accept rate"
   - "Added support for multi-objective Pareto front tracking"

4. **Map to improve-loop domains**: Tag each concept with the relevant area of our skill:
   - `core-loop` — the main iteration cycle
   - `accept-reject` — decision logic, noise handling, MAD
   - `strategies` — plateau detection, combine, ablation, radical, backtrack
   - `lessons` — lesson store, curation, decay, global promotion
   - `meta-review` — self-improving program.md
   - `harness` — evaluation execution, early abort, multi-run
   - `goodhart` — suspicion gates, regression checks, multi-seed
   - `infrastructure` — worktree management, git operations, file handling
   - `reporting` — musings, results.tsv, checkpoints
   - `other` — doesn't map to any existing domain (potential new feature)

### Step 3: TRIAGE — Classify and Assess

For each conceptual change from Step 2:

1. **Classify** into one of three categories:
   - **Bug fix**: Corrects incorrect behavior in the original pattern
   - **Improvement**: Enhances an existing capability we already have
   - **New feature**: Adds a capability we don't currently have

2. **Assess relevance** to our enhanced version:
   - **Directly applicable**: Maps cleanly to our version. Can be adopted with minimal adaptation.
   - **Conceptually applicable**: The idea applies but our implementation differs significantly. Needs creative adaptation to our enhanced architecture.
   - **Not applicable**: Doesn't apply to us (e.g., Python-specific fix, or we already have a strictly better version of this).

3. **Check our current status**: Does our version already handle this? If so, how? Is our approach better, equivalent, or worse?

4. **Recommend**:
   - **Adopt**: Directly applicable and we should integrate this.
   - **Adapt**: Conceptually applicable — describe how the idea would map to our version.
   - **Skip**: Not applicable or we already have a better solution. State why.

### Step 4: REPORT — Write Triage Report

Write the report to `reports/upstream-sync-YYYY-MM-DD.md` using today's date.

**Report template:**

```markdown
# Upstream Sync Report — YYYY-MM-DD

## Summary
- **Upstream**: karpathy/autoresearch
- **Forks analyzed**: N (of M total forks)
- **Findings**: X bug fixes, Y improvements, Z new features
- **Directly applicable**: N findings
- **Conceptually applicable**: N findings
- **Last sync**: <date of most recent prior report, or "first run">

## Findings

### Bug Fixes

#### [BF-1] <title>
- **Source**: <fork full_name> (by <author>, <stars> stars, <commits_ahead> ahead)
- **Domain**: <improve-loop domain tag>
- **Concept**: <1-2 sentence description of the idea>
- **Relevance**: Directly applicable / Conceptually applicable / Not applicable
- **Our status**: <how we currently handle this, or "not handled">
- **Recommendation**: Adopt / Adapt / Skip
- **Details**: <1-2 paragraphs explaining the change, its rationale, and how it maps to our version>
- **Target file(s)**: <which of our files would change if adopted>

(repeat for each bug fix)

### Improvements

#### [IMP-1] <title>
(same fields as above)

### New Features

#### [NF-1] <title>
(same fields as above)

## Previously Reviewed (no new changes since last sync)
- <fork full_name> — last analyzed YYYY-MM-DD

## Skipped Forks
- <fork full_name> — 0 commits ahead (exact mirror)
- <fork full_name> — below score threshold (score: X.X)
```

### Step 5: APPLY — Present Findings and Edit Target Files

After writing the report:

1. **Present findings** to the user grouped by recommendation:
   - First: all "Adopt" recommendations
   - Then: all "Adapt" recommendations
   - Finally: "Skip" recommendations (brief summary only)

2. **Ask the user** which findings to apply. Use a multi-select question listing all Adopt and Adapt findings by their ID and title.

3. **For each approved finding**, edit the appropriate target file(s):
   - Process/structural changes (new steps, modified logic, new config keys) → `.claude/skills/improve-loop/SKILL.md`
   - Conceptual/theoretical changes (new principles, revised abstractions) → `reports/iterative-improvement-logic.md`
   - Some findings may require changes to both files

4. **After all edits**, present a summary of changes made and offer to commit:
   ```bash
   git add .claude/skills/improve-loop/SKILL.md reports/iterative-improvement-logic.md reports/upstream-sync-YYYY-MM-DD.md
   git commit -m "upstream-sync: apply N findings from autoresearch forks (YYYY-MM-DD)"
   ```

## Important Rules

- **Never modify harness.sh or engine source** — this skill only edits skill files and reports.
- **Conceptual mapping, not code copying** — our version is heavily enhanced. Extract ideas, don't paste fork code.
- **Respect existing architecture** — changes to the improve-loop skill must be consistent with its existing patterns (UCB1, MAD, tiered mutability, lesson stores, etc.).
- **One report per run** — each invocation produces exactly one dated report file.
- **User approval required before edits** — never edit target files without explicit approval of specific findings.
- **Preserve prior report history** — never overwrite or delete previous upstream-sync reports.
- **gh CLI only** — use `gh api` for all GitHub API calls. Do not use raw curl or web scraping.
- **Handle API failures gracefully** — if a fork's compare API fails, log it and move on. Do not abort the entire run.
````

**Step 3: Verify the file was created correctly**

Run: `ls .claude/skills/upstream-sync/`
Expected: `SKILL.md`

Run: `head -3 .claude/skills/upstream-sync/SKILL.md`
Expected: YAML frontmatter starting with `---`

**Step 4: Commit**

```bash
git add .claude/skills/upstream-sync/SKILL.md
git commit -m "feat: add /upstream-sync skill for autoresearch fork research"
```

---

### Task 2: Verify skill is discoverable

**Step 1: Check skill appears in the skills list**

The skill should appear in Claude Code's available skills because it follows the `.claude/skills/<name>/SKILL.md` convention.

**Step 2: Smoke-test the `gh` API call**

Run: `gh api repos/karpathy/autoresearch/forks --jq '.[0].full_name' 2>/dev/null`
Expected: A fork name like `someuser/autoresearch`

Run: `gh auth status`
Expected: Logged in status

**Step 3: Commit the design doc alongside**

```bash
git add docs/plans/2026-04-06-upstream-sync-design.md docs/plans/2026-04-06-upstream-sync-plan.md
git commit -m "docs: add upstream-sync skill design and implementation plan"
```

---

### Task 3: Clean up stale report file

**Files:**
- Delete: `reports/improve-loop-skill-from-worldwake.md` (user confirmed this is stale)

**Step 1: Remove the file**

```bash
git rm reports/improve-loop-skill-from-worldwake.md
git commit -m "chore: remove stale improve-loop-skill-from-worldwake.md"
```
