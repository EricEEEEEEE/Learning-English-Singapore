#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXT_TELEMETRY_DISABLED=1
export NPM_CONFIG_CACHE="$PWD/tmp/npm-cache"
npm run typecheck
npm run build
npm --prefix tests test
