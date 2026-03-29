const TEMPLATE_TOKEN_PATTERN = /\{([^}]+)\}/g;

export function applyDetailTemplate(
  template: string,
  factors: Readonly<Record<string, number>>,
  contribution: number,
): string {
  return template.replace(TEMPLATE_TOKEN_PATTERN, (match, key: string) => {
    if (key === 'contribution') {
      return String(contribution);
    }

    const value = factors[key];
    return value === undefined ? match : String(value);
  });
}
