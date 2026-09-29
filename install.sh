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
target_mode=$(stat -c %a "$target" 2>/dev/null) || target_mode=$(stat -f %Lp "$target")
(( (8#$target_mode & 2) == 0 )) ||
  fail "Insecure world-writable target directory: $target"
script_dir=
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
fi
repo_url=${AI_NATIVE_SDLC_REPO_URL:-https://github.com/HakjunMIN/ai-native-harness.git}
ref=${AI_NATIVE_SDLC_REF:-main}
[[ "$ref" =~ ^[a-zA-Z0-9._-]+$ && "$ref" != "." && "$ref" != ".." ]] ||
  fail "Invalid source ref: $ref"

stage=
lock=
success=0
written=()
backed=()
created_dirs=()
cleanup() {
  local i
  if [[ $success -eq 0 ]]; then
    for ((i=${#written[@]}-1; i>=0; i--)); do
      rm -rf "${written[i]}"
    done
    for ((i=${#backed[@]}-1; i>=0; i--)); do
      mv "$stage/backup/$i" "${backed[i]}"
    done
    for ((i=${#created_dirs[@]}-1; i>=0; i--)); do
      rmdir "${created_dirs[i]}" 2>/dev/null || :
    done
  fi
  if [[ -n "$stage" ]]; then rm -rf "$stage"; fi
  if [[ -n "$lock" ]]; then rmdir "$lock"; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

root="$target/.ai-native-sdlc"
lock_path="$target/.ai-native-sdlc.install-lock"
mkdir "$lock_path" 2>/dev/null || fail "Installation already running or lock exists: $lock_path"
lock=$lock_path
[[ ! -L "$root" ]] ||
  fail "Legacy shared-cache link at $root; remove or migrate it manually before installing"
stage=$(mktemp -d "$target/.ai-native-sdlc.stage.XXXXXX")
if [[ $# -eq 2 ]]; then
  source_dir=$(cd "$2" && pwd -P) || fail "Source directory not found: $2"
elif [[ "$script_dir" != "$target" && -f "$script_dir/skills/sdlc/SKILL.md" &&
        -f "$script_dir/hooks/gate-guard.sh" ]]; then
  source_dir=$script_dir
else
  command -v git >/dev/null 2>&1 || fail 'git is required to download the harness'
  git clone --quiet --depth 1 --branch "$ref" "$repo_url" "$stage/source" ||
    fail "Could not download $repo_url at $ref"
  source_dir="$stage/source"
fi

for dir in skills agents hooks scripts templates; do
  [[ -d "$source_dir/$dir" ]] || fail "Missing harness directory: $dir"
done
for path in hooks/guard.mjs hooks/session.mjs hooks/gate-guard.sh hooks/session-start.sh \
  scripts/state.mjs templates/state.json templates/project-AGENTS.md; do
  [[ -f "$source_dir/$path" ]] || fail "Missing harness asset: $path"
done
[[ "$source_dir" != "$target" &&
   ( "$source_dir/" != "$target/"* || "$source_dir" == "$stage/source" ) ]] ||
  fail 'Source and target must be separate directories'
mkdir "$stage/new" "$stage/config" "$stage/backup"
cat "$source_dir/templates/project-AGENTS.md" > "$stage/config/project-AGENTS.md"
for dir in skills agents hooks scripts templates; do
  [[ -z $(find "$source_dir/$dir" ! -type d ! -type f -print -quit) ]] ||
    fail "Unsupported asset type in $dir (links are not installed)"
  cp -R "$source_dir/$dir" "$stage/new/$dir"
done
chmod -R go-w "$stage/new"

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

add_file "$root" "$stage/new"
existing_agents=0
if [[ -e "$target/AGENTS.md" || -L "$target/AGENTS.md" ]]; then
  [[ -f "$target/AGENTS.md" ]] || fail "Conflict at existing path: $target/AGENTS.md"
  existing_agents=1
else
  add_file "$target/AGENTS.md" "$stage/config/project-AGENTS.md"
fi
skill_count=0
for skill in "$source_dir"/skills/*; do
  [[ -f "$skill/SKILL.md" ]] || continue
  name=${skill##*/}
  [[ "$name" =~ ^[a-zA-Z0-9._-]+$ && "$name" != "." && "$name" != ".." ]] ||
    fail "Invalid skill name: $name"
  add_link "$target/.agents/skills/$name" "../../.ai-native-sdlc/skills/$name"
  ((skill_count+=1))
done
((skill_count > 0)) || fail 'Harness has no skills'

agent_count=0
for agent in "$source_dir"/agents/*.agent.md; do
  [[ -f "$agent" ]] || continue
  name=${agent##*/}
  [[ "$name" =~ ^[a-zA-Z0-9._-]+\.agent\.md$ ]] ||
    fail "Invalid agent name: $name"
  add_link "$target/.github/agents/$name" "../../.ai-native-sdlc/agents/$name"
  title=$(sed -n 's/^name: *//p' "$agent" | head -n 1)
  description=$(sed -n 's/^description: *//p' "$agent" | head -n 1)
  [[ -n "$title" && -n "$description" ]] || fail "Invalid agent profile: $name"
  profile="$root/agents/$name"
  instructions="Read $profile before acting and follow its role instructions. Respect the host's actual tools and permissions; Markdown tools metadata does not configure Codex permissions."
  json_string "$title"; title_json=$REPLY
  json_string "$description"; description_json=$REPLY
  json_string "$instructions"; instructions_json=$REPLY
  config="$stage/config/agent-$agent_count.toml"
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

cat > "$stage/config/copilot.json" <<EOF
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
add_file "$target/.github/hooks/ai-native-sdlc.json" "$stage/config/copilot.json"
cat > "$stage/config/codex.json" <<EOF
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
add_file "$target/.codex/hooks.json" "$stage/config/codex.json"

hash_file() {
  REPLY=$(shasum -a 256 "$1")
  REPLY=${REPLY%% *}
}
hash_link() {
  REPLY=$(printf %s "$1" | shasum -a 256)
  REPLY=${REPLY%% *}
}
file_mode() {
  REPLY=$(stat -c %a "$1" 2>/dev/null) || REPLY=$(stat -f %Lp "$1")
}
command -v shasum >/dev/null 2>&1 || fail 'shasum is required'

# The revision includes local uncommitted changes as well as a Git commit, if available.
inventory="$stage/config/inventory"
: > "$inventory"
while IFS= read -r file; do
  hash_file "$file"
  printf '%s  %s\n' "$REPLY" "${file#"$stage/new/"}" >> "$inventory"
done < <(find "$stage/new" -type f | LC_ALL=C sort)
hash_file "$inventory"
content_hash=$REPLY
source_revision=local
if git -C "$source_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  source_revision=$(git -C "$source_dir" rev-parse HEAD)
fi
printf '%s %s\n' "$source_revision" "$content_hash" > "$stage/new/.install-revision"

# The manifest covers every payload file and each discovery/configuration entry.
manifest="$stage/new/.install-manifest"
: > "$manifest"
while IFS= read -r file; do
  hash_file "$file"
  hash=$REPLY
  file_mode "$file"
  printf 'F\t%s\t%s\t.ai-native-sdlc/%s\n' "$hash" "$REPLY" "${file#"$stage/new/"}" >> "$manifest"
done < <(find "$stage/new" -type f ! -name .install-manifest | LC_ALL=C sort)
while IFS= read -r dir; do
  file_mode "$dir"
  printf 'D\t-\t%s\t.ai-native-sdlc/%s\n' "$REPLY" "${dir#"$stage/new/"}" >> "$manifest"
done < <(find "$stage/new" -mindepth 1 -type d | LC_ALL=C sort)
for ((i=1; i<${#paths[@]}; i++)); do
  path=${paths[i]}
  [[ "$path" != "$target/AGENTS.md" ]] || continue
  if [[ ${kinds[i]} == link ]]; then
    hash_link "${values[i]}"
    kind=L
    mode=-
  else
    hash_file "${values[i]}"
    kind=F
    hash=$REPLY
    file_mode "${values[i]}"
    mode=$REPLY
    REPLY=$hash
  fi
  printf '%s\t%s\t%s\t%s\n' "$kind" "$REPLY" "$mode" "${path#"$target/"}" >> "$manifest"
done

old_paths=()
if [[ -e "$root" ]]; then
  [[ -d "$root" && ! -L "$root" && -f "$root/.install-manifest" &&
     ! -L "$root/.install-manifest" ]] ||
    fail "Conflict at existing path: $root (not a managed installation)"
  old_count=0
  old_dirs=0
  while IFS=$'\t' read -r kind hash mode relative; do
    [[ "$relative" != /* && "$relative" != *..* &&
       "$relative" != *$'\n'* && "$relative" != *$'\t'* &&
       ( "$hash" =~ ^[a-f0-9]{64}$ || ( "$kind" == D && "$hash" == - ) ) &&
       ( "$mode" =~ ^[0-7]{3,4}$ || ( "$kind" == L && "$mode" == - ) ) &&
       ( "$kind" == F || "$kind" == L || "$kind" == D ) ]] ||
      fail "Invalid managed manifest at $root"
    path="$target/$relative"
    if [[ "$relative" == .ai-native-sdlc/* ]]; then
      if [[ "$kind" == D ]]; then
        [[ -d "$path" && ! -L "$path" ]] || fail "Modified managed directory: $path"
        file_mode "$path"
        [[ "$REPLY" == "$mode" ]] || fail "Modified managed directory: $path"
        ((old_dirs+=1))
        continue
      fi
      [[ "$kind" == F && -f "$path" && ! -L "$path" ]] ||
        fail "Modified managed file: $path"
      ((old_count+=1))
    else
      [[ "$relative" == .agents/skills/* || "$relative" == .github/agents/* ||
         "$relative" == .github/hooks/ai-native-sdlc.json ||
         "$relative" == .codex/agents/* || "$relative" == .codex/hooks.json ]] ||
        fail "Invalid managed manifest path: $relative"
      old_paths+=("$path")
      if [[ "$kind" == L ]]; then
        [[ -L "$path" ]] || fail "Modified managed link: $path"
        hash_link "$(readlink "$path")"
      else
        [[ -f "$path" && ! -L "$path" ]] || fail "Modified managed file: $path"
        hash_file "$path"
      fi
      [[ "$REPLY" == "$hash" ]] || fail "Modified managed file: $path"
      if [[ "$kind" == F ]]; then
        file_mode "$path"
        [[ "$REPLY" == "$mode" ]] || fail "Modified managed permissions: $path"
      fi
      continue
    fi
    hash_file "$path"
    [[ "$REPLY" == "$hash" ]] || fail "Modified managed file: $path"
    file_mode "$path"
    [[ "$REPLY" == "$mode" ]] || fail "Modified managed permissions: $path"
  done < "$root/.install-manifest"
  actual_count=$(find "$root" -type f ! -name .install-manifest | wc -l | tr -d ' ')
  actual_dirs=$(find "$root" -mindepth 1 -type d | wc -l | tr -d ' ')
  [[ "$actual_count" == "$old_count" && "$actual_dirs" == "$old_dirs" &&
     -z $(find "$root" ! -type d ! -type f -print -quit) ]] ||
    fail "Unmanaged or modified content in $root"
fi

# Validate every destination and parent before moving a single managed entry.
for ((i=0; i<${#paths[@]}; i++)); do
  path=${paths[i]}
  parent=${path%/*}
  while [[ "$parent" != "$target" ]]; do
    [[ ! -L "$parent" && ( ! -e "$parent" || -d "$parent" ) ]] ||
      fail "Conflict at parent: $parent"
    if [[ -d "$parent" ]]; then
      file_mode "$parent"
      (( (8#$REPLY & 2) == 0 )) ||
        fail "Insecure world-writable parent directory: $parent"
    fi
    parent=${parent%/*}
  done
  [[ ! -e "$path" && ! -L "$path" ]] && continue
  [[ "$path" == "$root" && -f "$root/.install-manifest" ]] && continue
  [[ "$path" == "$target/AGENTS.md" && "$existing_agents" -eq 1 ]] && continue
  found=0
  for old in "${old_paths[@]-}"; do
    [[ "$path" != "$old" ]] || found=1
  done
  [[ "$found" -eq 1 ]] || fail "Conflict at existing path: $path"
done

for path in "$root" "${old_paths[@]-}"; do
  [[ -e "$path" || -L "$path" ]] || continue
  index=${#backed[@]}
  mv "$path" "$stage/backup/$index"
  backed+=("$path")
done
for ((i=0; i<${#paths[@]}; i++)); do
  path=${paths[i]}
  [[ "$path" == "$target/AGENTS.md" && "$existing_agents" -eq 1 ]] && continue
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
  if [[ ${kinds[i]} == link ]]; then
    ln -s "${values[i]}" "$path"
    written+=("$path")
  else
    # Record the destination before copying, so even a failed copy is reversible.
    written+=("$path")
    if [[ "$path" == "$root" ]]; then
      mv "${values[i]}" "$path"
    else
      cp "${values[i]}" "$path"
    fi
  fi
done
success=1
printf 'Installed %d harness entries in %s\n' "${#paths[@]}" "$target"
if [[ $existing_agents -eq 1 ]] &&
   ! cmp -s "$target/AGENTS.md" "$root/templates/project-AGENTS.md"; then
  printf 'Existing AGENTS.md preserved; review it and add harness instructions from %s if needed.\n' \
    "$root/templates/project-AGENTS.md" >&2
fi
