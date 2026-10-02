#!/usr/bin/env bash
set -euo pipefail

script_dir=
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
fi
if [[ -n "$script_dir" && -f "$script_dir/scripts/install-shared.mjs" ]]; then
  exec node "$script_dir/scripts/install-shared.mjs" "$@"
fi

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
ref=${AI_NATIVE_SDLC_REF:-main}
[[ "$ref" =~ ^[a-zA-Z0-9._-]+$ && "$ref" != '.' && "$ref" != '..' ]] || {
  printf 'Invalid source ref: %s\n' "$ref" >&2
  exit 1
}
url=${AI_NATIVE_SDLC_INSTALLER_URL:-https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/$ref/scripts/install-shared.mjs}
curl -fsSL "$url" -o "$temporary/install-shared.mjs"
node "$temporary/install-shared.mjs" "$@"
