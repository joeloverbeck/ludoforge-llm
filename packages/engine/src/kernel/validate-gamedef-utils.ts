export const forEachDefined = <T>(
  items: readonly T[] | null | undefined,
  iteratee: (item: T, index: number) => void,
): void => {
  (items ?? []).forEach(iteratee);
};
