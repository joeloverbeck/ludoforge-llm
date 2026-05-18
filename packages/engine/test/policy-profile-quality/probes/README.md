# Policy Probe Runner

This directory contains the Phase 0 scaffold for deterministic policy probes.
Probe modules define a small data object with `defineProbe()`, then a per-game
`*.probes.test.ts` wrapper loads the game fixture and calls `runProbe()`.

The runner drives the normal kernel and policy-agent path:

1. create initial state for the probe seed,
2. apply any `stateBinding.replayPrefix` with public kernel decision application,
3. publish microturns and let `PolicyAgent` choose through the configured profile,
4. collect the selected decision plus `PolicyAgentDecisionTrace`,
5. return deterministic per-seed and aggregate outcomes.

Minimal wrapper shape:

```ts
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { runProbe } from './probe-runner.js';
import { probes } from './fire-in-the-lake/example.probe.js';

describe('fire-in-the-lake policy probes', () => {
  for (const probe of probes) {
    it(probe.id, () => {
      const result = runProbe(probe, {
        loadGame: ({ scenario }) => {
          const def = getFitlProductionFixture().gameDef;
          return { def, runtime: createGameDefRuntime(def), playerCount: 4, scenario };
        },
      });
      assert.equal(result.aggregateOutcome.kind, 'pass');
    });
  }
});
```

## CI Integration

Probe tests live under `packages/engine/test/policy-profile-quality/probes/`.
The engine `test:policy-profile-quality` lane discovers these `*.test.ts`
files through the policy-profile-quality manifest, so the probe runner unit
tests, per-game probe wrappers, architectural probe wrapper, and probe budget
gate run automatically alongside the rest of the profile-quality corpus.
They intentionally stay out of the engine default lane so profile-quality
warnings remain separate from blocking engine invariants.

`probe-budget.test.ts` runs every registered Phase 0 probe through `runProbe()`.
For `occurrence: 'every'` probes, the budget is measured as elapsed milliseconds
per inspected decision; for `first` and `nth` probes, it is measured per probe
run. The soft budget is 200 ms per budget unit and emits
`POLICY_PROFILE_QUALITY_REGRESSION` when exceeded. A hard overrun above 10x the
budget fails the test.

`runProbe()` defaults policy-agent traces to `traceLevel: 'summary'`. When an
assertion fails, the runner replays the probe once with `traceLevel: 'verbose'`
and attaches the first matched verbose `PolicyAgentDecisionTrace` to the failure
outcome. Callers may pass `traceLevel: 'verbose'` for direct debugging or
`verboseOnFailure: false` for tests that need to inspect the raw summary result.

To add a new probe, create a module that exports `defineProbe()` objects, import
those probes from a per-game `*.probes.test.ts` wrapper, and register them in
`probe-budget.test.ts` so the cost gate covers the new corpus entry.
