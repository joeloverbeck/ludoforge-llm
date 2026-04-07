# recover-architectural-abstractions Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a single analysis skill that recovers cross-subsystem architectural abstractions from test suites, complementing the existing `detect-missing-abstractions` skill at a higher abstraction level.

**Architecture:** Single SKILL.md following the same structural pattern as `detect-missing-abstractions`. Six methodology phases (GATHER → SCENARIO MAP → TRACE → DETECT FRACTURES → SYNTHESIZE → VALIDATE), with sub-agent delegation for data-intensive phases. Read-only, produces a markdown report.

**Tech Stack:** Claude Code skill (SKILL.md), Explore sub-agents for delegation, git blame for temporal coupling.

**Design doc:** `docs/plans/2026-04-07-recover-architectural-abstractions-design.md`

---

### Task 1: RED — Baseline Test Without Skill

Run a subagent on a complex test directory WITHOUT the skill to establish baseline behavior. This documents what an unguided agent does when asked to find higher-order architectural abstractions.

**Step 1: Choose a test target**

Use the kernel test directory — it exercises cross-subsystem code:
```
packages/engine/test/unit/kernel/
```

**Step 2: Run baseline subagent**

Launch an Explore subagent with this prompt (no skill loaded):

> "Analyze the test files in `packages/engine/test/unit/kernel/` to find higher-order architectural abstractions — cross-subsystem patterns where the architecture could be cleaner with better abstraction boundaries. Focus on fractures like split protocols, authority leaks, and concept aliasing. Produce a report."

**Step 3: Document baseline behavior**

Record verbatim:
- Did the agent cluster tests into scenario families or just list files?
- Did it trace test-to-code dependencies or stay at the test level?
- Did it look for specific fracture types or produce generic "code smells"?
- Did it propose abstractions with owned truth and invariants, or just say "extract a helper"?
- Did it check FOUNDATIONS.md?
- Did it provide counter-evidence for its findings?
- What rationalizations did it use for shallow analysis?

**Step 4: Save baseline results**

Save the baseline output and analysis to a temporary file for reference during skill writing. This will be deleted after the skill is complete.

---

### Task 2: GREEN — Write the SKILL.md

Create the skill file based on the design doc, addressing the specific failures observed in the baseline.

**Step 1: Create the skill directory**

```bash
mkdir -p .claude/skills/recover-architectural-abstractions
```

**Step 2: Write SKILL.md frontmatter**

Write to `.claude/skills/recover-architectural-abstractions/SKILL.md`:

```yaml
---
name: recover-architectural-abstractions
description: Use when a complex test suite exercises cross-subsystem code and you suspect higher-level architectural fractures — split protocols, authority leaks, boundary inversions — that detect-missing-abstractions cannot see because it works within single concepts.
---
```

**Step 3: Write the skill body**

The full SKILL.md content should include these sections, drawing from the design doc at `docs/plans/2026-04-07-recover-architectural-abstractions-design.md`:

1. **Title and overview** — 2-3 sentences: what this skill does, how it differs from detect-missing-abstractions.

2. **Invocation** — `/recover-architectural-abstractions <test-file-or-directory> [--prior-reports path1 path2 ...]`. Output path convention: `reports/architectural-abstractions-<date>-<context>.md`.

3. **Phase 1: GATHER** — Read tests, trace imports 2-3 levels deep, read FOUNDATIONS.md (hold for later), read prior reports, run bounded git history for temporal coupling. Sub-agent delegation guidance for large suites (>20 direct imports).

4. **Phase 2: SCENARIO MAP** — Cluster tests into scenario families by behavior, not just by file. Recover: what behavior, which fixtures, which assertions, which domain concepts. Sub-agent delegation for >30 test files.

5. **Phase 3: TRACE** — Multi-strategy test-to-code traceability: imports, static call graph, naming similarity, temporal coupling. Each link gets confidence tag + reason.

6. **Phase 4: DETECT FRACTURES** — The 8 fracture types table (split protocol, authority leak, projection drift, boundary inversion, concept aliasing, hidden seam, overloaded abstraction, orphan compatibility layer). Two-signal minimum evidence rule.

7. **Phase 5: SYNTHESIZE** — For each validated fracture, produce candidate with 11 fields: title, kind, scope, owned_truth, invariants, owner_boundary, modules_affected, tests_explained, expected_simplification, confidence, counter_evidence. Kind enum: Protocol, Authority boundary, Bounded context, Projection owner, Capability ledger, Workflow coordinator, Translation boundary, Lifecycle carrier.

8. **Phase 6: VALIDATE** — Two filters: survival criteria (5 tests) then FOUNDATIONS alignment. Recovery first, judgement second — FOUNDATIONS is the evaluation layer, not the starting lens.

9. **Report format** — The full report template from the design doc (Executive Summary, Scenario Families, Traceability Summary, Fracture Summary, Candidate Abstractions, Acceptable Architecture, Recommendations).

10. **Hard Rules** — All 8 rules from the design doc.

11. **Important Rules** — Read-only, no source modification, no test execution, no spec writing. Focus on cross-subsystem fractures, not single-concept scatter. Always check FOUNDATIONS.md. Each finding either needs a spec or doesn't.

**Key guidance for writing**: Model the structure closely on `detect-missing-abstractions` SKILL.md (at `.claude/skills/detect-missing-abstractions/SKILL.md`). Match its tone, level of detail, and tool usage guidance. The existing skill is the proven template.

**Step 4: Commit**

```bash
git add .claude/skills/recover-architectural-abstractions/SKILL.md
git commit -m "feat: add recover-architectural-abstractions skill"
```

---

### Task 3: GREEN — Verify Skill With Subagent

Run the same scenario as Task 1, but WITH the skill loaded.

**Step 1: Run subagent with skill**

Launch a subagent that invokes:
```
/recover-architectural-abstractions packages/engine/test/unit/kernel/
```

**Step 2: Compare against baseline**

Check each baseline failure:
- Does it now cluster tests into scenario families?
- Does it trace test-to-code with multiple strategies?
- Does it look for the 8 specific fracture types?
- Does it propose abstractions with owned truth and invariants?
- Does it check FOUNDATIONS.md as validation (not starting lens)?
- Does it provide counter-evidence?
- Does it distinguish "spec-worthy" from "acceptable"?

**Step 3: Document compliance vs gaps**

Record which baseline failures the skill now addresses and which gaps remain. Gaps feed into Task 4.

---

### Task 4: REFACTOR — Close Loopholes

Address any gaps found in Task 3.

**Step 1: Identify new rationalizations**

From the Task 3 test, document any cases where the agent:
- Skipped phases or merged them inappropriately
- Applied FOUNDATIONS too early (before recovery)
- Reported fractures with only one evidence source
- Produced wrapper-only recommendations despite the hard rule
- Skipped counter-evidence

**Step 2: Add explicit counters to SKILL.md**

For each rationalization found, add an explicit counter in the relevant section. Follow the pattern from detect-missing-abstractions (e.g., its detailed workaround counting rules, its merge-cluster threshold).

**Step 3: Re-test**

Run the subagent test again. Verify the loopholes are closed.

**Step 4: Commit**

```bash
git add .claude/skills/recover-architectural-abstractions/SKILL.md
git commit -m "refactor: close loopholes in recover-architectural-abstractions skill"
```

---

### Task 5: Clean Up

**Step 1: Delete baseline artifacts**

Remove any temporary files created during Task 1.

**Step 2: Final verification**

Verify the skill appears in the skill list and its description triggers correctly for cross-subsystem analysis requests.

**Step 3: Delete the brainstorming input if desired**

The brainstorming doc at `brainstorming/abstraction-recovery-skill.md` has been fully consumed by this design and skill. Ask the user whether to keep or remove it.
