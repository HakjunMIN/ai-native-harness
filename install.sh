#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf 'Installation failed: %s\n' "$*" >&2
  exit 1
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  fail 'Usage: bash install.sh TARGET [LOCAL_SOURCE]'
fi

target=$(cd "$1" && pwd -P) || fail "Target directory not found: $1"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
cache_dir=${AI_NATIVE_SDLC_CACHE_DIR:-"${HOME}/.cache/ai-native-sdlc"}
repo_url=${AI_NATIVE_SDLC_REPO_URL:-git@github.com:HakjunMIN/ai-native-harness.git}
ref=${AI_NATIVE_SDLC_REF:-main}
[[ "$ref" =~ ^[a-zA-Z0-9._-]+$ && "$ref" != "." && "$ref" != ".." ]] ||
  fail "Invalid source ref: $ref"

stage=
temp_dir=
success=0
created_paths=()
created_dirs=()
cleanup() {
  local i
  if [[ $success -eq 0 ]]; then
    for ((i=${#created_paths[@]}-1; i>=0; i--)); do
      rm -f "${created_paths[i]}"
    done
    for ((i=${#created_dirs[@]}-1; i>=0; i--)); do
      rmdir "${created_dirs[i]}"
    done
  fi
  if [[ -n "$stage" ]]; then rm -rf "$stage"; fi
  if [[ -n "$temp_dir" ]]; then rm -rf "$temp_dir"; fi
}
trap cleanup EXIT

if [[ $# -eq 2 ]]; then
  source_dir=$(cd "$2" && pwd -P) || fail "Source directory not found: $2"
elif [[ "$script_dir" != "$target" && -f "$script_dir/skills/sdlc/SKILL.md" &&
        -f "$script_dir/hooks/gate-guard.sh" ]]; then
  source_dir=$script_dir
else
  command -v git >/dev/null 2>&1 || fail 'git is required to download the harness'
  mkdir -p "$cache_dir"
  cache_dir=$(cd "$cache_dir" && pwd -P)
  source_dir="$cache_dir/$ref"
  if [[ ! -e "$source_dir" && ! -L "$source_dir" ]]; then
    stage=$(mktemp -d "$cache_dir/.download.XXXXXX")
    git clone --quiet --depth 1 --branch "$ref" "$repo_url" "$stage/source" ||
      fail "Could not download $repo_url at $ref"
    [[ ! -e "$source_dir" && ! -L "$source_dir" ]] ||
      fail "Source cache was created concurrently: $source_dir"
    mv "$stage/source" "$source_dir"
  fi
  [[ -d "$source_dir/.git" ]] || fail "Invalid source cache: $source_dir"
  [[ $(git -C "$source_dir" remote get-url origin) == "$repo_url" ]] ||
    fail "Source cache uses another repository: $source_dir"
  source_dir=$(cd "$source_dir" && pwd -P)
fi

for dir in skills agents hooks scripts templates; do
  [[ -d "$source_dir/$dir" ]] || fail "Missing harness directory: $dir"
done
for path in hooks/guard.mjs hooks/session.mjs hooks/gate-guard.sh hooks/session-start.sh \
  scripts/state.mjs templates/state.json; do
  [[ -f "$source_dir/$path" ]] || fail "Missing harness asset: $path"
done
[[ "$source_dir" != "$target" && "$target/" != "$source_dir/"* &&
   "$source_dir/" != "$target/"* ]] ||
  fail 'Source and target must be separate directories'

json_string() {
  local value=$1 char code i
  local LC_ALL=C
  REPLY='"'
  for ((i=0; i<${#value}; i++)); do
    char=${value:i:1}
    case "$char" in
      '"') REPLY+='\"' ;;
      '\') REPLY+='\\' ;;
      $'\n') REPLY+='\n' ;;
      $'\r') REPLY+='\r' ;;
      $'\t') REPLY+='\t' ;;
      *)
        printf -v code '%d' "'$char"
        if ((code >= 0 && code < 32)); then
          printf -v char '\\u%04x' "$code"
        fi
        REPLY+="$char"
        ;;
    esac
  done
  REPLY+='"'
}

shell_quote() {
  local value=$1 char i
  REPLY="'"
  for ((i=0; i<${#value}; i++)); do
    char=${value:i:1}
    if [[ "$char" == "'" ]]; then REPLY+="'\\''"; else REPLY+="$char"; fi
  done
  REPLY+="'"
}

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ai-native-install.XXXXXX")
paths=()
kinds=()
values=()
add_link() {
  paths+=("$1")
  kinds+=('link')
  values+=("$2")
}
add_file() {
  paths+=("$1")
  kinds+=('file')
  values+=("$2")
}

root="$target/.ai-native-sdlc"
add_link "$root" "$source_dir"
skill_count=0
for skill in "$source_dir"/skills/*; do
  [[ -f "$skill/SKILL.md" ]] || continue
  name=${skill##*/}
  add_link "$target/.agents/skills/$name" "../../.ai-native-sdlc/skills/$name"
  ((skill_count+=1))
done
((skill_count > 0)) || fail 'Harness has no skills'

agent_count=0
for agent in "$source_dir"/agents/*.agent.md; do
  [[ -f "$agent" ]] || continue
  name=${agent##*/}
  add_link "$target/.github/agents/$name" "../../.ai-native-sdlc/agents/$name"
  title=$(sed -n 's/^name: *//p' "$agent" | head -n 1)
  description=$(sed -n 's/^description: *//p' "$agent" | head -n 1)
  [[ -n "$title" && -n "$description" ]] || fail "Invalid agent profile: $name"
  profile="$root/agents/$name"
  instructions="Read $profile before acting and follow its role instructions. Respect the host's actual tools and permissions; Markdown tools metadata does not configure Codex permissions."
  json_string "$title"; title_json=$REPLY
  json_string "$description"; description_json=$REPLY
  json_string "$instructions"; instructions_json=$REPLY
  config="$temp_dir/agent-$agent_count.toml"
  printf 'name = %s\ndescription = %s\ndeveloper_instructions = %s\n' \
    "$title_json" "$description_json" "$instructions_json" > "$config"
  add_file "$target/.codex/agents/${name%.agent.md}.toml" "$config"
  ((agent_count+=1))
done
((agent_count > 0)) || fail 'Harness has no agents'

shell_quote "$root/hooks/session-start.sh"; start_cmd="bash $REPLY"
shell_quote "$root/hooks/gate-guard.sh"; guard_cmd="bash $REPLY"
json_string "$start_cmd copilot"; copilot_start=$REPLY
json_string "$guard_cmd copilot"; copilot_guard=$REPLY
json_string "$start_cmd codex"; codex_start=$REPLY
json_string "$guard_cmd codex"; codex_guard=$REPLY

cat > "$temp_dir/copilot.json" <<EOF
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": $copilot_start,
        "timeoutSec": 10
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": $copilot_guard,
        "timeoutSec": 10
      }
    ]
  }
}
EOF
add_file "$target/.github/hooks/ai-native-sdlc.json" "$temp_dir/copilot.json"
cat > "$temp_dir/codex.json" <<EOF
{
  "description": "ai-native-sdlc project hooks",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": $codex_start,
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": $codex_guard,
            "timeout": 10
          }
        ]
      }
    ]
  }
}
EOF
add_file "$target/.codex/hooks.json" "$temp_dir/codex.json"

for ((i=0; i<${#paths[@]}; i++)); do
  path=${paths[i]}
  parent=${path%/*}
  while [[ "$parent" != "$target" ]]; do
    if [[ -L "$parent" || ( -e "$parent" && ! -d "$parent" ) ]]; then
      fail "Conflict at parent: $parent"
    fi
    parent=${parent%/*}
    [[ -n "$parent" ]] || fail "Path outside target: $path"
  done
  if [[ -e "$path" || -L "$path" ]]; then
    if [[ ${kinds[i]} == 'link' ]]; then
      if [[ "$path" == "$root" ]]; then
        [[ -L "$path" && -d "$path" && $(cd "$path" && pwd -P) == "$source_dir" ]] ||
          fail "Conflict at existing path: $path"
      else
        [[ -L "$path" && -e "$path" && $(readlink "$path") == "${values[i]}" ]] ||
          fail "Conflict at existing path: $path"
      fi
    else
      [[ -f "$path" && ! -L "$path" ]] && cmp -s "$path" "${values[i]}" ||
        fail "Conflict at existing path: $path"
    fi
  fi
done

for ((i=0; i<${#paths[@]}; i++)); do
  path=${paths[i]}
  [[ -e "$path" || -L "$path" ]] && continue
  parent=${path%/*}
  missing=()
  while [[ ! -d "$parent" ]]; do
    missing+=("$parent")
    parent=${parent%/*}
  done
  for ((j=${#missing[@]}-1; j>=0; j--)); do
    mkdir "${missing[j]}"
    created_dirs+=("${missing[j]}")
  done
  if [[ ${kinds[i]} == 'link' ]]; then
    ln -s "${values[i]}" "$path"
    created_paths+=("$path")
  else
    created_paths+=("$path")
    cp "${values[i]}" "$path"
  fi
done
success=1
printf 'Installed %d harness entries in %s\n' "${#paths[@]}" "$target"
