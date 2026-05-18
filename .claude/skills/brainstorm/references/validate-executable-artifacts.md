# Validate Executable Artifacts (Step 5.5)

Load this reference when Step 5 produced executable code (harness scripts, benchmark runners, plugins, generated config) or a new skill artifact (`.claude/skills/<name>/SKILL.md`). Skip otherwise.

## Step 5.5: Validate Executable Artifacts

When Step 5 produces executable code (harness scripts, benchmark runners, plugins, generated config) — not just prose — run cheap structural checks before handing off to the user. Skill artifacts (`.claude/skills/<name>/SKILL.md`) get a parallel set of checks documented under "Skill artifact checks" below.

**Mandatory checks** (every executable artifact):

- **Syntax check**: `node --check <file.mjs|.js>`, `bash -n <file.sh>`, `python -m py_compile <file.py>`, or the language equivalent. These catch import errors, scoping bugs (e.g., referencing a class declaration before its definition), missing braces, and similar mechanical defects in <1 second.
- **Permission/shebang check**: if the artifact is meant to be invoked directly (`./harness.sh`, executable via shebang), verify the executable bit (`ls -l`) and shebang line.

**Optional checks** (when the runtime is bounded, typically <2 minutes per mode):

- **Smoke run**: invoke the artifact once per declared operating mode (e.g., `--mode on`, `--mode off`) and confirm it produces structurally valid output (expected JSON keys, exit code 0, expected order of magnitude on declared metrics). Skip when a single invocation would exceed ~2 minutes unless the user explicitly opts in.
- **Cross-mode comparison** (when applicable): if the artifact has a declared expected relationship between modes (e.g., a watchdog mode should be ~baseline-time, a primary mode should reproduce a known regression), confirm the relationship holds within reasonable noise.

**Skill artifact checks** (every new SKILL.md produced by Step 5):

- **Frontmatter validity**: the YAML frontmatter parses; contains `name`, `description`, and `user-invocable`; if `arguments` is present, each entry has `name`, `description`, and `required`.
- **Directory layout**: matches sibling-skill convention under `.claude/skills/`. Single `SKILL.md` by default; `SKILL.md` + `references/` only when SKILL.md is a thin entry point.
- **Harness registration**: the new skill name appears in the next system-injected available-skills list. The harness re-loads its index after a write; registration is observable in the next message's system-reminder block. If the skill does not appear, re-check frontmatter and file path before handoff.

Skill artifacts are prose, not executable code, so syntax/permission/smoke checks do not apply. The disposition rules below cover frontmatter typos (mechanical → fix in-place) and missing-design-section gaps (structural → raise to user).

**Defect disposition**:

- **Mechanical defects** (syntax errors, missing imports, typos, executable-bit not set): fix in-place silently. This is artifact-correctness, not re-design — it does not require re-approval.
- **Structural defects** (wrong scope, missed requirement, design assumption violated by the smoke run): raise back to the user with a one-line summary of what the smoke run revealed, propose a corrected design, and re-validate after the correction is approved. This IS a design correction — surface it, do not silently rewrite the artifact.

The hard gate at the top of the SKILL.md is preserved: validation confirms structural correctness of the *approved* design, it does not introduce new behavior.
