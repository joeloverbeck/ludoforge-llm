# Next Steps Menu

Covers Step 6: per-output-type menus (design doc / spec / triage tickets / triage spec+report / operational plan / measurement report / multi-file directory / new skill), namespace derivation, multi-spec and multi-phase adaptations, mixed primary + secondary mutation overlay, Continual Learning prompt evaluation, and auto-mode adaptation. Always-loaded.

## Step 6: Next Steps Menu

**Plan mode override**: If plan mode is active, replace the menu with `ExitPlanMode`. The plan-mode approval IS the next-step decision. See `references/plan-mode.md`.

**Directive override**: Under "no clarifying questions" / auto mode, present the menu as an inline recommendation, no `AskUserQuestion`. See Pre-Set Directives §5 in `references/interview-protocol.md`.

Present the user with options for what to do next. Adapt the menu to the output format:

**If output was a design doc** (`docs/plans/`):
```
What would you like to do next?
1. Create a spec from this design (write to specs/)
2. Start implementing directly
3. Done for now — I'll review the design doc later
```

**If output was already a spec** (`specs/`):
```
What would you like to do next?
1. Decompose into implementation tickets (invoke `/spec-to-tickets` with the spec path and namespace <SUGGESTED>)
2. Review the spec first — recommended for XL specs (many tickets, broad scope) where direct implementation would skip the decomposition step
3. Start implementing directly — appropriate for small specs (single ticket or small contiguous slice)
4. Done for now — I'll review the spec later
```

Suggest a namespace for option 1 derived from the spec's filename slug — the `<name>` portion of `specs/<number>-<name>.md` — at menu time (derive from the filename slug, not the prose H1 heading; the two can diverge, especially after an in-place revision that rewrites the H1 but keeps the filename). The existing repo convention (visible in `tickets/`) is `<spec-number><UPPERCASE-LETTER-CHUNKS-OF-FIRST-3-TO-4-MEANINGFUL-WORDS>` (letter chunks are typically 2-to-6 letters per word — not single-letter initials; common stop-words like "and", "the", "native" are dropped) — e.g., spec 139 "constructibility-certificate-legality-contract" → `139CCONLEGCONT`; spec 140 "microturn-native-decision-protocol" → `140MICRODECPRO`; spec 163 "generic-microturn-state-feature-lookups" → `163GENLOOKUP` (the 6-letter `LOOKUP` chunk illustrates the upper end of the range). **Hyphen-compound qualifiers** (`per-decision`, `non-player`, `cross-phase`) count as a single meaningful word for the 3-to-4-word budget; the chunk MAY drop the qualifier prefix when the resulting chunk would otherwise exceed 6 letters (e.g., `per-decision` → `DEC` rather than `PERDEC`). **Dual-noun hyphen-compounds** (`preview-drive`, `event-card`, `state-hash` — both halves are nouns, neither is a clearly-qualifying prefix) follow the same single-word rule, but the qualifier-drop heuristic is genuinely ambiguous; choose whichever 3-to-4-letter chunk yields the more readable namespace, with a slight preference for the half that carries more domain weight in the spec's title-context (often the right-hand noun unless the left-hand noun is the more distinctive identifier — e.g., `preview-drive` → `DRV` and `PRV` are both valid, with `DRV` aligning if you treat "preview" as the qualifier and `PRV` aligning if you treat "drive" as the more generic noun). **Generic descriptor suffixes** (`-optimizations`, `-performance`, `-improvements`, `-cleanup`) are dropped first when the title exceeds the 4-word budget — e.g., spec 167 "arvn-evolution-harness-performance" → `167ARVNEVOHAR` (dropped generic `performance`); spec 168 "engine-per-decision-hot-path-optimizations" → `168ENGHOTPATH` (dropped generic `optimizations`, then trimmed `per-decision` per the hyphen-compound rule). **Imperative-verb prefixes** (`optimize-`, `extract-`, `consolidate-`, `enable-`, `enforce-`, etc.) follow the same drop rule as generic descriptor suffixes — drop first when the title exceeds the 4-word budget, retain when within budget (e.g., spec 178 "optimize-continued-deepening-inner-preview-orchestration" → `178CONTDEEPINNER`, dropped imperative `optimize` and generic descriptor `orchestration`, retained three chunks). **Semantically-loaded suffixes** like `-policy`, `-protocol`, `-contract`, `-interface`, `-model` are NOT generic descriptors — they carry domain weight and should remain in the namespace when within the 4-word budget (e.g., spec 170 "partial-visibility-observer-policy" → `170PARTVISOBSPOL`, all four chunks retained). The budget-exceeded trigger is the sole drop criterion; the generic-vs-loaded distinction settles ambiguity at the 4-word-budget edge. Surfacing the namespace in the menu saves the user a round-trip through spec-to-tickets' "ask for namespace" prompt.

Option 2 vs option 3 is a size heuristic, not a hard rule: specs that decompose into 4+ tickets across 3+ implementation waves generally benefit from review-first; smaller specs may go straight to implementation. Adapt the menu wording to the actual spec shape when presenting it.

**Multi-spec output adaptation**: If the brainstorm produced 2+ specs in a single design pass (e.g., follow-up specs N+1 and N+2 from a predecessor that named both), expand option 1 into one decomposition option per spec (`Decompose Spec <N+1> into tickets (namespace <SUGGESTED-N+1>)`, `Decompose Spec <N+2> into tickets (namespace <SUGGESTED-N+2>)`, …) and renumber the remaining options. The namespace-derivation rule (uppercase-letter-chunks-of-first-3-to-4-meaningful-words) applies per-spec. Combine with Multi-phase spec adaptation below when a multi-spec output also has a phased earliest deliverable.

**Multi-phase spec adaptation**: If the spec has a phased structure where the earliest phase is genuinely separable (small effort, no architectural dependencies on later phases, risk profile unrelated to later phases), append an option: "Start Phase 0 immediately while reviewing the rest." Two distinct Phase 0 topologies exist and they pair differently:

- **(a) Phased strategic delivery — Phase 0 is a permanent deliverable.** The phased structure is purely a sequencing decision; Phase 0 produces durable code or infrastructure that stays in the codebase after later phases land. No restoration ticket needed — Phase 0 is a planned permanent improvement, not a regression. Surface the option as written.
- **(b) Tactical-T as Phase 0 — Phase 0 is a stopgap until later phases supersede it.** Phase 0 exists only because the strategic phases are slow to land (the Step 3 "Tactical + strategic compound" pattern, recast as a phase). MUST be paired with the restoration ticket required by the Step 3 rule — Phase 0 closes only when the strategic phases land. Without the restoration ticket, the tactical stopgap silently normalizes as the answer and violates Foundation #15 (Architectural Completeness).

Decision criterion: ask "is Phase 0 a permanent deliverable, or a stopgap to be removed when later phases land?" If permanent → (a). If stopgap → (b). When in doubt, the test is whether the codebase contains Phase 0's artifacts unchanged after the full strategic plan lands.

**If triage produced tickets directly** (`tickets/<PREFIX>-<NNN>.md`):
```
What would you like to do next?
1. Implement ticket <PREFIX>-<lowest-NNN> first (invoke `/implement-ticket`)
2. Run `pnpm run check:ticket-deps` to verify dependency integrity, then defer
3. Done for now — I'll review the tickets later
```

Recommend option 1 only when the lowest-numbered ticket is genuinely independent (no `Deps` line listing other newly-written tickets); otherwise default to option 3.

**If triage produced spec(s) and/or report updates**:
```
What would you like to do next?
1. Decompose spec(s) into implementation tickets (invoke `/spec-to-tickets` with each spec path and namespace <SUGGESTED-PER-SPEC>, derived from each spec's filename slug using the same convention as the spec-output menu)
2. Run a follow-up analysis pass (e.g., another missing-abstractions sweep on a different test suite, or a related triage in an adjacent area)
3. Done for now — I'll review the artifacts later
```

**If output was an operational plan** (`docs/plans/YYYY-MM-DD-<action>.md`):
```
What would you like to do next?
1. Execute the plan now (proceed step-by-step with verification at each gate)
2. Defer execution — I'll run it later or in a separate session
3. Revise the plan first (re-enter brainstorm with corrections)
```

**If output was a measurement/decision report** (`reports/<topic>-<descriptor>.md` from diagnostic mode):
```
What would you like to do next?
1. Decompose the follow-up spec named by the report (write the spec via `/brainstorm`, then `/spec-to-tickets` to decompose)
2. Launch a follow-up measurement (next investigation phase, related diagnostic in an adjacent area, or witness rerun after intervening fixes)
3. Done — I'll review the report later
```

Recommend option 1 when the report named a specific follow-up artifact (spec or ticket) and the user has not already begun authoring it. Recommend option 2 when the report identifies a measurable next question with a bounded experiment. Recommend option 3 when the verdict was "investigation closed", when the report stands as a forward-navigation breadcrumb without an immediate next action, or when post-report conversation has already organically elicited the user's next step.

**If output was a multi-file artifact directory** (`campaigns/<name>/`, plugin scaffold, etc.):
```
What would you like to do next?
1. Launch the workflow now (e.g., `/improve-loop campaigns/<name>` for campaigns; equivalent invocation for other directory artifacts)
2. Smoke-test the harness/runner first (run one mode end-to-end at baseline cost before launching the loop)
3. Done for now — I'll launch later
```

Adapt option 1 to the directory's downstream consumer — `/improve-loop` for campaigns, the relevant plugin-loader command for plugin scaffolds, etc. Option 2 applies when the optional smoke run from `references/validate-executable-artifacts.md` was deferred (e.g., per-mode runtime exceeds the ~2-minute bounded threshold and the user did not opt in earlier).

**If output was a new skill** (`.claude/skills/<name>/SKILL.md`):
```
What would you like to do next?
1. Validate via `/skill-audit .claude/skills/<name>` (catches frontmatter and cross-skill issues before first real use)
2. Exercise the skill on a representative real-world case
3. Done — I'll exercise it next time the trigger arises
```

Recommend option 1 when the new skill has more than ~150 lines or invokes other skills as chain neighbors. For short, self-contained skills, option 3 is reasonable.

**Mixed primary + secondary mutation**: When the brainstorm wrote a primary artifact (per one of the per-output-type menus above) AND mutated a separate already-existing file as part of the agreed scope (e.g., appended a coverage section to the source report, updated a related cookbook entry, added a follow-up breadcrumb to a prior spec), list the secondary mutation as a one-line summary above the primary menu so the user sees both edits before being asked about next steps. This is distinct from the Continual Learning prompt below — Continual Learning OFFERS a secondary update; this rule covers the case where a secondary mutation was already INCLUDED in the agreed scope and has landed. The Step 6 menu shape stays the per-primary-output-type form; the mixed case is a presentation overlay, not a separate menu.

**Continual Learning prompt** (only when applicable): If the brainstorm surfaced a concrete gap in `CLAUDE.md`, `docs/FOUNDATIONS.md`, an existing skill, or a `reports/` file whose forward-looking guidance is now contradicted by landed code (conflicting instructions, missing guidance, outdated references, or a recommendation marked "the real fix" / "next step" / equivalent that has since been implemented), append an option: "Propose updates to <file>". The prompt ALSO fires when **the brainstorm's own conclusions supersede a prior report's load-bearing recommendation** — e.g., a recommendation in `reports/<earlier-analysis>.md` led to an artifact whose corrected revision now invalidates that recommendation. In this case the offer is to append a "Superseded by <spec/artifact>" breadcrumb to the prior report so a future reader is not misled by stale advice; keep the offer opt-in (historical analysis is sometimes worth preserving unmodified). The prompt ALSO fires when **the brainstorm produced the named follow-up artifact a reference report explicitly deferred to** — e.g., the trigger report's "Follow-Up Profiling Targets" / "Next Steps" / "Deferred to follow-up" section names work the brainstorm's output spec or ticket now owns. The offer in this case is to append a "Follow-up: <spec/ticket>" breadcrumb to the reference report so a future reader can navigate forward from the report to its operationalization. This trigger fires more often than the supersede trigger because measurement-report → follow-up-spec is the common brainstorm flow; the breadcrumb is forward-navigation infrastructure, not a correction, and both can co-exist (a report may be both partly superseded and partly operationalized by the same brainstorm output). Do not include this option speculatively — only when the brainstorm produced specific evidence of a gap (a commit SHA or diff that contradicts the file's claim, OR a documented brainstorm decision that overrides a prior report's recommendation, OR the brainstorm's output is the named follow-up the reference report deferred to). This implements CLAUDE.md's Continual Learning rule. **Presentation**: when the Step 6 menu is presented via AskUserQuestion, the Continual Learning offer is orthogonal to the next-step choice — the user may want a next-step action AND the doc/report update. Present it as a *separate* AskUserQuestion question, not as an appended option to the single-select next-step menu (which would force a false mutual exclusion). The auto-mode path below, where the offer is an additional line in an inline recommendation rather than a single-select menu, has no such constraint.

If the user has already stated their next step (e.g., in the same message that approved the final design section, or immediately after artifact writing), skip the menu and proceed with their stated intent. If the brainstorm was invoked mid-task (e.g., during active troubleshooting or implementation) and the design is a targeted fix, present a brief confirmation ("Ready to implement — proceeding unless you'd prefer a different path") rather than the full menu. In triage mode, if all items have been triaged and artifacts written, the brainstorm is naturally complete — the menu may be skipped when continuation would add no value.

**Auto-mode adaptation**: Under Claude Code's auto mode, the multi-option menu is replaced by a brief recommendation + one-beat pause. State the recommended next step (typically option 1 for well-scoped specs and operational plans, or option 2 for XL specs that benefit from review-first), explain in one sentence why it is the recommendation, and offer the user a chance to redirect before proceeding. **Before stating the recommendation, evaluate the Continual Learning prompt above** — if it fires (a `CLAUDE.md` / `FOUNDATIONS.md` / skill / `reports/` file whose forward-looking guidance is now contradicted by landed code or by this brainstorm's conclusions), append the proposed-update offer to the recommendation as an additional option. Auto-mode compression makes this gate easy to miss without the explicit reminder. If the user is silent or affirms the recommendation, proceed with it. This matches auto mode's "prefer action over planning" directive without forgoing substantive user control — the user still sees what will happen and can veto. When the spec has a separable Phase 0 (per Multi-phase spec adaptation above), the auto-mode recommendation should pair option 1 with a parenthetical alternative — e.g., "decompose into tickets, OR start Phase 0 immediately while reviewing the rest." Pair when Phase 0 is XS-S effort and dependency-free (the common case for perf witnesses, telemetry probes, TDD-style failing tests, and other small first-deliverables that lay groundwork for the rest of the spec); default to decomposition alone only when Phase 0's effort exceeds review-concludability or carries architectural dependencies that block parallel work. The disposition of any Step 1.5 verification artifacts (promoted / ephemeral / deleted / none) belongs in this same auto-mode recommendation so the user can object before the next step starts.

Use AskUserQuestion to present this as a proper choice (skip under auto-mode adaptation above). Under the "no clarifying questions" directive, treat the Step 6 menu the same as auto-mode adaptation — inline recommendation + redirect opportunity, no AskUserQuestion. If the user picks an option that invokes another skill, invoke it. If they pick "done", end the session.
