#!/usr/bin/env bash
# Installs local pre-commit and commit-msg hooks (in the untracked git hooks directory) that
# run the forbidden-terms check. The hooks read FORBIDDEN_TERMS_REGEX from your environment.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
hooks="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks"

cat >"$hooks/pre-commit" <<HOOK
#!/usr/bin/env bash
VERBOSE=1 exec "$root/scripts/check-forbidden-terms.sh" staged
HOOK

cat >"$hooks/commit-msg" <<HOOK
#!/usr/bin/env bash
VERBOSE=1 exec "$root/scripts/check-forbidden-terms.sh" message "\$1"
HOOK

chmod +x "$hooks/pre-commit" "$hooks/commit-msg"
echo "Installed pre-commit and commit-msg hooks in $hooks"
