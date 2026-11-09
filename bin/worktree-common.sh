#!/usr/bin/env bash
# Shared configuration and helpers for the watts-mobile worktree scripts.
# Not executable on its own — sourced by worktree-{up,down}.sh.

set -euo pipefail

WT_ROOT="${WATTS_MOBILE_WT_ROOT:-$HOME/Develop/.worktrees/watts-mobile}"
BASE_BRANCH="${WATTS_MOBILE_BASE_BRANCH:-develop}"

# Dev server / Metro bundler ports live in 8100-8299.
# Expo's default port is 8081, so worktrees live in a dedicated band to prevent collisions.
PORT_BASE="${WATTS_MOBILE_PORT_BASE:-8100}"
PORT_SPAN=200
MAIN_PORT="${WATTS_MOBILE_MAIN_PORT:-8081}"

die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

# CW-600 -> 600
ticket_number() {
  local n="${1##*-}"
  [[ "$n" =~ ^[0-9]+$ ]] || die "ticket '$1' has no numeric suffix (expected e.g. CW-600)"
  printf '%s' "$n"
}

# Deterministic port from ticket number (modulo span)
ticket_port() { printf '%s' "$((PORT_BASE + $(ticket_number "$1") % PORT_SPAN))"; }

repo_root() { git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel; }

main_checkout() { git -C "$(repo_root)" worktree list --porcelain | sed -n '1s/^worktree //p'; }

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
