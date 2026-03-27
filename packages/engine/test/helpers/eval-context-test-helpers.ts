import {
  createCollector,
  createEvalContext as createKernelEvalContext,
  createEvalRuntimeResources,
  type ReadContext,
  type EvalRuntimeResources,
  type ExecutionCollector,
} from '../../src/kernel/index.js';

interface EvalRuntimeResourceTestOptions {
  readonly collector?: ExecutionCollector;
}

type EvalContextTestInput = Omit<
  ReadContext,
  'collector' | 'resources' | 'runtimeTableIndex' | 'freeOperationOverlay' | 'maxQueryResults'
> & {
  readonly resources?: EvalRuntimeResources;
  readonly collector?: ExecutionCollector;
  readonly runtimeTableIndex?: ReadContext['runtimeTableIndex'];
  readonly freeOperationOverlay?: ReadContext['freeOperationOverlay'];
  readonly maxQueryResults?: ReadContext['maxQueryResults'];
};

export const makeEvalRuntimeResources = (options?: EvalRuntimeResourceTestOptions): EvalRuntimeResources =>
  createEvalRuntimeResources({
    collector: options?.collector ?? createCollector(),
  });

export const makeEvalContext = ({
  resources,
  collector,
  ...context
}: EvalContextTestInput): ReadContext => {
  const runtimeResources = resources ?? makeEvalRuntimeResources({
    ...(collector === undefined ? {} : { collector }),
  });
  return createKernelEvalContext({
    ...context,
    resources: runtimeResources,
  });
};
