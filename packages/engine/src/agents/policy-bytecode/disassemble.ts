import {
  OPCODE_NAMES,
  Opcode,
  type PolicyBytecode,
} from '../../cnl/policy-bytecode/index.js';

const SINGLE_OPERAND_OPS = new Set<Opcode>([
  Opcode.LOAD_FEATURE,
  Opcode.LOAD_CONST,
  Opcode.JUMP_IF_FALSE,
  Opcode.RESOLVE_REF,
  Opcode.RESOLVE_DYNAMIC,
]);

export function disassemble(bytecode: PolicyBytecode): string {
  const lines: string[] = [];
  const instructions = Array.from(bytecode.instructions);

  for (let offset = 0; offset < instructions.length;) {
    const opcode = instructions[offset] as Opcode;
    const name = OPCODE_NAMES[opcode] ?? `UNKNOWN_${instructions[offset]}`;
    const operandCount = SINGLE_OPERAND_OPS.has(opcode) ? 1 : 0;
    const operands = instructions.slice(offset + 1, offset + 1 + operandCount);
    lines.push(formatLine(offset, name, operands, bytecode));
    offset += 1 + operandCount;
  }

  return lines.join('\n');
}

function formatLine(
  offset: number,
  name: string,
  operands: readonly number[],
  bytecode: PolicyBytecode,
): string {
  const suffix = operands.length === 0 ? '' : ` ${operands.join(' ')}`;
  const comment = formatComment(name, operands, bytecode);
  return `${offset.toString().padStart(4, '0')}: ${name}${suffix}${comment}`;
}

function formatComment(name: string, operands: readonly number[], bytecode: PolicyBytecode): string {
  if (name === 'LOAD_FEATURE') {
    const operand = operands[0];
    const ref = operand === undefined ? undefined : bytecode.featureTable.refs[operand];
    return ref === undefined ? '' : ` ; ${ref.kind}:${ref.layoutIndex}:${ref.aux.join(',')}`;
  }
  if (name === 'LOAD_CONST') {
    const operand = operands[0];
    const value = operand === undefined ? undefined : bytecode.constants[operand];
    return value === undefined ? '' : ` ; const=${value}`;
  }
  if (name === 'RESOLVE_DYNAMIC') {
    return ' ; dynamic fallback';
  }
  return '';
}
