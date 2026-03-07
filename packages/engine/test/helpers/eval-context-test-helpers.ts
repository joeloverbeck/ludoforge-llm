import {
  createCollector,
  createEvalContext as createKernelEvalContext,
  createEvalRuntimeResources,
  type EvalContext,
  type EvalRuntimeResources,
  type ExecutionCollector,
} from '../../src/kernel/index.js';

interface EvalRuntimeResourceTestOptions {
  readonly collector?: ExecutionCollector;
}

type EvalContextTestInput = Omit<EvalContext, 'collector' | 'resources'> & {
  readonly resources?: EvalRuntimeResources;
  readonly collector?: ExecutionCollector;
};

export const makeEvalRuntimeResources = (options?: EvalRuntimeResourceTestOptions): EvalRuntimeResources =>
  createEvalRuntimeResources({
    collector: options?.collector ?? createCollector(),
  });

export const makeEvalContext = ({
  resources,
  collector,
  ...context
}: EvalContextTestInput): EvalContext => {
  const runtimeResources = resources ?? makeEvalRuntimeResources({
    ...(collector === undefined ? {} : { collector }),
  });
  return createKernelEvalContext({
    ...context,
    resources: runtimeResources,
  });
};
