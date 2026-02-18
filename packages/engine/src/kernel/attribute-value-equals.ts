import type { AttributeValue } from './types.js';

export function attributeValueEquals(left: unknown, right: AttributeValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  }
  return left === right;
}
