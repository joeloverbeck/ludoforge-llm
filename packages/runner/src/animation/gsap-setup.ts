export interface GsapPlugin {
  readonly name?: string;
}

export interface GsapDefaults {
  readonly ease: string;
  readonly overwrite: 'auto' | false;
}

export interface GsapLike {
  registerPlugin(...plugins: readonly GsapPlugin[]): void;
  defaults(config: GsapDefaults): void;
}

export interface GsapRuntime {
  readonly gsap: GsapLike;
  readonly PixiPlugin: GsapPlugin;
}

export const DEFAULT_GSAP_CONFIG: GsapDefaults = {
  ease: 'power2.out',
  overwrite: 'auto',
};

let configuredRuntime: GsapRuntime | null = null;

export function configureGsapRuntime(runtime: GsapRuntime): GsapLike {
  if (configuredRuntime !== null) {
    if (configuredRuntime !== runtime) {
      throw new Error('GSAP runtime already configured with a different instance.');
    }
    return configuredRuntime.gsap;
  }

  runtime.gsap.registerPlugin(runtime.PixiPlugin);
  runtime.gsap.defaults(DEFAULT_GSAP_CONFIG);
  configuredRuntime = runtime;
  return runtime.gsap;
}

export function getGsapRuntime(): GsapLike {
  if (configuredRuntime === null) {
    throw new Error('GSAP runtime has not been configured.');
  }
  return configuredRuntime.gsap;
}

export function isGsapRuntimeConfigured(): boolean {
  return configuredRuntime !== null;
}

export function resetGsapRuntimeForTests(): void {
  configuredRuntime = null;
}

