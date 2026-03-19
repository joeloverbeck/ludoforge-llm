import { VisualConfigProvider } from './visual-config-provider.js';
import type { VisualConfig } from './visual-config-types.js';
export {
  buildRefValidationContext,
  type VisualConfigRefError,
  type VisualConfigRefValidationContext,
  parseVisualConfigStrict,
  validateAndCreateProvider,
  validateVisualConfigRefs,
} from './validate-visual-config-refs.js';
import { parseVisualConfigStrict } from './validate-visual-config-refs.js';

export function loadVisualConfig(rawYaml: unknown): VisualConfig | null {
  return parseVisualConfigStrict(rawYaml);
}

export function createVisualConfigProvider(rawYaml: unknown): VisualConfigProvider {
  return new VisualConfigProvider(loadVisualConfig(rawYaml));
}
