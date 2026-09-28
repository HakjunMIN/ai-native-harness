#!/usr/bin/env bash
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/session.mjs" "${1:-copilot}"
