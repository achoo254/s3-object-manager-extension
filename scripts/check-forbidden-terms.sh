#!/usr/bin/env bash
# Fails when tracked files, file paths or commit messages match FORBIDDEN_TERMS_REGEX.
# The term list is kept outside the repository (CI secret / local environment variable):
# writing it down here would itself break the rule.
#
#   check-forbidden-terms.sh files              tracked files and their paths
#   check-forbidden-terms.sh staged             staged files and their paths (pre-commit)
#   check-forbidden-terms.sh commits <range>    commit messages in a git range
#   check-forbidden-terms.sh message <file>     one commit message (commit-msg hook)
#
# Output names no matched text unless VERBOSE=1, so public CI logs never reveal the terms.
set -euo pipefail

regex="${FORBIDDEN_TERMS_REGEX:-}"
# An empty pattern matches every line, so refuse to run rather than silently pass or fail.
if [[ -z "${regex//[[:space:]]/}" ]]; then
  echo "FORBIDDEN_TERMS_REGEX is missing or empty: the forbidden-terms check cannot run." >&2
  echo "Set it as a repository secret (CI) or an environment variable (local hooks)." >&2
  exit 2
fi

mode="${1:-}"
verbose="${VERBOSE:-0}"
found=0

# $1 = what was checked, $2 = matching lines (printed only when verbose)
report() {
  local count=0
  if [[ -n "$2" ]]; then count="$(printf '%s\n' "$2" | wc -l | tr -d ' ')"; fi
  if [[ "$count" -gt 0 ]]; then
    found=1
    echo "Forbidden terms found in $1: $count hit(s)." >&2
    if [[ "$verbose" == "1" ]]; then printf '%s\n' "$2" >&2; fi
  fi
}

# `git grep -n` hits, ignoring matches that only occur inside package integrity hashes
# (`sha512-<base64>` in lockfiles): random base64 regularly spells short words.
content_hits() {
  git grep "$@" -I -i -n -E -e "$regex" -- . \
    | sed -E 's/sha(1|256|384|512)-[A-Za-z0-9+\/]+=*//g' \
    | grep -i -E -e "$regex" || true
}

# Prints `path:line` of each hit from `git grep -n` output ($1), never the matched text, so
# public CI logs show where to look. A path that itself matches is replaced by a placeholder.
locations() {
  [[ -n "$1" ]] || return 0
  printf '%s\n' "$1" | while IFS=: read -r path line _; do
    if printf '%s\n' "$path" | grep -q -i -E -e "$regex"; then path="<path hidden>"; fi
    echo "  at $path:$line" >&2
  done
}

case "$mode" in
  files)
    hits="$(content_hits)"
    report "tracked files" "$hits"
    if [[ "$verbose" != "1" ]]; then locations "$hits"; fi
    report "file paths" "$(git ls-files | grep -i -E -e "$regex" || true)"
    ;;
  staged)
    report "staged files" "$(content_hits --cached)"
    report "staged file paths" \
      "$(git diff --cached --name-only --diff-filter=ACMR | grep -i -E -e "$regex" || true)"
    ;;
  commits)
    range="${2:?commit range required}"
    report "commit messages ($range)" "$(git log --format=%B "$range" | grep -i -E -e "$regex" || true)"
    ;;
  message)
    file="${2:?message file required}"
    report "the commit message" "$(grep -v '^#' "$file" | grep -i -E -e "$regex" || true)"
    ;;
  *)
    echo "usage: $0 files | staged | commits <range> | message <file>" >&2
    exit 2
    ;;
esac

exit "$found"
