#!/usr/bin/env bash
# Create (or refresh) a ready-to-work worktree for one Linear ticket: branch off
# origin/develop, install dependencies, allocate deterministic dev port,
# and setup launch config for Expo/Metro.
#
#   bin/worktree-up.sh CW-600                     # feat/CW-600
#   bin/worktree-up.sh CW-600 fix modal-zindex    # fix/CW-600-modal-zindex
#   bin/worktree-up.sh CW-600 --no-install        # skip `pnpm install`
#
# Idempotent: re-running against an existing worktree refreshes dependencies
# and launch configuration without touching uncommitted work.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

# ---------------------------------------------------------------- arguments ---
TICKET=""
TYPE="feat"
SLUG=""
INSTALL=1
POS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-install) INSTALL=0 ;;
    -h | --help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option '$1' (see: bin/worktree-up.sh --help)" ;;
    *)
      POS=$((POS + 1))
      case "$POS" in
        1) TICKET="$1" ;;
        2) TYPE="$1" ;;
        3) SLUG="$1" ;;
        *) die "too many arguments (got '$1') — usage: worktree-up.sh <TICKET-ID> [type] [slug]" ;;
      esac
      ;;
  esac
  shift
done

[[ -n "$TICKET" ]] || die "usage: worktree-up.sh <TICKET-ID> [type] [slug] [--no-install]"

if [[ "$TICKET" =~ ^([A-Z]+-[0-9]+)(-[A-Za-z0-9][A-Za-z0-9-]*)?$ ]]; then
  TICKET_BASE="${BASH_REMATCH[1]}"
else
  die "ticket must look like CW-600 or CW-600-scratch (got '$TICKET')"
fi

REPO="$(repo_root)"
WT="$WT_ROOT/$TICKET"
BRANCH="$TYPE/$TICKET${SLUG:+-$SLUG}"
PORT="$(ticket_port "$TICKET_BASE")"

[[ "$TICKET" == "$TICKET_BASE" ]] \
  || warn "$TICKET is a scratch worktree — it shares $TICKET_BASE's port ($PORT)"

# ---------------------------------------------------------------- worktree ---
if [[ -d "$WT" ]]; then
  info "worktree already exists: $WT"
  CURRENT_BRANCH="$(git -C "$WT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    warn "$WT is on '$CURRENT_BRANCH', not '$BRANCH' — leaving it alone (a refresh never moves your branch)"
    BRANCH="$CURRENT_BRANCH"
  fi
else
  info "fetching origin/$BASE_BRANCH"
  git -C "$REPO" fetch origin "$BASE_BRANCH" --quiet \
    || die "could not fetch origin/$BASE_BRANCH — check network/credentials, then re-run"
  info "creating worktree $WT on $BRANCH"
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    info "branch $BRANCH already exists — checking it out instead of recreating it"
    git -C "$REPO" worktree add "$WT" "$BRANCH" \
      || die "git worktree add failed — is $BRANCH checked out in another worktree? (git worktree list)"
  else
    git -C "$REPO" worktree add "$WT" -b "$BRANCH" "origin/$BASE_BRANCH" \
      || die "git worktree add failed — remove a stale entry with: git worktree prune"
  fi
fi

# ------------------------------------------------------------- dependencies ---
if [[ "$INSTALL" -eq 1 ]]; then
  info "installing dependencies (pnpm install)"
  (cd "$WT" && pnpm install --prefer-offline 2>/dev/null || pnpm install)
fi

# ------------------------------------------------------------------- .env ---
if [[ ! -f "$WT/.env" && -f "$WT/.env.example" ]]; then
  info "creating .env from .env.example"
  cp "$WT/.env.example" "$WT/.env"
fi

# ------------------------------------------------------------- launch.json ---
LAUNCH="$WT/.claude/launch.json"
mkdir -p "$(dirname "$LAUNCH")"
cat > "$LAUNCH" <<EOF
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "watts-mobile-dev",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": [
        "exec",
        "expo",
        "start",
        "--port",
        "$PORT"
      ],
      "port": $PORT
    }
  ]
}
EOF

EXCLUDE_FILE="$(git -C "$WT" rev-parse --git-path info/exclude 2>/dev/null || true)"
if [[ -n "$EXCLUDE_FILE" && -f "$EXCLUDE_FILE" ]]; then
  if ! grep -qxF ".claude/launch.json" "$EXCLUDE_FILE" 2>/dev/null; then
    printf '\n.claude/launch.json\n' >> "$EXCLUDE_FILE"
  fi
fi

# ------------------------------------------------------------------ report ---
cat <<EOF

$(info "ready")

  worktree   $WT
  branch     $BRANCH
  port       $PORT (Metro bundler)

  cd $WT
  pnpm exec expo start --port $PORT

  verify:  cd $WT && pnpm typecheck && pnpm lint && pnpm test
  cleanup: bin/worktree-down.sh $TICKET
EOF
