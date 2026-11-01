#!/bin/bash
# PreToolUse hook for Edit|Write. A migration the ledger in DEPLOYMENT.md marks
# `applied` (in any environment) is immutable: refuse the edit. An `unknown`
# one, or one missing from the ledger, needs the maintainer's yes. New files and
# `pending` migrations pass. Edits made through Bash are not covered.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  */site/supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac
[ -e "$file" ] || exit 0

name=$(basename "$file")
ledger="${file%/site/supabase/migrations/*}/DEPLOYMENT.md"
row=$(grep -F "\`$name\`" "$ledger" 2>/dev/null | head -1)

ask() {
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse",
    permissionDecision: "ask", permissionDecisionReason: $reason}}'
  exit 0
}

if [ -z "$row" ]; then
  ask "$name is not in the migration ledger in DEPLOYMENT.md, so it may already be applied. Edit it anyway?"
fi
if grep -qE '\|[[:space:]]*applied[[:space:]]*(\||$)' <<<"$row"; then
  echo "$name is applied (see the ledger in DEPLOYMENT.md), so it is immutable. Write a new forward migration instead." >&2
  exit 2
fi
if grep -qE '\|[[:space:]]*unknown[[:space:]]*(\||$)' <<<"$row"; then
  ask "Whether $name is applied is unknown (ledger in DEPLOYMENT.md). Edit it anyway?"
fi
exit 0
