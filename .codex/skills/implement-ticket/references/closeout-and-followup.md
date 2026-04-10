# Closeout and Follow-Up

1. If implementation completed and no blocking discrepancy remains, update the active ticket:
   - Set ticket status to its completed state when appropriate.
   - Add or amend the ticket outcome with what landed, boundary corrections, and verification that ran.
   - If the final diff intentionally omitted or expanded beyond original `Files to Touch`, record that explicitly in the ticket outcome.
2. Summarize what changed, what was verified, and any residual risk. Include:
   - Audited schema/artifact ripple effects (even if none needed)
   - Deferred verification owned by another ticket
   - Resolved 1-3-1 decisions (especially Foundation type discipline)
   - Rules-evidence notes for game-specific legality corrections
   - Any unverified ticket premise (claimed repro seeds, counts, traces, production observations)
3. **Closeout checklist**:
   - What landed in this ticket
   - Which verification commands ran
   - Whether schema/artifact surfaces were checked and whether they changed
   - Scope deferred to sibling tickets, if any
   - Unverified ticket premises or residual risk
4. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
5. If the user wants archival or follow-up review, hand off to `post-ticket-review`. When the main remaining work is archival hygiene, dependency integrity, or adjacent-ticket review, suggest it as the default next step. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.
