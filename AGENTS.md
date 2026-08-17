# Agent Guidelines — Coach Watts Mobile

This repository is the **native iOS/Android activation companion** for [Coach Watts](https://coachwatts.com).

Web stays the control room (deep plan adapt, analytics, teams, nutrition planning, and billing administration). Native mobile may acquire/restore a hosted Supporter or Pro subscription through Apple/Google via RevenueCat; invoices, payment methods, tax documents, refunds, and provider administration stay web/store-managed.
This app **activates new athletes on device** (consent → goal → plan lite → insight → connect data last), then runs the daily field loop: today, check-in, coach, push — not a full web port.

## Issue tracking (Linear)

Team **`CW`**, projects **`Mobile App`** / **`App Store Distribution`**. Live task state is in Linear — `docs/issues.md` is archive/specs only.

**Read** `~/Develop/coach-wattz/docs/04-guides/issue-management.md` before picking up a ticket (CW-scoped guide). Multi-team SoT is private (`~/Develop/hdkiller/docs/orgs/linear.md`); do not import WM/OPS/CLNT content into this public repo. Follow-ups discovered mid-work → file a `CW` Linear issue in `Triage`. PR body: `Fixes CW-XX`.

## Source of truth

| Doc | Role |
|-----|------|
| [docs/product-baseline.md](docs/product-baseline.md) | Product positioning (activation companion), shipped loop, activation chapter, IA, non-goals |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Delivery phases and checklist for this repo |
| [docs/open-questions.md](docs/open-questions.md) | Decisions to resolve before/during Phase 0–1 |
| [docs/oauth-setup.md](docs/oauth-setup.md) | Public OAuth client + redirect URI registration |
| [docs/e2e.md](docs/e2e.md) | Maestro runbook **and** day-to-day e2e conventions (testIDs, when to update flows, PR checklist) |
| [docs/deep-links.md](docs/deep-links.md) | Scheme / universal link path map + host association |
| [docs/native-modules.md](docs/native-modules.md) | When adding Expo native deps: rebuild the dev client |
| [docs/distribution.md](docs/distribution.md) | App Store / Play hub, release-it versioning, GitHub Android APK → `docs/distribution/` tasks + log |
| [docs/distribution/play-internal-testing.md](docs/distribution/play-internal-testing.md) | Play Internal track: upload script, add testers, opt-in link, license testers |
| [docs/store-checklist.md](docs/store-checklist.md) | Brand chrome, About links, Sentry env for store builds |
| [docs/store-privacy-checklist.md](docs/store-privacy-checklist.md) | App Privacy / Data safety questionnaire copy |
| coach-wattz `docs/06-plans/mobile-companion-app.md` | Full living baseline (PR [#239](https://github.com/hdkiller/coach/pull/239); merge pending) |
| OpenSpec archive `2026-07-19-phase-0/1/2/3/4-*` | Auth → Today → Log → push → chat → activity → deep links → store → profile → nutrition (done) |

When the coach-wattz PR merges, prefer that file for product/API narrative and keep this repo’s docs focused on **implementation**.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | **Expo (React Native) + TypeScript** + **`expo-dev-client`** (not Expo Go for day-to-day) |
| Navigation | **Expo Router** |
| UI | React Native + **NativeWind** (or adapted design tokens) |
| Server state | **TanStack Query** |
| Auth storage | **expo-secure-store** |
| Local cache | **`@react-native-async-storage/async-storage`** behind `@tanstack/query-async-storage-persister` (`src/query/persist.ts`) — MMKV and SQLite are **not** used |
| Push | **Expo Notifications** → APNs / FCM |
| Observability | **Sentry React Native** |

Auth: OAuth 2.0 **Authorization Code + PKCE (S256)** via system browser / `expo-auth-session`. Bearer tokens only — not web cookie sessions.

Do **not** use Capacitor wrapping Nuxt for v1. Prefer Expo over Flutter / separate native stacks unless product decides otherwise.

## Related repositories

| Repo | Path | Role |
|------|------|------|
| **coach-wattz** | `~/Develop/coach-wattz` | Production web + API + OAuth IdP |
| **watts-marketing** | `~/Develop/watts-marketing` | Brand / outreach knowledge |

API base (hosted): `https://coachwatts.com/api/`  
Local coach-wattz (workspace default): `http://localhost:3099/api/`

## Product summary

**Shipped loop:** Today (recommendation + planned), Log (wellness + recovery + nutrition quick-log), session detail, recent/upcoming, Coach chat, notifications, athlete metrics, Settings (Health Sync, etc.), account glue.

**Next — activation onboarding:** mobile-only sign-up + consent, goal lite, plan lite wizard, first insight, connect-last (Health Sync primary; OAuth apps optional/skip). Fully activated = data → goal → plan → insight.

**Out:** Plan templates / share / Intervals publish, analytics/explorer, coaching teams, library editing, full billing administration, admin, full Profile Settings / zones (Nutrition settings and Sports thresholds lite are in scope). **In:** standing Plan tab (training generator + adapt/replan + structure + nutrition plan/grocery) — OpenSpec train `plan-tab-shell`…`nutrition-plan-on-plan-tab`. Narrow hosted store subscription purchase/status/restore/manage is tracked by OpenSpec `store-subscriptions-revenuecat`.

IA: bottom tabs **Today · Plan · Log · Coach · More** (+ activation wizard stacks). See [docs/product-baseline.md](docs/product-baseline.md).

## Working rules

1. Treat **coach-wattz** as source of truth for API contracts, scopes, and product behavior. Do not invent endpoints or scope names.
2. Keep business logic on the server. Mobile is presentation, caching, and optimistic UI.
3. Prefer a thin companion aggregate (`GET /api/mobile/today` or documented composition) over cold-start fan-out.
4. Self-hosted instance URL is first-class (validate reachability before OAuth).
5. Secrets stay out of git (tokens, client secrets, `.env`). RevenueCat: public SDK keys may use `EXPO_PUBLIC_REVENUECAT_*`; V2 secret `REVENUECAT_API_V2_SECRET_KEY` is local MCP/API tooling only (see [docs/distribution/tasks/018-revenuecat-project.md](docs/distribution/tasks/018-revenuecat-project.md)) — never ship in the app bundle; production webhook secrets stay in coach-wattz.
6. Follow [BRANDING.md](../coach-wattz/BRANDING.md) in coach-wattz — companion is Coach Watts, not a generic fitness shell.
7. Update [docs/open-questions.md](docs/open-questions.md) when a decision lands.
8. After adding/upgrading a **native** Expo module or changing its `app.json` plugin, **rebuild the binary** (`pnpm ios` / `pnpm android` or EAS). Metro alone will not link it — see [docs/native-modules.md](docs/native-modules.md). Symptom: `Cannot find native module '…'`.
9. Store / distribution progress: update [docs/distribution/tasks.md](docs/distribution/tasks.md) (and the matching task file) when status changes; **prepend** a dated entry to [docs/distribution/log.md](docs/distribution/log.md) for enrollments, TestFlight builds, submissions, and review outcomes. Never commit Apple passwords, review demo passwords, or real Sentry DSNs — see [docs/distribution.md](docs/distribution.md).
10. **Store / TestFlight / Play binaries are local** — iOS: `expo prebuild` → Xcode Archive → Organizer/Transporter; Android: `expo prebuild` → Gradle `bundleRelease` → Play Console. Do not default to `eas build` / `eas submit`. Details: [docs/distribution.md](docs/distribution.md), tasks [005](docs/distribution/tasks/005-eas-credentials-and-secrets.md)–[006](docs/distribution/tasks/006-ios-production-build.md), [014](docs/distribution/tasks/014-eas-android-credentials.md)–[015](docs/distribution/tasks/015-android-production-build.md).
11. **Maestro with the feature** — if you change a companion surface the suite already covers (or add a daily-loop entry point), update `testID`s / `maestro/` flows in the same change. Conventions and PR checklist: [docs/e2e.md](docs/e2e.md) § Maintaining e2e. Vitest for mappers; never enable `EXPO_PUBLIC_E2E_*` on store builds.

## Worktree Lifecycle

Ticket worktrees isolate development instances under `~/Develop/.worktrees/watts-mobile/<TICKET-ID>`.

```bash
bin/worktree-up.sh CW-600                     # create/refresh worktree + allocate dev port
bin/worktree-up.sh CW-600 fix modal-zindex    # specify type and branch slug
bin/worktree-down.sh CW-600                   # safe teardown (refuses if uncommitted/unpushed)
bin/worktree-down.sh CW-600 --force --delete-branch
```

<!-- FACTORY:FLOOR:BEGIN -->
<!-- Generated from watt-mind/factory shared/floor.md. Do not edit here — edit
     the source and re-run `node build/emit.mjs`, or your change is lost on the
     next sync. Keep the source prettier-canonical (`npx prettier -w`): some
     repos run prettier on *.md in pre-commit hooks, and any construct prettier
     rewrites (e.g. *emphasis* -> _emphasis_) makes --check read those repos as
     perpetually stale. -->

## Agent operating floor

Non-negotiable for every agent in this repo, in any harness. Full protocol: `~/Develop/hdkiller/docs/orgs/linear.md`. If that path doesn't exist where you're running (a cloud sandbox, someone else's machine), this block is the whole contract — follow it as written and don't infer the rest.

**Work comes from Linear, and only when it's ready.** A ticket is dispatchable only if it is `Todo` + `ai:agent-ready` + unassigned. `Triage` and `Backlog` are not queues to pull from.

**An ad-hoc request gets a ticket too — file it, don't wait to be asked.** A request typed into a chat session is not exempt from the control plane; if it isn't tracked, it is invisible to every other agent and to tomorrow. **The trip wire is your first file edit:** before it, either find the issue that already covers this or create one, and say in one line which it is ("Tracking as OPS-91"). Commits still carry their `(ISSUE-ID)`. Skip the ticket only for ordinary questions, read-only lookups with no actionable finding, and inconsequential edits — and the human can always say "no ticket", which settles it. Sessions drift: one that began as a question and turned into a change trips the wire at that moment, not at the end.

**Retroactive capture is the backstop, not the plan.** If you notice partway through, or while wrapping up, that work already done has no issue, file it _then_ — with the commits or PR linked and the state set to where the work actually is (`Done` if it is already merged and green), never dressed up as queued work. Before reporting a session finished, check that everything you changed is on a ticket. A late ticket beats an invisible change; both are worse than filing up front.

**Claim before you code.** Set assignee to yourself, state `In Progress`, add `ai:in-progress`, then **re-read the ticket** — if the assignee isn't you, another agent won the race; take the next one. This read-back is the entire concurrency control.

**One ticket, one worktree.** Never share a checkout between concurrent tickets. **If the repo ships a worktree script (`bin/worktree-up.sh` or equivalent), it is mandatory** — git isolates branches, not ports or databases, and a migration against a shared dev database destroys another agent's work silently.

**Bundling several tickets into one worktree is the human's call, never yours.** When the human explicitly asks for a set of tickets to be done together, they share one worktree, one branch (named after the lead ticket) and one PR: claim _every_ ticket in the bundle and heartbeat all of them, keep one commit per ticket, scope the work to the union of their `Owned Paths`, and give the PR body a `Fixes <ISSUE-ID>` line per ticket. If one of them turns out to be bigger than it looked or gets blocked, unassign it back to `Todo` and ship the rest — never stall the others behind it. Absent that explicit instruction it is one ticket, one worktree; noticing that two tickets are related is a reason to say so, not to merge them yourself.

**Stay inside `Owned Paths`.** That glob set is what makes parallel work safe; the dispatcher refuses to run two tickets whose sets intersect. Work discovered outside it becomes a new `Triage` issue — it never expands the current ticket.

**Heartbeat** at each phase change (claimed → implemented → verified → PR open) and at least every 20 minutes, saying what changed. After 45 minutes of silence the ticket is reclaimed.

**Verification is a gate, not a formality.** Run the ticket's exact Verification Command. Never advance state, open a PR, or report success on failing output. Never weaken a test or skip a check to get green — if the test is wrong, that's a finding to report, not to edit around.

**`Done` means merged and running:** PR merged, base-branch CI green after the merge, and the post-deploy smoke check green where the repo has one.

### Never auto-merge

Regardless of CI or review outcome, these come back to a human with findings: **auth/authz, payments or money movement, credential and secret handling, destructive DB migrations, production infra config, and `CLNT` security behavior.** When escalating, add `ai:escalated` to the Linear ticket — that's what surfaces it in the human's "My Decisions Needed" view — and notify (see below).

The test is whether the diff **changes security-relevant behavior**, not whether a file sits near security code — read as file-adjacency this list swallows every PR in an app where auth is everywhere, and that trains everyone to rubber-stamp it. When it's genuinely ambiguous, escalate: a false escalation costs one message, a wrong merge costs a client incident.

`master`/`main` always goes through a human. Merging into `develop` on an `hdkiller`/`watt-mind` repo is pre-authorized once CI is genuinely green **and you have read the diff** — green CI alone is never the bar.

### Stop and ask

Move the ticket to `Blocked`, say specifically what you need in one answerable question, and notify. Never leave a stalled ticket sitting in `In Progress`.

**"Notify" means exactly this command** — a Linear comment, a `Blocked` state change, or a line in your final report does not reach the human in real time:

```bash
factory notify "<EVENT> <TICKET/PR>: <one answerable sentence>"
```

Event prefix is one of `BLOCKED`, `ESCALATED`, `CI RED`, `SMOKE RED`, `CIRCUIT BREAKER`, `RC READY`. It pushes a Telegram message to the human and exits non-zero on failure — if it fails, post the same text as a Linear comment and flag the failed push in your report. Notify only for those six events; routine progress (claims, PRs opened, clean merges) goes to Linear and the run report, never here.

Before blocking on product intent, check whether it's already written down — the repo's `docs/product-decisions.md`, `docs/`, or the Linear project Overview. If you resolve a decision that wasn't recorded, record it.

### Waiting

**Never `sleep N` and hope.** A fixed sleep is either too long (dead wall-clock in a process that is holding a slot) or too short (a flaky check that then gets retried). Wait on the actual condition instead.

**For CI:**

```bash
gh pr checks <PR> --watch --fail-fast     # returns the moment checks settle
```

**For a dev server, migration, or anything with an observable ready state** — poll the condition on a short interval with a bounded ceiling, so it returns as soon as it is up and still terminates if it never is:

```bash
for i in $(seq 60); do curl -sf localhost:4222 >/dev/null && break; sleep 2; done
```

**For a background job you started**, wait on the process (`wait`, or the harness's own background-task mechanism) rather than guessing how long it takes.

Measured on real runs: single `sleep 180` and `sleep 75` calls, plus a `sleep 60` after starting a dev server that was ready in a fraction of that. Each one is a per-ticket process sitting idle while holding a concurrency slot.

### Context discipline

A tool result is not paid for once. It stays in the context window and is re-sent on every later turn, so a large payload early in a long run is charged dozens of times. Measured across 485 real runs: 193MB of tool output became **10.1GB** of re-sent context, and **74% of that was images**.

**Screenshots are the single most expensive thing you can do.** A full-page PNG averages 199KB — roughly a hundred times a typical command's output, and it stays resident for the rest of the session.

- **Never `Read` an image you just captured.** The capture already put it in context; reading the file back doubles it for nothing. This was 572 payloads across the measured runs.
- Use the **accessibility tree** (`take_snapshot`, `read_page`) for anything structural — labels, hierarchy, focus order, presence of an element. It averages 7KB against 199KB and is more precise for those questions. Screenshot only when the finding is genuinely _visual_: spacing, contrast, truncation, overlap.
- When you do screenshot, prefer a **mobile viewport** and a **specific element** over a full desktop page.

**Don't re-read what you have already read.** 285 duplicate reads of an identical path inside a single run were measured. If you read a file, it is still in your context — scroll back rather than re-reading. For a large file, `offset`/`limit` the part you need instead of pulling all of it.

**This floor is the protocol.** Do not `cat` `~/Develop/hdkiller/docs/orgs/linear.md` for something answered above — it is 645 lines, and it was re-read 156 times across 96 runs for rules already written here. Go to it only for the reference tables (project/area labels, saved views, GraphQL recipes), and read the specific section, not the file.

**Batch tool loading.** When tools must be loaded before use, request every tool the task needs in **one** call (`select:a,b,c`). Each extra call is a full round trip that re-sends the whole context.

### Browsers

Factory-spawned sessions get their **own isolated headless Chrome** (via `--mcp-config`, `config/mcp/claude.json` in the factory repo) — a temp profile per session, screenshots served as capped webp. There is nothing to share and nothing to fight over.

If a browser tool still errors: report it and continue with non-browser verification — never retry in a loop, and **never kill another process's Chrome**; a killed browser mid-flight destroys another agent's verification run. `browser is already running for .../chrome-profile` means you are running outside the factory config (interactive session, older harness) where the profile IS shared — attach to the running browser (`list_pages`, then work in your own new page) rather than fighting the lock.

### Shell globs

Quote glob arguments: `grep -rn "..." src --include='*.ts'`, never `--include=*.ts`. zsh expands the unquoted form against the current directory and **errors** when nothing matches there, killing the command before grep runs. Seen repeatedly in real transcripts.

### Factory scripts

Mechanical factory tools run from **any cwd** via the `factory` CLI on PATH — product checkouts and worktrees do not contain `orchestrator/` or `tools/`.

```bash
factory linear get CLNT-616
factory queue --repo bj29
factory next --repo bj29
factory label-guard --repo bj29 --apply
```

Install once: `bun build/emit.mjs --link-bin` (symlinks `~/Develop/factory/bin/factory` → `~/.local/bin/factory`). `factory notify` is the cwd-independent wrapper around the human interrupt channel. Never `bun orchestrator/...` from a worktree — that path is not there.

### Linear

**Use `factory linear` — not the Linear MCP, and not the standalone `linear` CLI.** The MCP fails input validation often enough that 96 measured runs fell through to a hand-rolled GraphQL fallback; the schpet `linear` CLI fails differently (`linear issue comment CLNT-526 --body` is wrong syntax — it needs `comment add`; `linear issue query` with hand-rolled filters errors on type coercion). Both waste turns. The factory tool is in git, has the protocol's guardrails built in, and its claim verb performs the read-back that _is_ the concurrency control.

You work in a worktree, not in the factory checkout. **`factory linear` resolves the checkout itself**; headless runs also set `$FACTORY_ROOT`. Fallback when the CLI is missing: `bun "$FACTORY_ROOT/tools/linear.mjs"`.

```bash
factory linear get CLNT-616                              # ticket, state, labels, criteria
factory linear claim CLNT-616 --agent claude             # assign + In Progress + labels + read-back
factory linear comment CLNT-616 "..."                    # the heartbeat
factory linear state CLNT-616 "In Review" --add ai:needs-review
factory linear file --team CLNT --title "..." --body "..." --type bug
factory linear queue --team CLNT                         # what is dispatchable
```

`claim` **exits non-zero when another agent won the race** — that is not a retry, it means take the next ticket. For anything the verbs do not cover, `raw '<graphql>' --var k=v` beats inventing a new flag.

**Attribution.** Factory runs set `$FACTORY_RUN_ID`. Linear comments and issues filed through `tools/linear.mjs` are stamped with it automatically; the one surface the tool cannot reach is GitHub, so **end every PR body with a final line `run:$FACTORY_RUN_ID`** (after `Fixes <ISSUE-ID>`). That one line is what joins the PR back to its transcript and metrics row when someone asks "which run produced this?". Unset (interactive session) — omit it.

**Labels are replaced wholesale, never merged.** Always go through `--add` / `--remove`; a hand-written mutation that passes only the labels you want added silently strips every other label on the ticket. `type:*` has exactly eight values: `bug feature ui-ux security performance maintenance docs a11y` — `type:chore` fails. `area:*` is per-team; copy an existing ticket in the project rather than inventing one. Every new issue carries exactly one `source:*`: `source:agent` for work you discover yourself, `source:human` for a direct request, `source:sentry` / `source:client-support` for those intake paths.

### Secrets

Never print, echo, commit, or paste an API key, token, or `.env` file — not into a transcript, a PR, a Linear comment, or a log. Scripts read credentials themselves. If a secret appears in a diff, that's an escalation, not a cleanup.
<!-- FACTORY:FLOOR:END -->
