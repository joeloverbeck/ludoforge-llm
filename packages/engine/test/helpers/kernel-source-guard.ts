import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const resolvePath = (relativePath: string): string => {
  const candidates = [join(process.cwd(), relativePath), join(process.cwd(), 'packages/engine', relativePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find kernel source path for guard: ${relativePath}`);
};

export const readKernelSource = (relativePath: string): string => readFileSync(resolvePath(relativePath), 'utf8');

export const listKernelModulesByPrefix = (prefix: string): readonly string[] => {
  const kernelDirCandidates = [join(process.cwd(), 'src/kernel'), join(process.cwd(), 'packages/engine/src/kernel')];
  for (const candidate of kernelDirCandidates) {
    if (existsSync(candidate)) {
      return readdirSync(candidate)
        .filter((name) => name.startsWith(prefix) && name.endsWith('.ts'))
        .sort();
    }
  }

  throw new Error('Could not find kernel source directory for guard');
};

