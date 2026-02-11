# FITL Data Assets

This directory is reserved for optional FITL fixture/reference data assets.

## Conventions
- Store assets under subfolders by domain (for example: `map/`, `scenarios/`).
- Prefer envelope shape compatible with shared validators (`id`, `kind`, `payload`).
- Prefer stable ids and deterministic ordering for arrays/maps that influence runtime behavior.

## Scope
- Canonical executable FITL data must be representable in Game Spec YAML (evolution-visible input).
- Files under `data/fitl/...` are fixtures/reference artifacts and must not be a required dependency for compiling/running evolved specs.
