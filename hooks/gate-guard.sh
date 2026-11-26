#!/usr/bin/env bash
set -euo pipefail
hook_dir=$(cd "$(dirname "$0")" && pwd)
source "$hook_dir/node-runtime.sh"
exec "$NODE_BIN" "$hook_dir/guard.mjs" "${1:-copilot}"
