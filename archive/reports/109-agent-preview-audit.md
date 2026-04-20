# 109 Agent Preview Audit

**Status**: COMPLETED

Date: 2026-04-05
Ticket: `tickets/109AGEPREAUD-001.md`
Spec: `specs/109-agent-preview-audit.md`

## Goal

Confirm whether FITL event moves fall out of the preview pipeline during move preparation, template completion, or trusted preview application.

## Commands

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine run schema:artifacts
pnpm -F @ludoforge/engine test
node --input-type=module -e "<FITL verbose-trace extraction for seeds 1003 and 1004>"
```

## Findings

### Seed 1003

First interesting move contained two event preparations for `card-17`:

- Unshaded:
  - `initialClassification=complete`
  - `finalClassification=complete`
  - `enteredTrustedMoveIndex=true`
- Shaded:
  - `initialClassification=pending`
  - `finalClassification=complete`
  - `enteredTrustedMoveIndex=true`
  - `templateCompletionAttempts=3`
  - `templateCompletionOutcome=complete`

Selected move:

- `event|{"eventCardId":"card-17","eventDeckId":"fitl-events-initial-card-pack","side":"shaded","decision:eventTarget:0:$targetSpace::$targetSpace":"pleiku-darlac:none"}|false|event`

Preview outcomes:

- Shaded candidate with resolved target:
  - `previewOutcome=ready`
  - `previewRefCount=1`
  - `score=-9.6`
- Unshaded candidate:
  - `previewOutcome=ready`
  - `previewRefCount=1`
  - `score=-9.6`

Conclusion for seed 1003:

- The shaded event does **not** die in `preparePlayableMoves`.
- It begins as `pending`, completes successfully through `attemptTemplateCompletion`, enters `trustedMoveIndex`, and reaches `ready` preview.

### Seed 1004

First interesting move contained two event preparations for `card-116`:

- Unshaded:
  - `initialClassification=complete`
  - `finalClassification=complete`
  - `enteredTrustedMoveIndex=true`
- Shaded:
  - `initialClassification=complete`
  - `finalClassification=complete`
  - `enteredTrustedMoveIndex=true`

Preview outcomes:

- Shaded:
  - `previewOutcome=ready`
  - `previewRefCount=1`
  - `score=-40`
- Unshaded:
  - `previewOutcome=ready`
  - `previewRefCount=1`
  - `score=-40`

Conclusion for seed 1004:

- Both event sides enter `trustedMoveIndex`.
- Both sides reach `ready` preview.
- The identical `-40` score is **not** caused by classification as `rejected`, `pending`, `stochastic`, or `unknown/unresolved`.

## Root-Cause Narrowing

The audit disproves the original root-cause hypothesis that FITL event candidates are generally failing out of `preparePlayableMoves` before trusted preview:

- `card-17` shaded proves a pending event can complete and become trusted.
- `card-116` proves both shaded and unshaded sides can be trusted and previewed as `ready` while still scoring identically.

So the remaining problem surface is downstream of basic preparation classification:

- preview-state equivalence for the two sides
- projected margin evaluation over those preview states
- or a genuinely equal margin despite differing card semantics

It is **not** the broad “event moves never enter `trustedMoveIndex`” failure described in the original spec/ticket series.

## Implication For Ticket 002

`109AGEPREAUD-002.md` should be reassessed before implementation. Its current problem statement assumes event moves fail completion and never enter `trustedMoveIndex`, but this audit found counterexamples in production FITL seeds.

## Outcome

- Completion date: 2026-04-20
- What actually changed:
  - preserved the completed audit findings and archived the report because it is a point-in-time investigation tied to the Spec 109 ticket series rather than a live working report
- Deviations from original plan:
  - none; the document served as an investigation artifact and is now moving out of the active `reports/` folder
- Verification results:
  - archival classification reviewed against current spec and ticket references before moving the file
