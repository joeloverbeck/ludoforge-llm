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

export const buildSchemaArtifactMap = (): Record<SchemaArtifactFilename, Record<string, unknown>> => ({
  'GameDef.schema.json': withId('GameDef.schema.json', z.toJSONSchema(GameDefSchema, { target: 'draft-7' })),
  'Trace.schema.json': withId('Trace.schema.json', z.toJSONSchema(SerializedGameTraceSchema, { target: 'draft-7' })),
  'EvalReport.schema.json': withId(
    'EvalReport.schema.json',
    z.toJSONSchema(SerializedEvalReportSchema, { target: 'draft-7' }),
  ),
});
