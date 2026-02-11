# FITL Data Assets

This directory is reserved for versioned FITL data assets consumed by generic loaders.

## Conventions
- Store assets under subfolders by domain (for example: `map/`, `scenarios/`).
- Use explicit envelope fields: `id`, `version`, `kind`, `payload`.
- Keep versions explicit in both filename and envelope `version`.
- Prefer stable ids and deterministic ordering for arrays/maps that influence runtime behavior.

## Scope
- This scaffold intentionally contains no concrete map or scenario payloads.
