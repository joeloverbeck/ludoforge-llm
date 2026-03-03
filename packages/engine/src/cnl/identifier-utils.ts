export function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}
