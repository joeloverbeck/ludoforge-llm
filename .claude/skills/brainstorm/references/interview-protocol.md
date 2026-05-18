# Confidence-Driven Interview Protocol

Covers Step 2 (the core interview loop) and Step 2.5 (optional external prior-art survey before proposing approaches). Both are always-loaded — Step 2.5's body is conditional ("when either trigger applies") but its trigger evaluation rules must be visible at every invocation.

## Step 2: Confidence-Driven Interview

This is the core of the skill. Your goal is to reach **95% confidence** about what the user actually wants before proposing solutions.

### The Protocol

After each user answer, communicate confidence and remaining gaps explicitly. Two display formats are acceptable — pick based on gap length.

Fenced block (multi-gap or long list):

```
Confidence: X%
Gaps: [list of remaining unknowns]
```

Inline prose (short gap statement): `Confidence: 85% — main gap is whether scope includes Y`.

Either way, name the percentage and the specific gaps. Vague phrasings like "I need more information" are not acceptable. Keep asking questions until confidence reaches 95%. Then announce: "I'm at 95% confidence. Moving to approaches."

### Announcement Template

The announcement format depends on which confidence path you're on. Use the row matching your situation:

| Path / Confidence | Example announcement |
|---|---|
| Standard interview reaches ≥95% | `I'm at 95% confidence. Moving to approaches.` |
| High-Confidence Start at 80–94% with terminal gaps (compound-move) | `Confidence: 88% — gaps: <list>, both addressable in the design itself.` Then proceed directly to compound-move presentation. |
| High-Confidence Start at 80–94% with non-terminal gaps | `Confidence: 88% — gap: <single specific gap>. One question left.` Then ask the question. |
| <80% under Pre-Set Directives "no clarifying questions" | `Confidence: 65% before investigation; investigating <topic>.` Then post-investigation: `Confidence: 80% after <findings> — gap narrows to user intent.` |

This template consolidates the announcement guidance otherwise scattered across the Confidence Scoring Guide, the 90–94% exception, the High-Confidence Start subsection, the Compound-move variant, and Pre-Set Directives §4 — see those sections for the underlying decision logic.

### Interview Rules

1. **One question per message.** Never ask multiple questions at once. **Exception — triage mode**: Related independent decisions (e.g., disposition of item A + artifact format for item B) may be batched into a single AskUserQuestion call when the questions don't depend on each other's answers. **Exception — terminal design-mode rounds**: At ≥ 95% confidence (or under the 90–94% approach-closes-gaps exception in the Confidence Scoring Guide) where every remaining gap is a multiple-choice terminal decision that the Step 3 approach selection or a scoped scope/amendment choice will close, those gaps may be batched in the same message as the approach presentation. **Exception — Step 2.5 trigger configuration**: A research-now-or-defer question (Step 2.5 Trigger A timing) may be batched alongside the approach selection when the same answer informs both — i.e., when the user's approach choice naturally implies whether prior-art research is needed for that approach. The inverse does not hold: open-ended "what problem are you solving?"–class questions must still be one per message.
2. **Prefer multiple-choice questions** when the answer space is bounded. Open-ended is fine when it isn't.
3. **Probe motivations before solutions.** Ask "What problem does this solve?" and "What happens if we don't do this?" before "What do you want built?" The user's first request often describes a solution, not the problem. Your job is to find the problem.
4. **Challenge premature specificity.** If the user jumps to implementation details early, ask why that specific approach matters. Often the constraint is softer than stated.
5. **Detect "should want" vs "actually want".** Watch for:
   - Buzzword-heavy descriptions (the user may be echoing best practices they read, not their real need)
   - Over-scoped requests (wanting everything when they need one thing)
   - Vague success criteria ("it should be good" — probe for what "good" means concretely)
   - Solutions stated as requirements ("I need a microservice" — do they need a microservice, or do they need X capability?)
6. **Name your uncertainty.** When you display gaps, be specific: "I don't know whether this needs to handle edge case X" is useful. "I need more information" is not.
7. **Respect user expertise.** If the user gives a clear, well-reasoned answer, don't re-ask the same thing in different words. Advance.

### Confidence Scoring Guide

| Range | Meaning | Action |
|-------|---------|--------|
| 0-30% | Don't understand the problem yet | Ask about the problem, not the solution |
| 30-60% | Understand the problem, unclear on constraints | Ask about constraints, success criteria, scope |
| 60-80% | Understand problem + constraints, unclear on priorities | Ask about tradeoffs, what matters most |
| 80-95% | Clear picture, a few edge cases or preferences unknown | Ask targeted questions about specific gaps |
| 95%+ | Ready to propose | Transition to Step 3 |

**90–94% exception**: If the remaining gaps are user-intent questions that the Step 3 approach choice will resolve (e.g., scope preferences that map directly onto distinct approach options), advance after stating the gaps explicitly — the approach selection closes them. Do not use this exception to skip problem- or constraint-level gaps; those must reach 95% through interview or investigation first.

### Early Exit

If the user says something like "just go" or "that's enough questions", respect it. Announce your current confidence, list remaining gaps as assumptions you'll make, and proceed to Step 3. Mark those assumptions explicitly in the design so the user can correct them.

### High-Confidence Start

If prior session context (e.g., extended debugging, codebase exploration, or diagnostic work earlier in the conversation) puts starting confidence above 80%, the interview may reduce to 1-2 targeted questions about remaining gaps. If confidence reaches 95% after context reading alone (no user questions needed), announce the confidence score with explicit gaps/assumptions and proceed directly to Step 3. The interview is a tool for gap-filling, not a mandatory ceremony.

**Compound-move variant at 80–94%**: When the remaining gaps are all multiple-choice terminal decisions (which approach, is scope X in or out, amend foundation Y), the Step 3 approach presentation and the final gap-closer questions may be combined into a single message — the user's choice of approach simultaneously resolves the remaining gaps. This is the natural flow when the gaps are "which option" rather than "what's the problem", and the approach recommendations already implicitly argue for one scope/amendment answer over the others. The message shape: short findings recap → 2-4 approaches with tradeoffs → explicit batched gap-closers ending with "pick one and call out the other gaps". See Interview Rule 1's terminal-round exception.

### Pre-Set Directives

A "no clarifying questions" directive set ahead of the brainstorm invocation (e.g., a session-wide system reminder like "the user has asked you to work without stopping for clarifying questions") interacts with four gates in this skill — surface its handling once, here, so the interaction is visible up front:

1. **Step 1.2 classification announcement**: Preserved. The classification announcement is a transparency gate (forces conscious classification, creates an audit trail), not an interview gate. Announce in the *first prose message of the brainstorm response* — when Step 1.5 verification runs first (common for Decision-requiring-design), this is the post-verification "verification results" message; otherwise it is the compound-move message. A short preface message before verification tool calls is optional; the classification announcement may live in either the preface or the results message, but if both exist the announcement leads the preface. The announcement is required even when zero interview rounds occur.
2. **Step 1.5 Trigger A**: Run prescribed verifications autonomously and report results inline. Do not present the "Should I run them now?" question.
3. **Step 2 interview**: Collapse to zero rounds when starting confidence is ≥80% (per Stacked-trigger confidence and High-Confidence Start). State assumptions explicitly in the compound-move presentation; give the user a redirect opportunity after presenting approaches. The explicit confidence-percentage announcement (per the Announcement Template's compound-move row) is still required even at zero interview rounds — state it in the compound-move message. **Redirect-opportunity mechanism**: AskUserQuestion is permitted at Step 3/4 for terminal multi-choice prompts (approach selection, batched gap-closers with ≥3 well-scoped options) — the directive constrains open-ended interview rounds, not bounded multi-choice prompts where one tap is less friction than scan-and-write. For ≤2 options or open-ended redirects, present the recommendation inline with explicit assumptions and proceed with the recommended option in the next turn unless the user redirects.
4. **Step 4 Compound-move + auto-mode intersection**: The directive does NOT waive the section preview. "Without stopping for clarifying questions" constrains interview rounds, not transparency gates. The section-bullet preview is still required as a separate message before the artifact write (this matches the existing disqualification clause in Step 4). "Separate message" here — and everywhere in this skill — means separate from the Write tool call only; bundling section-name bullets in the same prose message as approach + findings recap is permitted and often efficient under this directive — the constraint is that the section preview MUST land before the Write tool call, not that it must be its own standalone prose message.
5. **Step 6 next-steps menu**: Present as an inline recommendation, no `AskUserQuestion`. The "no clarifying questions" directive treats the Step 6 menu the same as auto-mode adaptation — inline recommendation + redirect opportunity. The Continual Learning offer, when it fires, is an additional line in the inline recommendation rather than a separate `AskUserQuestion` question (the "separate question to avoid false mutual exclusion" rule in Step 6 applies only when AskUserQuestion is the presentation mechanism). See Step 6 auto-mode adaptation for the inline recommendation shape.

If starting confidence is below 80%, the directive does not give license to skip problem- or constraint-level gap-closing — investigate via Investigation Questions below instead of asking the user, and announce confidence deltas inline as each investigation phase concludes.

### Investigation Questions

When a confidence gap can only be resolved by codebase investigation — not by asking the user — investigate directly rather than asking. This commonly happens for:

- **Scope decisions**: "How much should this cover?" → trace dependency graphs, check module boundaries
- **Feasibility**: "Can X and Y be separated?" → read call graphs, check circular dependencies
- **Existing infrastructure**: "Does something like this already exist?" → search for prior art in the codebase

Announce what you're investigating and why, present findings, then resume the interview with the new information incorporated into your confidence score. The user explicitly requesting investigation (e.g., "investigate the matter carefully") is a strong signal to use this path.

In design mode, investigation may legitimately span Step 1, 1.5, and 2 as the problem boundary shifts — an artifact read in Step 1 may surface a diagnostic worth running in Step 1.5, which in turn may surface a broader sweep worth running mid-Step 2. There is no cap on investigation stages as long as each is justified, announced, and proportionate to the decision at stake. Record the confidence delta each phase produces so the accumulated investigation is visible rather than implicit. Each investigation phase that materially changes confidence should announce the delta in one inline sentence (e.g., `Confidence: 80% after CI log review — gap narrows to user intent`); phases that don't move confidence don't need an announcement, but the final pre-Step-3 confidence figure must be stated in full so the user can verify the audit trail. When several investigation phases complete within one continuous verification/investigation block with no intervening user turn (e.g., a parallel Explore-agent dispatch followed immediately by verification greps, possibly spanning several tool-call rounds), batching the per-phase deltas into the final pre-Step-3 figure is acceptable — the message-by-message tool-call evidence covers the audit trail, and per-phase chatter under "no clarifying questions" produces no actionable surface for the user.

### Mid-Flow Investigation (Triage Mode)

If the user responds to a triage question with a request for additional investigation rather than a decision (e.g., "check against FOUNDATIONS.md", "investigate further before I decide"), perform the investigation, present findings with a recommendation, and resume the triage flow. This is not a confidence regression — it's a targeted inquiry within a decision that's otherwise scoped. Do not restart the interview or re-ask resolved questions.

## Step 2.5: External Prior-Art Survey (Optional)

Before proposing approaches, run a targeted external prior-art survey when either trigger applies:

**Trigger A — User requested external research.** The user asked to "research online", "look up prior art", or similar **unconditionally**. Proceed without re-asking. If the request is conditional ("if needed", "as necessary", "after we verify X"), wait for the condition to resolve via Step 1.5 verification before triggering — surface the timing question in the Step 3 compound-move gap-closer (per Interview Rule 1's Step 2.5 trigger-configuration exception) rather than running searches preemptively.

**Trigger B — Architectural topic without prior-art coverage in references.** The brainstorm designs cross-cutting architecture (kernel, protocol, state model, public API) and the reference files do not already survey how similar systems solved the same problem. External survey grounds Step 3's approaches in real systems rather than speculation, which serves Foundation #15 (Architectural Completeness).

Execution:

- Run 3–5 parallel web searches scoped to systems that solved the *same* problem, not adjacent ones. Frame searches as "What repository or framework made this architectural choice for this reason?" rather than broad topic surveys.
- Cite sources when presenting approaches in Step 3 — short URL lists under each approach are sufficient.
- Capture canonical pattern names (e.g., "IExtendedSequence stack", "information sets", "factored action spaces") so the design can reference shared vocabulary.
- Skip the step entirely when the reference file already inventories prior art, when the topic is project-specific with no natural external analog (data fixtures, private DSL details, game-specific tuning), or when neither trigger applies.

This is a solution-space survey, not an interview replacement. Do not substitute prior-art reading for unresolved user-intent gaps from Step 2. If prior-art findings reveal that approach options depend on a user decision not yet covered, pause the survey and return to Step 2 for the missing interview round — treat it as one more investigation stage under Step 2's "no cap on investigation stages" rule.
