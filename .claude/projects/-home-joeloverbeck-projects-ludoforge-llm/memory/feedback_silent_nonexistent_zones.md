---
name: Silent Non-Existent Zone Token Placement
description: Placing tokens in non-existent zone IDs silently succeeds — produces 0 selector matches with no error, making failures hard to diagnose
type: feedback
---

Placing tokens in a zone ID that doesn't exist in the game def (e.g., `quang-tri:none` instead of `quang-tri-thua-thien:none`) does NOT throw an error. The tokens are stored in state.zones under the bogus key, but `mapSpaces` iteration never visits them because the zone isn't in `def.zones`. Selectors return 0 matches with no diagnostic.

**Why:** Discovered during card-105 Rural Pressure implementation. Used abbreviated zone IDs that didn't match actual FITL zone IDs. 9 out of 13 tests failed with `min: 0, max: 0` — took significant debugging to trace back to wrong zone IDs.

**How to apply:**
1. Before writing FITL event tests, verify zone IDs against compiled game def (e.g., `def.zones.filter(z => z.category === 'province').map(z => z.id)`)
2. When tests show unexpectedly empty selector options, check zone IDs FIRST — this is the most common cause
3. Reinforces existing `feedback_fitl_zone_ids.md` — but the key new insight is that the failure is **silent** (no error thrown)
