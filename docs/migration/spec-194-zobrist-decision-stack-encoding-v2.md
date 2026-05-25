# Spec 194 Zobrist Decision-Stack Encoding v2

Spec 194 Phase 2 replaces the decision-stack-frame digest salt from `decision-stack-frame-v1:*` to `decision-stack-frame-v2:*` and removes two audit-proven irrelevant members from the encoded digest surface: `effectFrame.pendingTriggerQueue` and `effectFrame.decisionHistory`. The v2 encoding keeps a single production canonical path: no v1 encoder, compatibility flag, or parallel cache remains in runtime code.

Historical replay artifacts that need the v1 canonical hashes must be reproduced by pinning the repository to the pre-Phase-2 commit that still contains `decision-stack-frame-v1:*`. At and after the v2 cut, pinned `stateHash` fixtures are re-blessed under the new salt and encoding surface so replay identity remains deterministic within the current kernel version.
