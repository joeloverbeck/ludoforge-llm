export interface ResolvedStroke {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
  readonly wavy: boolean;
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
}

export function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function sanitizeUnitInterval(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
