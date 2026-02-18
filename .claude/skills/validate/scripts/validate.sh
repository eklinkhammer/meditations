#!/usr/bin/env bash
set -euo pipefail

# Accept optional arguments: [package] [check-type]
# Examples: validate.sh, validate.sh shared, validate.sh shared types

PACKAGE="${1:-}"
CHECK="${2:-}"

# Build filter flag
FILTER=""
if [[ -n "$PACKAGE" ]]; then
  case "$PACKAGE" in
    shared)     FILTER="--filter @meditations/shared" ;;
    api-client) FILTER="--filter @meditations/api-client" ;;
    server)     FILTER="--filter @meditations/server" ;;
    types|tests|build) CHECK="$PACKAGE"; PACKAGE="" ;;
    *) echo "Unknown package: $PACKAGE"; exit 1 ;;
  esac
fi

PASS=0
FAIL=0

run_check() {
  local name="$1" cmd="$2"
  echo "--- $name ---"
  if eval "$cmd"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

if [[ -z "$CHECK" || "$CHECK" == "types" ]]; then
  run_check "TypeScript" "pnpm $FILTER lint"
fi
if [[ -z "$CHECK" || "$CHECK" == "tests" ]]; then
  run_check "Tests" "pnpm $FILTER test"
fi
if [[ -z "$CHECK" || "$CHECK" == "build" ]]; then
  run_check "Build" "pnpm $FILTER build"
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
