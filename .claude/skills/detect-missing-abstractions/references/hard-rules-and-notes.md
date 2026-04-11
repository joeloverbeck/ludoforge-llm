# Hard Rules and Notes

## Hard Rules

1. **Read-only.** Do not modify any source files. Do not run tests. Static analysis and git history only.
2. **No spec writing.** Only write the report. Spec authoring is a separate step.
3. **Two-signal minimum.** No finding appears in the main Findings section unless supported by at least two independent evidence sources. Single-signal observations go in "Needs Investigation."
4. **Every finding needs counter-evidence.** A finding without counter-evidence is an assertion, not an analysis.
5. **No pattern theater.** Never recommend a pattern name unless it corresponds to owned truth and a real boundary. "Strategy pattern" or "Observer pattern" without naming what truth is owned is not a finding.
6. **No abstraction without authority.** If the finding cannot name who owns the truth, it moves to "Needs Investigation."
7. **No wrapper-only recommendations.** "Create a helper/service/interface" is not sufficient unless it relocates invariant ownership.
8. **Recovery first, judgement second.** Gather, map, trace, and detect BEFORE applying FOUNDATIONS principles. Do not let architectural ideals bias observation.
9. **Do not invent problems.** "Acceptable architecture" is a valid and prominent outcome. An analysis that finds nothing wrong is a useful analysis.
10. **No archived prior reports.** Never read, search for, or use reports from `archive/`. Only reports in `reports/` may be consulted. Do not proactively scan `archive/` for context.
11. **Scenario grounding required.** A Lens A cluster that cannot explain any scenario family is demoted to "Needs Investigation," not promoted to a finding.
12. **Findings must be complete.** Each finding has: title, severity, detection lens, kind, scope, owned truth, invariants, owner boundary, evidence with file:line references, scenario families, modules affected, expected simplification, FOUNDATIONS alignment, confidence, and counter-evidence. Incomplete findings are invalid.

## Important Notes

- If a report already exists at the target path, read it first and note any previously-found issues in the Executive Summary's delta comparison. Then overwrite it — each run produces a complete standalone report (unless in incremental mode, where carried-forward verdicts are noted).
- If prior reports are provided, acknowledge already-known issues and focus analysis on NEW findings. Do not re-report what was already found.
- Signal strength > file count — a cluster with scattered discriminant guards in 3 files is a stronger signal than a concept that simply appears in 40 files with clean boundaries.
