#!/usr/bin/env bash
# Correctness guard for fitl-perf-optimization campaign.
# Runs typecheck + lint as a defense-in-depth layer.
# (Build + tests are already covered by harness.sh's regression gate.)
set -eo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"
pnpm turbo typecheck lint
