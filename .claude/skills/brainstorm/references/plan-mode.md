# Plan Mode Interaction

Load this reference when Claude Code's plan mode is active. The adaptations here cut across every subsequent step — they override Step 5 (output path) and Step 6 (next-steps menu) of the standard procedure, and satisfy the hard gate automatically.

## Plan Mode Interaction

When Claude Code's plan mode is active, the harness mandates a specific plan file path and requires `ExitPlanMode` for approval. The skill's flow adapts as follows — these adaptations cut across every subsequent step:

- **Step 5 output path**: Write to the harness-specified plan file path (e.g., `~/.claude/plans/<derived-name>.md`) instead of `docs/plans/...`, `specs/...`, or `tickets/...`. Include the same "Brainstorm Context" header content. Specs and tickets cannot be created during plan mode — defer their creation until after approval.
- **Step 6 next steps**: Replace the menu with `ExitPlanMode`. The user's plan-mode approval IS the next-step decision. After approval and exit from plan mode, if the original goal was to produce a spec or ticket, write it then. If the user has already stated their next step, proceed directly.
- **Hard gate**: Plan mode satisfies the hard gate automatically — execution cannot begin until the user approves via the plan-mode review UI.
- **Triage mode artifacts**: If triage would normally produce specs/tickets directly, the plan file should describe which artifacts will be created and where. Create them after plan-mode approval, not during.
- **Operational mode**: Operational tasks frequently run under plan mode because they have side effects. The plan file IS the executable plan; the menu is replaced by `ExitPlanMode`; execution begins after approval.
