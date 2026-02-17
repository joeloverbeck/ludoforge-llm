type BindingMap = Readonly<Record<string, unknown>>;

const isObjectWithId = (value: unknown): value is { readonly id: string } =>
  typeof value === 'object' && value !== null && 'id' in value && typeof (value as { readonly id?: unknown }).id === 'string';

const toKeyPart = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isObjectWithId(value)) {
    return value.id;
  }
  return null;
};

export const resolveBindingTemplate = (template: string, bindings: BindingMap): string =>
  template.replace(/\{([^{}]+)\}/g, (match, rawName: string) => {
    const name = rawName.trim();
    const value = bindings[name];
    if (value === undefined) {
      return match;
    }
    const keyPart = toKeyPart(value);
    return keyPart ?? match;
  });

