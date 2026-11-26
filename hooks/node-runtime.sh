# Sourced by hook wrappers. Hosts launched from a GUI often lack the login-shell PATH.
NODE_BIN=${AI_NATIVE_SDLC_NODE:-$(command -v node 2>/dev/null || true)}
if [[ -z "$NODE_BIN" ]]; then
  candidates=()
  if [[ -n "${NVM_BIN:-}" ]]; then candidates+=("$NVM_BIN/node"); fi
  candidates+=(/opt/homebrew/bin/node /usr/local/bin/node)
  if [[ -n "${HOME:-}" ]]; then candidates+=("$HOME"/.nvm/versions/node/*/bin/node); fi
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" && -x "$candidate" ]]; then
      NODE_BIN=$candidate
      break
    fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  printf '%s: Node.js not found; set AI_NATIVE_SDLC_NODE to a Node.js 22+ executable\n' "${0##*/}" >&2
  exit 127
fi
if [[ ! -f "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  printf '%s: Node.js is not executable: %s\n' "${0##*/}" "$NODE_BIN" >&2
  exit 127
fi
