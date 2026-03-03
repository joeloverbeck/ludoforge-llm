import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';

import {
  CARD_SEAT_ORDER_MIN_DISTINCT_SEATS,
  isCardSeatOrderDistinctSeatCountValid,
} from '../../../src/kernel/turn-flow-seat-order-policy.js';
import {
  hasImportWithModuleSubstring,
  parseTypeScriptSource,
  unwrapTypeScriptExpression,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('turn-flow-seat-order-policy', () => {
  it('enforces minimum distinct seat count from primitive input', () => {
    assert.equal(
      isCardSeatOrderDistinctSeatCountValid(CARD_SEAT_ORDER_MIN_DISTINCT_SEATS - 1),
      false,
    );
    assert.equal(
      isCardSeatOrderDistinctSeatCountValid(CARD_SEAT_ORDER_MIN_DISTINCT_SEATS),
      true,
    );
    assert.equal(
      isCardSeatOrderDistinctSeatCountValid(CARD_SEAT_ORDER_MIN_DISTINCT_SEATS + 1),
      true,
    );
  });

  it('keeps the policy module decoupled from seat-resolution type imports', () => {
    const source = readKernelSource('src/kernel/turn-flow-seat-order-policy.ts');
    const sourceFile = parseTypeScriptSource(source, 'turn-flow-seat-order-policy.ts');

    assert.equal(
      hasImportWithModuleSubstring(sourceFile, 'seat-resolution'),
      false,
      'turn-flow-seat-order-policy.ts must not import seat-resolution module types',
    );

    const helperDeclaration = sourceFile.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find(
        (declaration) =>
          ts.isIdentifier(declaration.name)
          && declaration.name.text === 'isCardSeatOrderDistinctSeatCountValid'
          && declaration.initializer !== undefined,
      );

    assert.ok(helperDeclaration?.initializer);
    const initializer = unwrapTypeScriptExpression(helperDeclaration.initializer);
    assert.equal(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer), true);
    if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) {
      return;
    }

    assert.equal(initializer.parameters.length, 1);
    const parameter = initializer.parameters[0];
    assert.ok(parameter && ts.isIdentifier(parameter.name));
    assert.equal(ts.isIdentifier(parameter.name) ? parameter.name.text : '', 'distinctSeatCount');
    assert.equal(parameter.questionToken, undefined);
    assert.equal(parameter.type !== undefined && parameter.type.kind === ts.SyntaxKind.NumberKeyword, true);
  });
});
