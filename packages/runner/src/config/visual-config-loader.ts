import { VisualConfigProvider } from './visual-config-provider.js';
import { VisualConfigSchema, type VisualConfig } from './visual-config-types.js';
export {
  buildRefValidationContext,
  parseVisualConfigStrict,
  type VisualConfigRefError,
  type VisualConfigRefValidationContext,
  validateAndCreateProvider,
  validateVisualConfigRefs,
} from './validate-visual-config-refs.js';

export function loadVisualConfig(rawYaml: unknown): VisualConfig | null {
  if (rawYaml === null || rawYaml === undefined) {
    return null;
  }

  const parsed = VisualConfigSchema.safeParse(rawYaml);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn('Invalid visual config; falling back to defaults.', parsed.error.issues);
  return null;
}

export function createVisualConfigProvider(rawYaml: unknown): VisualConfigProvider {
  return new VisualConfigProvider(loadVisualConfig(rawYaml));
}
