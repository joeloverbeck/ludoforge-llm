# Design: `/upstream-sync` Skill

## Problem

The improve-loop skill and its conceptual extraction (iterative-improvement-logic.md) derive from karpathy/autoresearch but have diverged significantly. Periodically researching top forks for backportable fixes, improvements, and new features is a manual, ad-hoc process that should be a repeatable skill.

## Design

### Skill: `/upstream-sync`

Single-file skill at `.claude/skills/upstream-sync/SKILL.md`. No arguments. Hardcoded upstream: `karpathy/autoresearch`. Hardcoded targets: `.claude/skills/improve-loop/SKILL.md` and `reports/iterative-improvement-logic.md`.

### Pipeline (5 steps)

**1. DISCOVER** — Rank forks by composite score (stars 0.3, commits_ahead 0.4, recency 0.3). Top 15. Filter mirrors. Deduplicate identical changes. Skip forks unchanged since last report.

**2. ANALYZE** — Fetch each fork's diff via `gh` CLI. Extract conceptual changes (ideas, not code). Map to improve-loop domains.

**3. TRIAGE** — Classify: Bug fix / Improvement / New feature. Assess relevance: Directly applicable / Conceptually applicable / Not applicable. Recommend: Adopt / Adapt / Skip.

**4. REPORT** — Write `reports/upstream-sync-YYYY-MM-DD.md` with structured findings.

**5. APPLY** — Present approved findings, edit target files, offer to commit.

### Report Format

Each finding includes: source fork, concept, relevance assessment, our current status, recommendation, and details. Findings grouped by category (bug fix, improvement, new feature).

### Key Design Decisions

- **Conceptual mapping over code diffs**: Our version is too diverged for line-level diff comparison. Extract the idea, assess whether the concept applies.
- **Dated reports**: Each run produces a new file. History preserved across files. Baseline tracking reads prior reports.
- **Linear pipeline**: 10-15 forks doesn't warrant parallel agent complexity. Sequential is simpler and matches existing skill patterns.
- **Forks only**: No web research or other repos. GitHub forks of autoresearch are the highest-signal source.
