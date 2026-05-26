import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERF_BASELINE_LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const PERF_BASELINE_DIR = resolve(PERF_BASELINE_LIB_DIR, '..');
export const ENGINE_ROOT = resolve(PERF_BASELINE_DIR, '..', '..');
export const REPO_ROOT = resolve(ENGINE_ROOT, '..', '..');
export const REPORT_ROOT = resolve(process.env.PERF_BASELINE_REPORT_ROOT ?? resolve(REPO_ROOT, 'reports', 'perf-baseline'));
