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

export const resolveBindingTemplate = (template: string, bindings: BindingMap): string => {
  // Fast path: skip regex when template has no binding placeholders.
  // In Texas Hold'em, 100% of templates are plain strings.
  if (template.indexOf('{') === -1) return template;
  return template.replace(/\{([^{}]+)\}/g, (match, rawName: string) => {
    const name = rawName.trim();
    const value = bindings[name];
    if (value === undefined) {
      return match;
    }
    const keyPart = toKeyPart(value);
    return keyPart ?? match;
  });
};

