import {
  createCollector,
  createEvalContext as createKernelEvalContext,
  createEvalRuntimeResources,
  createQueryRuntimeCache,
  type EvalContext,
  type EvalRuntimeResources,
  type ExecutionCollector,
  type QueryRuntimeCache,
} from '../../src/kernel/index.js';

interface EvalRuntimeResourceTestOptions {
  readonly collector?: ExecutionCollector;
  readonly queryRuntimeCache?: QueryRuntimeCache;
}

type EvalContextTestInput = Omit<EvalContext, 'collector' | 'queryRuntimeCache' | 'resources'> & {
  readonly resources?: EvalRuntimeResources;
  readonly collector?: ExecutionCollector;
  readonly queryRuntimeCache?: QueryRuntimeCache;
};

export const makeEvalRuntimeResources = (options?: EvalRuntimeResourceTestOptions): EvalRuntimeResources =>
  createEvalRuntimeResources({
    collector: options?.collector ?? createCollector(),
    queryRuntimeCache: options?.queryRuntimeCache ?? createQueryRuntimeCache(),
  });

export const makeEvalContext = ({
  resources,
  collector,
  queryRuntimeCache,
  ...context
}: EvalContextTestInput): EvalContext => {
  const runtimeResources = resources ?? makeEvalRuntimeResources({
    ...(collector === undefined ? {} : { collector }),
    ...(queryRuntimeCache === undefined ? {} : { queryRuntimeCache }),
  });
  return createKernelEvalContext({
    ...context,
    resources: runtimeResources,
  });
};
