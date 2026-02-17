export function countCombinations(n: number, k: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }

  const m = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= m; index += 1) {
    result = (result * (n - m + index)) / index;
    if (!Number.isSafeInteger(result)) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  return result;
}

export function* combinations<TValue>(
  items: readonly TValue[],
  k: number,
): Generator<readonly TValue[], void, void> {
  if (!Number.isSafeInteger(k) || k < 0 || k > items.length) {
    return;
  }

  if (k === 0) {
    yield [];
    return;
  }

  const indices = Array.from({ length: k }, (_, index) => index);
  while (true) {
    yield indices.map((index) => items[index]!);

    let cursor = k - 1;
    while (cursor >= 0 && indices[cursor] === items.length - k + cursor) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return;
    }

    indices[cursor] = (indices[cursor] ?? 0) + 1;
    for (let next = cursor + 1; next < k; next += 1) {
      indices[next] = indices[next - 1]! + 1;
    }
  }
}
