---
name: skill-extract-references
description: Extract logically grouped content from a bloated SKILL.md into references/ docs, rewriting the skill as a thin entry point. Argument: path to the skill directory (e.g., .codex/skills/implement-ticket or .claude/skills/improve-loop).
---

# Skill Extract References

Refactor a skill by extracting large, logically grouped content blocks into `references/` docs and rewriting the SKILL.md as a thin orchestration entry point.

Complements skill-consolidate: consolidate first to deduplicate and tighten, then extract-references if the result is still over 60 lines. Or extract first to reduce cognitive load, then consolidate individual reference docs.

**Argument**: A skill directory path (e.g., `.claude/skills/implement-ticket`). The skill locates `SKILL.md` inside it automatically.

## Procedure

### 1. Read Inputs

- Read `<skill-dir>/SKILL.md` in full.
- List `<skill-dir>/references/` if it exists. Read every existing reference doc to understand what is already extracted.
- **Oversized SKILL.md**: if the file exceeds the Read tool's token limit, read it in sequential chunks covering the *whole file* — partial coverage will cause the rewrite step to drop content from unread regions. Record section-heading landmarks (heading text + line numbers) while reading to support targeted re-reads during the rewrite. This is the common case for extract-references since the skill's purpose is operating on bloated SKILLs.

### 2. Early Exit Check

If the SKILL.md is under 60 lines, output "Nothing to extract — SKILL.md is already thin (N lines)." and stop.

### 3. Parse into Blocks

Split the SKILL.md into logical blocks using markdown structure:
- H2 (`##`) and H3 (`###`) headers define primary block boundaries. H4+ sub-sections belong to their enclosing H3 (or H2 if no H3 parent) and are extracted or retained with it.
- Numbered list groups and fenced code blocks within a header section belong to that block.
- The YAML frontmatter is always **core** — never extracted.
- The top-level title (H1) and any immediately following paragraph before the first H2 is **core**.

### 4. Classify Each Block

For each block, determine one of three categories:

- **Core** — stays inline in the thin SKILL.md. This includes:
  - The frontmatter and H1 title.
  - The top-level workflow/procedure steps (the numbered orchestration sequence).
  - Universal hard rules that are short and apply to every invocation.

- **Always-loaded reference** — a self-contained block that applies to every invocation but is large enough (roughly 20+ lines) to warrant extraction. Examples: verification checklists, guardrails sections, outcome definitions.

- **Conditional reference** — a block gated by conditional language in the original text. Look for these markers:
  - Syntactic: "if", "when", "only when", "for tickets that touch", "when the change involves"
  - Semantic: sections describing optional features ("Some campaigns define...", "If program.md defines...") are conditional even if the section itself is not wrapped in an `if` block.
  - Blocks nested under a conditional header or prefaced by conditional language.
  - The condition from the original text becomes the loading instruction in the thin SKILL.md.

**When ambiguous**: default to always-loaded. It is safer to load too much than to miss instructions that should have applied.

**Conditional-ref size threshold**: more lenient than always-loaded — the conditional load pattern itself is the value, not the size. Extract any conditional block that is internally coherent and gated by a clear trigger, even when under 20 lines (e.g., a 10-line plan-mode block triggered by "when plan mode is active" is worth extracting). The alternative — inline-with-conditional-loader prose like "if plan mode is active, ignore the next paragraph" — is harder to read than a clean conditional file load.

### 5. Group and Name

- Merge blocks that share a logical theme into a single reference doc. Do not create one reference per H3 — group by coherent topic. Aim for 3-8 reference docs. Fewer than 3 suggests the extraction isn't worthwhile. More than 8 suggests over-fragmentation — merge thematically related docs.
- Use kebab-case descriptive filenames: `verification-and-closeout.md`, `ai-pipeline-checks.md`, `golden-reassessment.md`.
- If an existing reference doc in `references/` covers the same theme, merge the extracted content into it rather than creating a duplicate.

### 6. Write Reference Docs

- Create `<skill-dir>/references/` if it does not exist.
- Write each reference doc with:
  - An H1 title describing its purpose.
  - The extracted content, preserving its original structure (headers, lists, code blocks).
- Do not add frontmatter to reference docs — they are plain markdown loaded by the thin SKILL.md.

### 7. Rewrite Thin SKILL.md

- **Preserve** the YAML frontmatter exactly as-is.
- **Preserve** the H1 title.
- Write the core workflow as a numbered list of steps. Each step is either:
  - An inline instruction (for core content that stayed), or
  - A load instruction pointing to a reference file:
    - Unconditional: "Load `references/verification-and-closeout.md`."
    - Conditional: "If the change touches AI pipelines, load `references/ai-pipeline-checks.md`."
  - Place conditional load instructions at the earliest workflow step where the reference content is first needed, not at the top of the file.
- **Rewrite cross-section references**:
  - **Explicit anchor links** (`#heading-slug`) that pointed to now-extracted content: replace with prose references to the reference doc containing the target heading (e.g., "see `references/verification.md`").
  - **Prose semantic references** ("Step N", "§N", "X section below"): leave intra-doc references as-is when self-explanatory, but where the referenced section now lives in a different file, append the file path (e.g., "see Pre-Set Directives §4 in `references/interview-protocol.md`"). Skill files predominantly use the prose form, so the semantic-reference case is the common one.
- **Preserve** universal hard rules as a short section at the bottom.
- The thin SKILL.md should read as a clear, scannable orchestration sequence — not a wall of checklists.
- **Target**: the thin SKILL.md should be roughly 25-40% of the original line count. If it exceeds 50%, consider extracting more blocks. Under 25% is acceptable when the thin SKILL still reads as a clear orchestration sequence — under-extraction is not a defect. The 50%+ trigger to extract more is the only hard threshold; the 25% lower bound is just the typical resting state, not a floor.

### 7b. Verify

Re-read the thin SKILL.md and each reference doc. Check:
- Frontmatter unchanged.
- No content lost between original and combined output (compare total line counts as a sanity check — expect 0-15% expansion due to per-ref-doc H1 headers, conditional load instructions in the thin SKILL, and inline cross-doc nav notes; expansion above 15% suggests prose duplication that should be deduplicated; contraction below the original suggests content was dropped during the rewrite (regression — fix before proceeding)).
- No broken internal anchor links pointing to extracted headings.
- No duplicate content across reference docs.
- **Defensive sentinel grep**: run `grep -nE '\[.*\]\(#[a-z-]+\)' <thin-SKILL.md>` to confirm no markdown anchor links survived the rewrite (the rewrite should have replaced them per Step 7). If terms were intentionally removed from the SKILL in a prior session edit (e.g., a deprecated chain neighbor, a renamed concept), also run a fixed-string grep for those terms to confirm the rewrite didn't re-introduce them from the original file's prose.

If any issue is found, fix it before proceeding.

### 8. Output Summary

Print a brief summary:
```
Extracted N reference docs. SKILL.md: X lines → Y lines.

References:
- references/foo.md (always)
- references/bar.md (conditional: when X)
- references/baz.md (always)
```

**Recommended next step**: invoke `/skill-audit <skill-dir>` to verify the extraction. The audit will check cross-doc reference integrity, validate that conditional load instructions are placed at the right workflow steps, and surface any newly-introduced ambiguity from the rewrite. Post-extraction audits commonly catch nav-rewrite gaps that Step 7b's sanity checks don't cover.

## Hard Rules

- Never modify the YAML frontmatter (name, description).
- Never discard content — every instruction from the original SKILL.md must appear either in the thin SKILL.md or in a reference doc.
- Merge into existing reference docs when themes overlap; do not create duplicates.
- Keep nested conditionals together in one reference doc — do not split below the natural grouping level.
- Default ambiguous blocks to always-loaded.
