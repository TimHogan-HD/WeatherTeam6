#!/bin/bash
# PostToolUse hook for WeatherTeam6
# After a git push, trigger the code-review skill to review and post PR comments.
# Exit code 0 always — this is informational only.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only fire after git push commands (not fetch/pull/status/etc.)
if echo "$COMMAND" | grep -qE "git push"; then
  echo ""
  echo "POST-PUSH: Code was pushed to remote."
  echo "ACTION REQUIRED: Invoke the code-review skill before ending this session:"
  echo "  /code-review --comment"
  echo "This reviews the branch diff and posts findings as inline PR review comments."
  echo "If no PR exists yet, the skill will report that — skip posting in that case."
fi

exit 0
