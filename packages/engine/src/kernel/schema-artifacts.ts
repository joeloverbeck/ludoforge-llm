import { z } from 'zod';
import { GameDefSchema, SerializedEvalReportSchema, SerializedGameTraceSchema } from './schemas-core.js';

export const SCHEMA_ARTIFACT_FILENAMES = [
  'GameDef.schema.json',
  'Trace.schema.json',
  'EvalReport.schema.json',
] as const;

export type SchemaArtifactFilename = (typeof SCHEMA_ARTIFACT_FILENAMES)[number];

const withId = (id: SchemaArtifactFilename, schema: Record<string, unknown>): Record<string, unknown> => ({
  ...schema,
  $id: id,
});

const ANON_DEFINITION_REF_PATTERN = /^#\/definitions\/(__schema\d+)$/u;

const stableDefinitionName = (definition: unknown): string => `anon_${fnv1a(canonicalStringify(definition))}`;

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const canonicalStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
};

const renameAnonymousDefinitions = (schema: Record<string, unknown>): Record<string, unknown> => {
  const definitions = schema.definitions;
  if (definitions === undefined || definitions === null || typeof definitions !== 'object' || Array.isArray(definitions)) {
    return schema;
  }

  const definitionEntries = Object.entries(definitions as Record<string, unknown>);
  const keyMapping = new Map<string, string>();
  const usedNames = new Set<string>(definitionEntries.map(([key]) => key).filter((key) => !key.startsWith('__schema')));
  for (const [key, definitionValue] of definitionEntries) {
    if (!key.startsWith('__schema')) {
      continue;
    }
    const baseName = stableDefinitionName(definitionValue);
    let resolvedName = baseName;
    let sequence = 1;
    while (usedNames.has(resolvedName)) {
      sequence += 1;
      resolvedName = `${baseName}_${sequence}`;
    }
    usedNames.add(resolvedName);
    keyMapping.set(key, resolvedName);
  }

  if (keyMapping.size === 0) {
    return schema;
  }

  const rewriteRefs = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => rewriteRefs(entry));
    }
    if (value === null || typeof value !== 'object') {
      if (typeof value !== 'string') {
        return value;
      }
      const refMatch = ANON_DEFINITION_REF_PATTERN.exec(value);
      if (refMatch === null) {
        return value;
      }
      const oldDefinitionKey = refMatch[1];
      if (oldDefinitionKey === undefined) {
        return value;
      }
      const replacement = keyMapping.get(oldDefinitionKey);
      return replacement === undefined ? value : `#/definitions/${replacement}`;
    }
    const next: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      next[key] = rewriteRefs(entryValue);
    }
    return next;
  };

  const rewrittenSchema = rewriteRefs(schema) as Record<string, unknown>;
  const rewrittenDefinitions = rewrittenSchema.definitions as Record<string, unknown>;
  const orderedDefinitions = Object.entries(rewrittenDefinitions)
    .map(([key, definitionValue]) => [keyMapping.get(key) ?? key, definitionValue] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((acc, [renamedKey, definitionValue]) => {
      acc[renamedKey] = definitionValue;
      return acc;
    }, {});

  return {
    ...rewrittenSchema,
    definitions: orderedDefinitions,
  };
};

export const buildSchemaArtifactMap = (): Record<SchemaArtifactFilename, Record<string, unknown>> => ({
  'GameDef.schema.json': withId(
    'GameDef.schema.json',
    renameAnonymousDefinitions(z.toJSONSchema(GameDefSchema, { target: 'draft-7' })),
  ),
  'Trace.schema.json': withId(
    'Trace.schema.json',
    renameAnonymousDefinitions(z.toJSONSchema(SerializedGameTraceSchema, { target: 'draft-7' })),
  ),
  'EvalReport.schema.json': withId(
    'EvalReport.schema.json',
    renameAnonymousDefinitions(z.toJSONSchema(SerializedEvalReportSchema, { target: 'draft-7' })),
  ),
});
