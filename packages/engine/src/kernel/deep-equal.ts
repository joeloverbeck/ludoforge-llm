const areArraysEqual = (
  left: readonly unknown[],
  right: readonly unknown[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!deepEqual(left[index], right[index])) {
      return false;
    }
  }
  return true;
};

const areTypedArraysEqual = (
  left: ArrayBufferView,
  right: ArrayBufferView,
): boolean => {
  if (left.constructor !== right.constructor || left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < leftBytes.length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return false;
    }
  }
  return true;
};

const areObjectsEqual = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => {
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!deepEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
};

export const deepEqual = (
  left: unknown,
  right: unknown,
): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && areArraysEqual(left, right);
  }
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (left instanceof RegExp || right instanceof RegExp) {
    return left instanceof RegExp && right instanceof RegExp && left.source === right.source && left.flags === right.flags;
  }
  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    return ArrayBuffer.isView(left) && ArrayBuffer.isView(right) && areTypedArraysEqual(left, right);
  }
  return areObjectsEqual(left as Record<string, unknown>, right as Record<string, unknown>);
};
