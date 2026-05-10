# Preview deepening e2e fixture

This fixture records the authored profile shape used by
`test/integration/continued-deepening-e2e.test.ts`.

The test consumes `profile.yaml`, checks it against the compiled synthetic
fixture profile, then runs the generic chooseN ladder through the real policy
agent path. The fixture is intentionally engine-generic: it uses only a
synthetic `chooseN` ladder, victory-margin preview refs, and no production game
identifiers.
