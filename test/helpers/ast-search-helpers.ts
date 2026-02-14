/* eslint-disable @typescript-eslint/no-explicit-any */
export const findDeep = (obj: any, predicate: (node: any) => boolean): any[] => {
  const results: any[] = [];

  const walk = (node: any): void => {
    if (node === null || node === undefined) return;
    if (predicate(node)) {
      results.push(node);
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };

  walk(obj);
  return results;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
