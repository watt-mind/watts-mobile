#!/usr/bin/env bash
# Tear down a ticket worktree: remove the worktree directory and optionally
# delete its branch.
#
#   bin/worktree-down.sh CW-600
#   bin/worktree-down.sh CW-600 --force           # discard uncommitted/unpushed work
#   bin/worktree-down.sh CW-600 --delete-branch
#
# Refuses by default if the worktree has uncommitted changes or commits that
# are not on any remote.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

TICKET="${1:-}"
FORCE=0
DELETE_BRANCH=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --delete-branch) DELETE_BRANCH=1 ;;
    -h | --help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option '$arg' — usage: worktree-down.sh <TICKET-ID> [--force] [--delete-branch]" ;;
  esac
done

[[ -n "$TICKET" ]] || die "usage: worktree-down.sh <TICKET-ID> [--force] [--delete-branch]"
[[ "$TICKET" =~ ^[A-Z]+-[0-9]+(-[A-Za-z0-9][A-Za-z0-9-]*)?$ ]] \
  || die "ticket must look like CW-600 or CW-600-scratch (got '$TICKET')"

REPO="$(repo_root)"
WT="$WT_ROOT/$TICKET"

if [[ -d "$WT" ]]; then
  BRANCH="$(git -C "$WT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

  if [[ "$FORCE" -eq 0 ]]; then
    if [[ -n "$(git -C "$WT" status --porcelain)" ]]; then
      git -C "$WT" status --short >&2
      die "$TICKET has uncommitted changes — commit them, or re-run with --force"
    fi
    # HEAD only — '--branches' would scan every branch in the shared repo and
    # refuse because some *other* worktree has unpushed commits.
    unpushed="$(git -C "$WT" log --oneline -n 5 HEAD --not --remotes 2>/dev/null || true)"
    if [[ -n "$unpushed" ]]; then
      printf '%s\n' "$unpushed" >&2
      die "$TICKET has commits not on any remote — push them (git -C $WT push), or re-run with --force"
    fi
  fi

  info "removing worktree $WT"
  git -C "$REPO" worktree remove --force "$WT" \
    || die "could not remove $WT — close anything running in it, then re-run"

  if [[ "$DELETE_BRANCH" -eq 1 && -n "$BRANCH" && "$BRANCH" != "develop" && "$BRANCH" != "master" && "$BRANCH" != "main" ]]; then
    info "deleting branch $BRANCH"
    if ! git -C "$REPO" branch -d "$BRANCH" 2>/dev/null; then
      if [[ "$FORCE" -eq 1 ]]; then
        git -C "$REPO" branch -D "$BRANCH" 2>/dev/null || warn "could not force-delete branch $BRANCH"
      else
        warn "branch $BRANCH is not fully merged; delete it manually with: git -C $REPO branch -D $BRANCH"
      fi
    fi
  fi
else
  info "no worktree at $WT (already removed?)"
  git -C "$REPO" worktree prune
  if [[ "$DELETE_BRANCH" -eq 1 ]]; then
    for b in $(git -C "$REPO" for-each-ref --format='%(refname:short)' "refs/heads/*/$TICKET*" 2>/dev/null); do
      if [[ -n "$b" && "$b" != "develop" && "$b" != "master" && "$b" != "main" ]]; then
        info "deleting branch $b"
        if ! git -C "$REPO" branch -d "$b" 2>/dev/null; then
          if [[ "$FORCE" -eq 1 ]]; then
            git -C "$REPO" branch -D "$b" 2>/dev/null || true
          fi
        fi
      fi
    done
  fi
fi

info "done — $TICKET cleaned up"
