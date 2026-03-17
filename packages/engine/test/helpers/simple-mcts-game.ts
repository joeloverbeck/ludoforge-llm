/**
 * Minimal self-contained game definition for MCTS testing.
 *
 * Produces ~10 legal moves at each decision point: some classified as
 * `ready` (no-param actions) and some as `pending` (template actions with
 * params). Terminal condition is reachable (first player to 10 VP wins).
 *
 * Created for 64MCTSPEROPT-005 (Phase 2 differential tests and baselines).
 */
import {
  asActionId,
  assertValidatedGameDef,
  type GameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';

let cachedDef: ValidatedGameDef | null = null;

/**
 * Create a simple 2-player resource game for MCTS testing.
 *
 * Actions:
 * - 6 no-param actions (classify as `ready`)
 * - 2 param actions with intsInRange domains (classify as `pending`)
 *
 * Total: ~8 legal moves per decision point.
 */
export function createSimpleMctsGameDef(): ValidatedGameDef {
  if (cachedDef !== null) return cachedDef;

  const phase = ['main'];

  const def: GameDef = {
    metadata: { id: 'simple-mcts-game', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [
      { name: 'vp', type: 'int', init: 0, min: 0, max: 20 },
      { name: 'gold', type: 'int', init: 5, min: 0, max: 50 },
    ],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      // ── Ready actions (no params) ─────────────────────────────────
      {
        id: asActionId('gather'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'gold', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'gold' }, right: 2 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('mine'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'gold', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'gold' }, right: 3 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('forage'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'gold', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'gold' }, right: 1 } } },
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 1 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('research'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 1 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('scout'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 2 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('develop'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 3 } } },
        ],
        limits: [],
      },
      // ── Pending actions (have params → template moves) ────────────
      {
        id: asActionId('build'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [
          { name: 'target', domain: { query: 'intsInRange', min: 1, max: 5 } },
        ],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 1 } } },
        ],
        limits: [],
      },
      {
        id: asActionId('invest'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [
          { name: 'amount', domain: { query: 'intsInRange', min: 1, max: 3 } },
        ],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { op: '+', left: { ref: 'pvar', player: 'actor', var: 'vp' }, right: 2 } } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: 'active', var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: 'active' },
        },
      ],
      scoring: {
        method: 'highest',
        value: { ref: 'pvar', player: 'active', var: 'vp' },
      },
    },
  } as unknown as GameDef;

  cachedDef = assertValidatedGameDef(def);
  return cachedDef;
}
