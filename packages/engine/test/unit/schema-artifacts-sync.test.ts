import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { SCHEMA_ARTIFACT_FILENAMES, buildSchemaArtifactMap } from '../../src/kernel/schema-artifacts.js';

describe('schema artifact synchronization', () => {
  it('matches canonical schemas generated from source contracts', () => {
    const generated = buildSchemaArtifactMap();
    for (const filename of SCHEMA_ARTIFACT_FILENAMES) {
      const schemaPath = path.join(process.cwd(), 'schemas', filename);
      const artifact = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
      assert.deepEqual(artifact, generated[filename], filename);
    }
  });

  it('uses deterministic definition names instead of volatile __schemaN keys', () => {
    const generated = buildSchemaArtifactMap();
    for (const filename of SCHEMA_ARTIFACT_FILENAMES) {
      const serialized = JSON.stringify(generated[filename]);
      assert.equal(serialized.includes('__schema'), false, filename);
    }
  });
});
