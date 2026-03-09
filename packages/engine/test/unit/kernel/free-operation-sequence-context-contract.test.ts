import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectVariableIdentifiersByInitializer,
  hasDirectNamedImport,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';
import { FreeOperationSequenceContextSchema } from '../../../src/kernel/free-operation-sequence-context-schema.js';
import { EffectASTSchema } from '../../../src/kernel/schemas-ast.js';
import { EventCardFreeOperationGrantSchema } from '../../../src/kernel/schemas-extensions.js';

const canonicalModuleSpecifier = './free-operation-sequence-context-schema.js';

const readSourceFile = (relativePath: string, fileName: string) =>
  parseTypeScriptSource(readKernelSource(relativePath), fileName);

describe('free-operation sequence-context canonical schema contract', () => {
  it('requires AST and event schema modules to import the canonical sequence-context schema', () => {
    const astSource = readSourceFile('src/kernel/schemas-ast.ts', 'schemas-ast.ts');
    const extensionsSource = readSourceFile('src/kernel/schemas-extensions.ts', 'schemas-extensions.ts');

    assert.equal(
      hasDirectNamedImport(astSource, canonicalModuleSpecifier, 'FreeOperationSequenceContextSchema'),
      true,
      'schemas-ast.ts must import FreeOperationSequenceContextSchema from the canonical module',
    );
    assert.equal(
      hasDirectNamedImport(extensionsSource, canonicalModuleSpecifier, 'FreeOperationSequenceContextSchema'),
      true,
      'schemas-extensions.ts must import FreeOperationSequenceContextSchema from the canonical module',
    );
  });

  it('forbids reintroducing local FreeOperationSequenceContextSchema definitions in consumer modules', () => {
    const sources = [
      readSourceFile('src/kernel/schemas-ast.ts', 'schemas-ast.ts'),
      readSourceFile('src/kernel/schemas-extensions.ts', 'schemas-extensions.ts'),
    ];

    for (const source of sources) {
      const localDefinitions = collectVariableIdentifiersByInitializer(
        source,
        (initializer) => initializer.getText(source).includes('captureMoveZoneCandidatesAs')
          && initializer.getText(source).includes('requireMoveZoneCandidatesFrom'),
      );

      assert.equal(
        localDefinitions.includes('FreeOperationSequenceContextSchema'),
        false,
        'consumer modules must not redeclare FreeOperationSequenceContextSchema locally',
      );
    }
  });

  it('keeps canonical, AST, and event grant schema acceptance aligned', () => {
    const validContexts = [
      { captureMoveZoneCandidatesAs: 'selected-space' },
      { requireMoveZoneCandidatesFrom: 'selected-space' },
      {
        captureMoveZoneCandidatesAs: 'captured-space',
        requireMoveZoneCandidatesFrom: 'required-space',
      },
    ] as const;

    for (const sequenceContext of validContexts) {
      assert.equal(FreeOperationSequenceContextSchema.safeParse(sequenceContext).success, true);
      assert.equal(
        EffectASTSchema.safeParse({
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            sequence: { chain: 'ctx-chain', step: 0 },
            sequenceContext,
          },
        }).success,
        true,
      );
      assert.equal(
        EventCardFreeOperationGrantSchema.safeParse({
          seat: '0',
          operationClass: 'operation',
          sequence: { chain: 'ctx-chain', step: 0 },
          sequenceContext,
        }).success,
        true,
      );
    }
  });

  it('keeps canonical, AST, and event grant schema rejection aligned for malformed sequence contexts', () => {
    const invalidContexts = [
      {},
      { captureMoveZoneCandidatesAs: '' },
      { requireMoveZoneCandidatesFrom: '' },
      { captureMoveZoneCandidatesAs: 1 },
      { requireMoveZoneCandidatesFrom: true },
      { captureMoveZoneCandidatesAs: 'selected-space', extra: 'nope' },
    ] as const;

    for (const sequenceContext of invalidContexts) {
      assert.equal(FreeOperationSequenceContextSchema.safeParse(sequenceContext).success, false);
      assert.equal(
        EffectASTSchema.safeParse({
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            sequence: { chain: 'ctx-chain', step: 0 },
            sequenceContext,
          },
        }).success,
        false,
      );
      assert.equal(
        EventCardFreeOperationGrantSchema.safeParse({
          seat: '0',
          operationClass: 'operation',
          sequence: { chain: 'ctx-chain', step: 0 },
          sequenceContext,
        }).success,
        false,
      );
    }
  });
});
