#!/bin/bash
# PreToolUse safety hook for WeatherTeam6
# Blocks dangerous operations before they execute.
# Exit code 2 = block the action. Exit code 0 = allow.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('path',''))" 2>/dev/null)

# Block drizzle-kit push in any form — always use generate + migrate
if echo "$COMMAND" | grep -qE "drizzle-kit push|drizzle.*push"; then
  echo "BLOCKED: drizzle-kit push skips migration files and risks data loss. Use 'npm run db:generate' then 'npm run db:migrate' instead." >&2
  exit 2
fi

# Block destructive bash patterns
if [ "$TOOL" = "Bash" ]; then
  if echo "$COMMAND" | grep -qE "rm -rf|DROP TABLE|DROP DATABASE|truncate.*cascade"; then
    echo "BLOCKED: Destructive command requires explicit user confirmation before running." >&2
    exit 2
  fi
fi

# Block writes to .env (real values should only live in Railway)
if [ "$TOOL" = "Write" ] || [ "$TOOL" = "Edit" ]; then
  if echo "$FILE_PATH" | grep -qE "^\.env$|/\.env$"; then
    echo "BLOCKED: Do not write to .env — use .env.example for key names and set real values in Railway dashboard." >&2
    exit 2
  fi
fi

# Block direct writes to migration files
if [ "$TOOL" = "Write" ] || [ "$TOOL" = "Edit" ]; then
  if echo "$FILE_PATH" | grep -qE "drizzle/.*\.sql$|drizzle/meta/"; then
    echo "BLOCKED: Never manually edit Drizzle migration files. Make schema changes in schema.ts and run db:generate." >&2
    exit 2
  fi
fi

# Print review checklist before every git commit as a reminder (not a block)
if [ "$TOOL" = "Bash" ]; then
  if echo "$COMMAND" | grep -q "git commit" && ! echo "$COMMAND" | grep -q "\-\-amend"; then
    echo "REMINDER: Run through the review checklist before committing:" >&2
    cat "$(dirname "$0")/../rules/review-checklist.md" >&2
  fi
fi

exit 0
