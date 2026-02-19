import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';

describe('card animation metadata compilation', () => {
  it('compiles metadata selectors into concrete card token ids and zone roles', () => {
    const parsed = parseGameSpec(`
# Card Animation Valid
\`\`\`yaml
metadata:
  id: card-animation-valid
  players: { min: 2, max: 2 }
  cardAnimation:
    cardTokenTypes:
      ids: [joker]
      idPrefixes: [card-]
    zoneRoles:
      draw: [deck]
      hand: [hand]
      shared: [table]
      burn: [burn]
      discard: [muck]
zones:
  - { id: deck, owner: none, visibility: hidden, ordering: stack }
  - { id: hand, owner: player, visibility: owner, ordering: set }
  - { id: table, owner: none, visibility: public, ordering: set }
  - { id: burn, owner: none, visibility: hidden, ordering: set }
  - { id: muck, owner: none, visibility: hidden, ordering: set }
tokenTypes:
  - { id: card-AS, props: {} }
  - { id: card-KS, props: {} }
  - { id: joker, props: {} }
turnStructure:
  phases: [{ id: main }]
actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 1 }
      result: { type: draw }
\`\`\`
`);
    assertNoErrors(parsed);

    const validation = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.equal(validation.some((diagnostic) => diagnostic.severity === 'error'), false);

    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(compiled.gameDef?.cardAnimation, {
      cardTokenTypeIds: ['card-AS', 'card-KS', 'joker'],
      zoneRoles: {
        draw: ['deck:none'],
        hand: ['hand:0', 'hand:1'],
        shared: ['table:none'],
        burn: ['burn:none'],
        discard: ['muck:none'],
      },
    });
  });

  it('rejects singleton role conflicts deterministically', () => {
    const parsed = parseGameSpec(`
# Card Animation Role Conflict
\`\`\`yaml
metadata:
  id: card-animation-role-conflict
  players: { min: 2, max: 2 }
  cardAnimation:
    cardTokenTypes:
      idPrefixes: [card-]
    zoneRoles:
      draw: [deckA, deckB]
      hand: [hand]
      shared: [table]
      burn: [burn]
      discard: [muck]
zones:
  - { id: deckA, owner: none, visibility: hidden, ordering: stack }
  - { id: deckB, owner: none, visibility: hidden, ordering: stack }
  - { id: hand, owner: player, visibility: owner, ordering: set }
  - { id: table, owner: none, visibility: public, ordering: set }
  - { id: burn, owner: none, visibility: hidden, ordering: set }
  - { id: muck, owner: none, visibility: hidden, ordering: set }
tokenTypes:
  - { id: card-AS, props: {} }
turnStructure:
  phases: [{ id: main }]
actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 1 }
      result: { type: draw }
\`\`\`
`);
    assertNoErrors(parsed);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.equal(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_CARD_ANIMATION_SINGLETON_ROLE_CONFLICT'),
      true,
    );
  });

  it('rejects malformed selector shapes in validator diagnostics', () => {
    const parsed = parseGameSpec(`
# Card Animation Invalid Selectors
\`\`\`yaml
metadata:
  id: card-animation-invalid-selectors
  players: { min: 2, max: 2 }
  cardAnimation:
    cardTokenTypes:
      idPrefixes: card-
    zoneRoles:
      draw: [deck]
      hand: [hand]
      shared: [table]
      burn: [burn]
      discard: [muck]
zones:
  - { id: deck, owner: none, visibility: hidden, ordering: stack }
  - { id: hand, owner: player, visibility: owner, ordering: set }
  - { id: table, owner: none, visibility: public, ordering: set }
  - { id: burn, owner: none, visibility: hidden, ordering: set }
  - { id: muck, owner: none, visibility: hidden, ordering: set }
turnStructure:
  phases: [{ id: main }]
actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 1 }
      result: { type: draw }
\`\`\`
`);
    assertNoErrors(parsed);
    const diagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_CARD_ANIMATION_TOKEN_PREFIXES_INVALID'),
      true,
    );
  });

  it('rejects unknown card animation zone roles', () => {
    const parsed = parseGameSpec(`
# Card Animation Unknown Role
\`\`\`yaml
metadata:
  id: card-animation-unknown-role
  players: { min: 2, max: 2 }
  cardAnimation:
    cardTokenTypes:
      idPrefixes: [card-]
    zoneRoles:
      draw: [deck]
      hand: [hand]
      shared: [table]
      burn: [burn]
      discard: [muck]
      tableau: [table]
zones:
  - { id: deck, owner: none, visibility: hidden, ordering: stack }
  - { id: hand, owner: player, visibility: owner, ordering: set }
  - { id: table, owner: none, visibility: public, ordering: set }
  - { id: burn, owner: none, visibility: hidden, ordering: set }
  - { id: muck, owner: none, visibility: hidden, ordering: set }
turnStructure:
  phases: [{ id: main }]
actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 1 }
      result: { type: draw }
\`\`\`
`);
    assertNoErrors(parsed);
    const diagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.equal(
      diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_VALIDATOR_UNKNOWN_KEY'
        && diagnostic.path === 'doc.metadata.cardAnimation.zoneRoles.tableau'),
      true,
    );
  });

  it('non-card fixture compiles without requiring card animation metadata', () => {
    const parsed = parseGameSpec(readCompilerFixture('compile-valid.md'));
    assertNoErrors(parsed);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assertNoErrors(compiled);
    assert.equal(compiled.gameDef?.cardAnimation, undefined);
  });
});
