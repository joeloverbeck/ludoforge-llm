// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectVariableIdentifiersByInitializer,
  hasDirectNamedImport,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';
import { createSequenceContextMismatchTurnOrderState } from '../../helpers/free-operation-sequence-context-fixtures.js';
import {
  collectTurnFlowFreeOperationGrantContractViolations,
  TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE,
} from '../../../src/contracts/turn-flow-free-operation-grant-contract.js';
import { FreeOperationSequenceContextSchema } from '../../../src/kernel/free-operation-sequence-context-schema.js';
import { EffectASTSchema } from '../../../src/kernel/schemas-ast.js';
import { EFFECT_KIND_TAG } from '../../../src/kernel/types-ast.js';
import { EventCardFreeOperationGrantSchema, TurnFlowRuntimeStateSchema } from '../../../src/kernel/schemas-extensions.js';

const canonicalSchemaModuleSpecifier = './free-operation-sequence-context-schema.js';
const canonicalContractModuleSpecifier = './free-operation-sequence-context-contract.js';

const readSourceFile = (relativePath: string, fileName: string) =>
  parseTypeScriptSource(readKernelSource(relativePath), fileName);

describe('free-operation sequence-context canonical schema contract', () => {
  it('requires AST and event schema modules to import the canonical sequence-context schema', () => {
    const astSource = readSourceFile('src/kernel/schemas-ast.ts', 'schemas-ast.ts');
    const extensionsSource = readSourceFile('src/kernel/schemas-extensions.ts', 'schemas-extensions.ts');

    assert.equal(
      hasDirectNamedImport(astSource, canonicalSchemaModuleSpecifier, 'FreeOperationSequenceContextSchema'),
      true,
      'schemas-ast.ts must import FreeOperationSequenceContextSchema from the canonical module',
    );
    assert.equal(
      hasDirectNamedImport(extensionsSource, canonicalSchemaModuleSpecifier, 'FreeOperationSequenceContextSchema'),
      true,
      'schemas-extensions.ts must import FreeOperationSequenceContextSchema from the canonical module',
    );
  });

  it('requires validate-events to import the canonical structural grant helper', () => {
    const eventsSource = readSourceFile('src/kernel/validate-events.ts', 'validate-events.ts');

    assert.equal(
      hasDirectNamedImport(eventsSource, canonicalContractModuleSpecifier, 'FreeOperationSequenceContextGrantLike'),
      true,
      'validate-events.ts must import FreeOperationSequenceContextGrantLike from the canonical contract module',
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

  it('forbids reintroducing local SequenceContextGrantLike definitions in validate-events', () => {
    const source = readKernelSource('src/kernel/validate-events.ts');

    assert.equal(
      /interface\s+SequenceContextGrantLike\b/u.test(source),
      false,
      'validate-events.ts must not redeclare SequenceContextGrantLike locally',
    );
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
          _k: EFFECT_KIND_TAG.grantFreeOperation,
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            sequence: { batch: 'ctx-chain', step: 0 },
            sequenceContext,
          },
        }).success,
        true,
      );
      assert.equal(
        EventCardFreeOperationGrantSchema.safeParse({
          seat: '0',
          operationClass: 'operation',
          sequence: { batch: 'ctx-chain', step: 0 },
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
          _k: EFFECT_KIND_TAG.grantFreeOperation,
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            sequence: { batch: 'ctx-chain', step: 0 },
            sequenceContext,
          },
        }).success,
        false,
      );
      assert.equal(
        EventCardFreeOperationGrantSchema.safeParse({
          seat: '0',
          operationClass: 'operation',
          sequence: { batch: 'ctx-chain', step: 0 },
          sequenceContext,
        }).success,
        false,
      );
    }
  });

  it('keeps malformed sequenceContext wording aligned between the schema and shared grant contract', () => {
    const schemaResult = FreeOperationSequenceContextSchema.safeParse({});
    assert.equal(schemaResult.success, false);

    const violation = collectTurnFlowFreeOperationGrantContractViolations({
      operationClass: 'operation',
      sequence: { step: 0 },
      sequenceContext: {},
    }).find((entry) => entry.code === 'sequenceContextInvalid');

    assert.ok(violation);
    assert.equal(schemaResult.error.issues[0]?.message, TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE);
    assert.equal(violation.message, TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE);
  });

  it('requires canonical runtime batch context fields on turn-flow runtime state', () => {
    const runtime = createSequenceContextMismatchTurnOrderState().runtime;
    assert.equal(TurnFlowRuntimeStateSchema.safeParse(runtime).success, true);

    const missingProgressionPolicy = {
      ...runtime,
      freeOperationSequenceContexts: {
        batch0: {
          capturedMoveZonesByKey: {},
          skippedStepIndices: [],
        },
      },
    };
    assert.equal(TurnFlowRuntimeStateSchema.safeParse(missingProgressionPolicy).success, false);

    const missingSkippedStepIndices = {
      ...runtime,
      freeOperationSequenceContexts: {
        batch0: {
          capturedMoveZonesByKey: {},
          progressionPolicy: 'strictInOrder',
        },
      },
    };
    assert.equal(TurnFlowRuntimeStateSchema.safeParse(missingSkippedStepIndices).success, false);

    const negativeSkippedIndex = {
      ...runtime,
      freeOperationSequenceContexts: {
        batch0: {
          capturedMoveZonesByKey: {},
          progressionPolicy: 'implementWhatCanInOrder',
          skippedStepIndices: [-1],
        },
      },
    };
    assert.equal(TurnFlowRuntimeStateSchema.safeParse(negativeSkippedIndex).success, false);
  });
});
