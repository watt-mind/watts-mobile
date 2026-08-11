# E2E (Maestro) — runbook + conventions

**Source of truth** for companion end-to-end testing in this repo. Use this doc when:

1. **Running** the suite (stack, tokens, scripts) — [Local run](#local-run)
2. **Maintaining** flows during feature work — [Maintaining e2e during development](#maintaining-e2e-during-development)
3. **Debugging flakes / “Request timed out”** — [What to look for](#what-to-look-for-maestro--dev-client-harness)
4. **Wiring CI / store smoke** — [CI / store gate](#ci--store-gate)

Unit logic stays on Vitest. Maestro covers cold launch, tab navigation, and open/assert paths that prove the app is alive against a real API.

## Testing pyramid

| Layer | Owns | Does not own |
|-------|------|--------------|
| **Vitest** (`pnpm test`) | Mappers, auth seed rules, form/queue logic | Rendering, navigation, real API |
| **Maestro** (`pnpm test:e2e*`) | Cold launch, auth-seeded shell, critical journeys | Exhaustive UI states |
| **Manual / sandbox** | Real PKCE, Health Sync OS sheets, store IAP, push OS prompts | Automating OS permission sheets |

**Rule of thumb:** if a bug can be caught by asserting a mapper or pure function, put it in Vitest. Maestro only for “athlete can open the app and complete the daily loop.”

---

## Maintaining e2e during development

Treat Maestro like product chrome: if you change a surface the suite already covers, update the flow in the **same PR**. Do not leave “fix e2e later” for critical-path UI.

### When to touch Maestro

| Change | Expected e2e work |
|--------|-------------------|
| Pure mapper / API client / form validation logic | **Vitest only** — no Maestro |
| Rename / move a screen or sheet that has a `testID` | Keep `testID` stable, or update every YAML `id:` in the same PR |
| Change a primary CTA label that Maestro taps by **text** | Prefer adding/using a `testID`; update the flow if text taps remain |
| New screen on the daily loop (Today / Log / Coach / More entry) | Add root `testID` + either extend an existing flow or add `maestro/flow-*.yaml` |
| New sheet / modal athletes open from Log or Today | Root `testID` + open/assert flow (mutate only if resettable) |
| Deep link path change | Update [`docs/deep-links.md`](./deep-links.md) **and** matching `flow-deeplink-*.yaml` |
| OS permission / Health / IAP / real PKCE | **Manual matrix** only — do not add Maestro |
| Marketing copy / spacing / non-interactive polish | No Maestro unless a `testID` or assertion text breaks |

### Decision tree

```text
Can Vitest catch it (pure function / mapper)?
  └─ yes → unit test only
Is it an OS sheet, store IAP, or real browser PKCE?
  └─ yes → manual / sandbox (document in Manual matrix)
Does the athlete need this surface to finish the daily loop?
  └─ no  → skip Maestro (or wait until the surface is stable)
  └─ yes → add/update testID + Maestro open/assert
         → mutate only if coach-wattz `pnpm e2e:reset` restores state
```

### Selector conventions (stable contracts)

Maestro selectors are **API surface**. Prefer stability over pretty names.

| Kind | Pattern | Examples |
|------|---------|----------|
| Tab / stack screen root | `{area}-screen` | `today-screen`, `log-screen`, `coach-screen`, `more-screen`, `login-screen`, `athlete-screen`, `settings-screen` |
| Sheet / modal root | `{feature}-sheet` | `log-meal-sheet`, `wellness-checkin-sheet`, `daily-checkin-sheet` |
| Primary CTA | `{feature}` or `{feature}-{verb}` | `log-meal`, `wellness-checkin`, `coach-send`, `today-recommendation-accept` |
| Important panel (not full screen) | `{area}-{surface}` | `today-recommendation`, `today-readiness-panel`, `coach-composer` |
| Success / transient notice | `{feature}-{state}` | `wellness-checkin-saved` (offline path) |

Rules:

1. Put `testID` on the **root container** athletes land on (screen `SafeAreaView` / `View`, sheet panel), not on every leaf.
2. Primary CTAs that Maestro must tap get their own `testID` (or pass `testID` into shared [`Button`](../src/components/Button.tsx)).
3. Prefer Maestro `id:` over visible marketing copy. Tab bar may keep `tapOn: Log` (native labels).
4. **Do not rename** an existing `testID` for aesthetics — treat it as a breaking change (update all YAML in the same PR).
5. Add IDs in the **same change** as the flow that needs them — no drive-by ID sprawl “for later.”
6. Shared rows (`MenuRow`, etc.) should accept optional `testID` and forward it to `Pressable`.

Also set `accessibilityRole` / `accessibilityLabel` for a11y ([DESIGN.md](./DESIGN.md) § Accessibility). Labels may change with copy; `testID`s should not.

### Inventory (current `testID`s)

Keep this table honest when you add or remove IDs.

| testID | Where | Used by |
|--------|-------|---------|
| `login-screen` | Login root | `smoke-unauth` |
| `login-sign-in` / `login-create-account` / `login-legal-notice` | Login CTAs / notice | `smoke-unauth` |
| `today-screen` | Today tab | shell + most auth flows |
| `today-recommendation` | Recommendation hero | `flow-today-recommendation`, accept flow |
| `today-recommendation-accept` | Accept CTA (when `canAccept`) | `flow-recommendation-accept` |
| `today-readiness-panel` | Analyze Readiness empty state | today / accept flows (fallback) |
| `daily-checkin` / `daily-checkin-sheet` / `daily-checkin-cancel` / `daily-checkin-submit` | Today CTA + routed sheet controls | `flow-daily-coach-checkin-open` |
| `log-screen` | Log tab | shell, log flows, deeplink |
| `wellness-checkin` | Log wellness banner CTA | check-in open / save |
| `wellness-checkin-sheet` / `wellness-checkin-save` / `wellness-checkin-saved` | Wellness sheet | check-in flows |
| `log-meal` / `log-meal-sheet` | Meal CTA + sheet | `flow-log-meal-open` |
| `log-meal-search-tab` / `log-meal-scan-barcode` / `barcode-scanner-modal` / `barcode-scanner-close` | Meal search → barcode scanner open/cancel path | `flow-log-meal-open` |
| `coach-screen` | Coach tab | shell, compose, deeplink |
| `coach-composer` / `coach-send` | Chat composer | `flow-coach-compose` |
| `more-screen` | More tab | shell, more hubs |
| `more-athlete-profile` / `more-settings` / `more-health-sync` | More / Settings hubs | `flow-more-hubs` |
| `more-subscription` | More → Account → Subscription | `more-subscription` |
| `more-invite-friends` | More → Account → Invite a friend (hosted/local) | `more-invite` |
| `today-greeting-name` | Today greeting → Athlete | `today-athlete`, `flow-more-hubs` |
| `athlete-sports` / `settings-sports` | Sports & thresholds entries (Athlete + Settings) | `today-athlete` |
| `invite-screen` / `invite-qr` / `invite-code` / `invite-share` | Invite share surface | `more-invite` |
| `athlete-screen` / `settings-screen` | Stack screens | `flow-more-hubs` |
| `subscription-screen` | Subscription / billing screen root | `more-subscription` |
| `subscription-billing-support` | "Need help with billing?" link (renders on every tier) | `more-subscription` |
| `subscription-restore` | `RestoreRow` CTA — **store-gated**, see note below | `more-subscription` (optional assert) |
| `paywall-screen` | Contextual paywall root (`app/(app)/paywall.tsx`) | (reserved; store-gated) |
| `subscription-plan-chooser` | `PlanChooser` container — **store-gated** | (reserved; store-gated) |
| `subscription-plan-<tier>-<period>` (+ `-cta`) | Per-package card and its buy button, e.g. `subscription-plan-pro-annual` | (reserved; store-gated) |
| `quota-limit-card` | `QuotaLimitCard` plan-limit state | (reserved; quota-exhausted fixture) |
| `finish-setup-card` | Activation card on Today | (reserved; incomplete-activation fixture) |

**Store-gated IDs.** `RestoreRow`, `PlanChooser` and the paywall's plan section mount only when
`canAcquireNativeSubscription()` is true, which requires the **official hosted instance**
(`https://coachwatts.com`) — see `src/features/subscriptions/gating.ts`. The e2e harness authenticates
against `http://<host>:3199`, so these never render in a Maestro run. `more-subscription` therefore
asserts `subscription-restore` with `optional: true` and gates on `subscription-billing-support`,
which is unconditional. The remaining store-gated IDs are the surface a future purchase flow
(interactive App Store / Play sandbox, out of scope for CI) would build on.

### File / flow naming

| Kind | Path | Notes |
|------|------|-------|
| Workspace config | `maestro/config.yaml` | Default suite order + `excludeTags: standalone` |
| Smoke (CI gate) | `maestro/smoke-*.yaml` | Keep tiny and stable |
| Shared session suite | `maestro/suite-shared.yaml` | **One** wipe + login, then chained scenarios |
| Isolated entry | `maestro/flow-*.yaml` (mutations) / `smoke-unauth` | Full wipe + login each run |
| Scenario body | `maestro/scenarios/*.yaml` | No boot — used by suite-shared / standalone |
| Standalone debug | `maestro/standalone/flow-*.yaml` | Wipe + one scenario; excluded from default suite |
| Shared steps | `maestro/subflows/*.yaml` | e.g. `boot-and-login`, `reset-to-today` |
| Auth comment | Top of every YAML | Auth on/off + fixture needs + isolated vs shared |

### Suite layout (speed)

Default `pnpm test:e2e` pays wipe + Metro attach + login **once** for all read-only / open scenarios, then isolates only when required:

| Entry | Wipe / login | Contents |
|-------|--------------|----------|
| `smoke-unauth` | Isolated | Login chrome |
| `suite-shared` | **Once** via `boot-and-login` | shell → today → log sheets → coach → more → deeplinks |
| `flow-wellness-save` | Isolated | Mutation |
| `flow-recommendation-accept` | Isolated | Mutation |

Between shared scenarios, [`reset-to-today.yaml`](../maestro/subflows/reset-to-today.yaml) soft-resets UI (Cancel sheet + `coachwatts://today`) **without** clearing SecureStore.

Every new **suite entry** must:

1. Be either (a) a scenario under `maestro/scenarios/` wired into `suite-shared.yaml`, or (b) an **isolated** top-level flow that starts with `runFlow: subflows/boot-and-login.yaml` (or unauth `clearState` + `clearKeychain`)
2. Wait on a screen `testID` with `extendedWaitUntil` (network screens: 15–45s)
3. Be listed in [`scripts/validate-maestro-flows.mjs`](../scripts/validate-maestro-flows.mjs) `REQUIRED`
4. Appear in the [Flows](#flows) table below

Do **not** add a new top-level `flow-*.yaml` that wipes on every run unless it mutates server/auth state.

### How to add a flow (checklist)

1. Confirm Vitest cannot cover it and it is not OS/manual-only.
2. Add root / CTA `testID`s in app code (same PR).
3. Prefer a `maestro/scenarios/{name}.yaml` body + `runFlow` from `suite-shared.yaml` (with `reset-to-today` before it).
4. If it **mutates** fixture state: add an isolated top-level `flow-*.yaml` with `boot-and-login` + document `pnpm e2e:reset`.
5. Optional: thin `maestro/standalone/flow-*.yaml` for single-scenario debug.
6. Run locally: `pnpm test:e2e:shared` or the standalone file; register in `validate-maestro-flows.mjs` + Flows table.
7. Prefer iOS Simulator until Android-specific UI diverges.

### How to change UI without breaking the suite

1. Grep for the `testID` / flow name: `rg 'today-recommendation|flow-today' maestro app src`
2. If you remove a surface, delete or rewrite the flow — do not leave a dead YAML.
3. If copy changes but `testID` stays, Maestro `id:` flows keep working.
4. After structural nav changes, run `pnpm test:e2e:smoke` (and the affected `flow-*`).
5. OpenSpec / feature tasks that ship a new companion entry point should include an explicit e2e bullet (testID + flow or “manual — see matrix”).

### PR checklist (companion UI)

- [ ] New interactive surface on Today / Log / Coach / More has a root `testID` if athletes must reach it for the daily loop
- [ ] Existing Maestro `id:`s still match (or YAML updated in this PR)
- [ ] New journey registered as a `scenarios/` body in `suite-shared` (or isolated mutation flow) + `validate-maestro-flows.mjs` + Flows table
- [ ] Ran `pnpm test:e2e:validate` (always) and `pnpm test:e2e:shared` or the affected file when UI changed
- [ ] No `EXPO_PUBLIC_E2E_*` enabled on store / preview / release profiles
- [ ] Mutations documented with `e2e:reset` if they dirty the fixture athlete

### Don’ts

- Don’t assert long marketing sentences or theme-dependent colors
- Don’t automate the Expo Dev Menu beyond [`subflows/connect-dev-client.yaml`](../maestro/subflows/connect-dev-client.yaml)
- Don’t commit fixture tokens or enable e2e auth on store builds
- Don’t grow smoke-unauth / smoke-shell into full regressions — put journeys in `flow-*`
- Don’t send chat / burn LLM quota in Maestro unless the flow is explicitly designed for it and reset-safe
- Don’t block PRs on flaky local Metro; fix selectors/flows, keep CI `validate-flows` green

---
## Prerequisites

- Built dev client on a simulator (`pnpm ios` — iOS Simulator recommended first)
- [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro) installed
- For authenticated flows: **coach-wattz e2e stack** on `:3199` (preferred) or a fixture Bearer against local `:3099`

## Backend target (do this right)

Prefer the shared **coach-wattz e2e stack**, not your personal local DB:

| | Dev API (`:3099`) | E2E stack (`:3199`) |
|--|-------------------|---------------------|
| Data | Your real athlete | Seeded `e2e-athlete@coachwatts.test` |
| Auth | Manual token / PKCE | `POST /api/__e2e/token` |
| Determinism | Low | High (resettable DB) |
| Use for | Ad-hoc device smoke | Maestro suite |

Full coach-wattz runbook: `~/Develop/coach-wattz/docs/04-guides/e2e-testing.md`.

### Bring up the e2e API

```bash
# In coach-wattz
pnpm e2e:up
# or: pnpm e2e:up:infra && pnpm e2e:db:prepare && pnpm e2e:app:host
```

API base: `http://localhost:3199` (health: `GET /api/health`).

### Mint a fixture Bearer

```bash
curl -s -X POST http://localhost:3199/api/__e2e/token \
  -H 'content-type: application/json' \
  -d '{"email":"e2e-athlete@coachwatts.test"}'
```

Use `access_token` (and optionally `refresh_token`) in watts-mobile `.env`. Do not commit tokens.

Seeded fixtures (coach-wattz `E2E_MODE`):

- Athlete: `e2e-athlete@coachwatts.test`
- Mobile OAuth public client id: `e2e00000-0000-4000-8000-000000000001`
- Completed today `ActivityRecommendation` for the athlete (UTC)

### Reset between mutation flows

```bash
# In coach-wattz — truncate + re-seed while stack is up
pnpm e2e:reset
```

Re-mint the Bearer after reset if tokens were invalidated, then reload the app.

## E2E auth flavor

### Preferred — deep-link login (local Maestro)

Authenticated flows run [`maestro/subflows/e2e-login.yaml`](../maestro/subflows/e2e-login.yaml) after packager connect. Prefer:

```bash
pnpm test:e2e:shell   # uses scripts/run-maestro-e2e.mjs
```

That injects `E2E_LOGIN_URL` = `coachwatts://e2e/login?email=…&instance=…`. The app mints a Bearer via `POST /api/__e2e/token` and seeds SecureStore. **Metro does not need `EXPO_PUBLIC_E2E_AUTH`.** Leave it unset in `.env.local` (shell `EXPO_PUBLIC_E2E_*=` pollution also overrides dotenv).

**Packager connect:** [`connect-dev-client.yaml`](../maestro/subflows/connect-dev-client.yaml) prefers `127.0.0.1` / `localhost`, otherwise deep-links the loopback packager. Do **not** tap a random LAN `:8081` row — another host on the network can serve a stale bundle.

**Loopback e2e tunnels:** if coach-wattz e2e is only on `127.0.0.1:3199` (e.g. `ssh -L`), the Simulator may hang minting against loopback. `run-maestro-e2e.mjs` forwards the Mac LAN IP → `127.0.0.1:3199` and puts that host in the deep link. Dev builds also allow private LAN hosts for this path.

Host allowlist: `localhost` / `127.0.0.1` / `10.0.2.2`, RFC1918 in `__DEV__`, plus `EXPO_PUBLIC_E2E_ALLOWED_HOSTS`. Android emulator: `instance=http://10.0.2.2:3199`.

### Fallback — env seed (CI / baked e2e binary)

When `EXPO_PUBLIC_E2E_AUTH=1`, bootstrap skips system-browser PKCE and seeds SecureStore from env (used after deep-link pending login is absent):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_E2E_AUTH` | `1` / `true` enables seed |
| `EXPO_PUBLIC_E2E_INSTANCE_URL` | Instance base URL (no `/api`). Defaults to `EXPO_PUBLIC_DEFAULT_INSTANCE_URL` |
| `EXPO_PUBLIC_E2E_ACCESS_TOKEN` | Fixture access token (required when auth is on) |
| `EXPO_PUBLIC_E2E_REFRESH_TOKEN` | Optional refresh token |
| `EXPO_PUBLIC_E2E_ALLOWED_HOSTS` | Extra hostnames (comma-separated) beyond localhost / `127.0.0.1` / `10.0.2.2` |
| `EXPO_PUBLIC_E2E_ALLOW_ANY_HOST` | `1` to skip host allowlist (staging only) |

**Never** set these on **preview**, **production**, or store EAS profiles (or on GitHub Release APKs from `pnpm release:android:github`). Tokens in `EXPO_PUBLIC_*` are embedded in the JS bundle for that build. Use only the dedicated `e2e` EAS profile / local `.env` when you need the env-seed fallback.

#### Enforced in code, not just by convention (CW-354)

This is no longer a documentation-only rule — two guards back it, both keyed off `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, which `eas.json` sets per profile:

* **Runtime resolver** — `resolveE2eAuthEnabled()` in `src/config/e2eGuard.ts` computes `E2E_AUTH_ENABLED` in `src/config/env.ts`. The flag only takes effect when the build is a dev build (`__DEV__`) **or** `EXPO_PUBLIC_SENTRY_ENVIRONMENT === 'e2e'`. On any other environment it logs a `console.error` and resolves to `false` — deliberately *not* a throw, since that runs at module load and would turn a config mistake into a crash on launch. `E2E_ACCESS_TOKEN` / `E2E_REFRESH_TOKEN` resolve to `''` whenever the resolver says disabled, so fixture tokens never reach `src/auth/e2eAuth.ts`.
* **Build-time assertion** — `app.config.ts` throws during config resolution when `EXPO_PUBLIC_E2E_AUTH` is truthy while `EXPO_PUBLIC_SENTRY_ENVIRONMENT` resolves to `production`. A mis-set production build fails at `expo prebuild` / `eas build` instead of shipping.

| `EXPO_PUBLIC_E2E_AUTH` | `__DEV__` | `EXPO_PUBLIC_SENTRY_ENVIRONMENT` | E2E auth + tokens | Build |
|---|---|---|---|---|
| off | any | any | disabled | ok |
| on | true | `development` (local Metro / dev client) | **enabled** | ok |
| on | false | `e2e` (EAS `e2e` profile) | **enabled** | ok |
| on | false | `preview` | disabled + `console.error` | ok |
| on | false | `production` | disabled + `console.error` | **throws** |

Both documented local paths are unaffected: `pnpm test:e2e` runs against a dev-client build where `__DEV__` is true, and the EAS `e2e` profile sets `EXPO_PUBLIC_SENTRY_ENVIRONMENT=e2e`.

### Simulator → instance URL

| Target | E2E stack (preferred) | Ad-hoc local API |
|--------|----------------------|------------------|
| iOS Simulator | `http://127.0.0.1:3199` (avoid `localhost` / `::1`) | `http://127.0.0.1:3099` |
| Android Emulator | `http://10.0.2.2:3199` | `http://10.0.2.2:3099` |
| Physical device | `http://<mac-lan-ip>:3199` | `http://<mac-lan-ip>:3099` |

## Selector convention

1. **Screen / sheet roots** get stable `testID`s (`today-screen`, `log-meal-sheet`, …).
2. **Primary CTAs** get `testID`s (`log-meal`, `coach-send`, …).
3. **Tab bar** may use Maestro `tapOn: Log` (native tab labels).
4. Prefer Maestro `id:` over visible marketing copy.
5. Add IDs in the same change as the flow that needs them.

## Local run

### Day-to-day workflow

```text
coach-wattz:  pnpm e2e:up            # API on :3199
watts-mobile: pnpm start             # Metro; leave EXPO_PUBLIC_E2E_AUTH unset
              pnpm ios               # once / after native changes
              pnpm test:e2e:unauth   # login chrome
              pnpm test:e2e:shell    # deep-link mints token → Today shell
coach-wattz:  pnpm e2e:reset         # between mutation flows
```

### Unauthenticated smoke

Normal `.env` (e2e env seed **off**). App already installed on the sim; Metro running:

```bash
pnpm test:e2e:unauth
```

### Authenticated suite

1. coach-wattz e2e stack up (`GET http://localhost:3199/api/health`).
2. Same Metro as unauth — **no** need to set `EXPO_PUBLIC_E2E_AUTH` or paste tokens.
3. Run:

```bash
pnpm test:e2e:shell          # isolated shell only (boot + scenarios/shell-tabs)
pnpm test:e2e:smoke          # unauth + shell (CI gate locally)
pnpm test:e2e:shared         # one login → all non-mutation scenarios
pnpm test:e2e:isolated       # unauth + wellness-save + recommendation-accept
pnpm test:e2e                # default suite (config.yaml order; skips standalone/*)
```

Optional CI fallback: bake `EXPO_PUBLIC_E2E_*` into an `e2e` EAS profile (see below) when the binary cannot reach `__e2e/token` at runtime.

**Fixture notes**

- Companion flows assume a **soft-activated** e2e athlete (consent + primary goal + active plan + seeded today recommendation). Connect-last may still be pending (`FinishSetupCard` on Today) — that is fine for shell / daily-loop flows.
- If you land on the activation “Your goal” wizard, the e2e DB is stale or pre-dates soft-activation seeding — run `pnpm e2e:reset` in coach-wattz.
- `flow-log-meal-open` requires nutrition tracking enabled on the fixture profile.
- Mutation flows (`flow-wellness-save`, `flow-recommendation-accept`) expect `pnpm e2e:reset` between runs when state drifts.

### Flake hygiene

- **Isolated** entry flows: `clearState` + `clearKeychain` via [`boot-and-login`](../maestro/subflows/boot-and-login.yaml) (or unauth launch). Shared scenarios must **not** wipe.
- Prefer `pnpm test:e2e*` (runs [`scripts/run-maestro-e2e.mjs`](../scripts/run-maestro-e2e.mjs)) over bare `maestro test …` so `E2E_LOGIN_URL` + LAN forward are set
- `extendedWaitUntil` for network screens (Today often needs ~45–90s after login)
- Prefer `id:` over text; pin one iOS Simulator model; one assertion per critical surface
- See [What to look for](#what-to-look-for-maestro--dev-client-harness) before rewriting auth code

---

## What to look for (Maestro + dev-client harness)

Most “e2e login is broken” failures are **harness**, not product auth. Check these in order.

### Symptom → cause → fix

| Symptom | Likely cause | What to check / fix |
|---------|--------------|---------------------|
| Login shows **Request timed out** right after cold start (before or without `e2e-login`) | App attached to the **wrong Metro** (another LAN host’s `:8081`) or env seed hitting a bad host | Maestro debug screenshot: which packager row was tapped? Connect must prefer `127.0.0.1` / `localhost`, else deep-link `exp+coach-watts-app://expo-development-client/?url=http://127.0.0.1:8081` — **never** “first `:8081` row”. Confirm this Mac: `curl -s http://127.0.0.1:8081/status` |
| Same timeout **after** `openLink` e2e login; host `curl` to `:3199` is fine | Simulator **cannot reach** e2e on loopback-only bind (`ssh -L 127.0.0.1:3199`); mint hangs until abort | Use `pnpm test:e2e:shell` so [`run-maestro-e2e.mjs`](../scripts/run-maestro-e2e.mjs) forwards **Mac LAN IP → 127.0.0.1:3199** and puts that host in `E2E_LOGIN_URL`. Verify: `curl http://<lan-ip>:3199/api/health` |
| Unauth + auth need Metro restart / env flip | Still relying on `EXPO_PUBLIC_E2E_AUTH` | Deep-link path needs auth **off**. Set `EXPO_PUBLIC_E2E_AUTH=0` or empty in `.env.local`, **and** `unset EXPO_PUBLIC_E2E_AUTH` in the shell (dotenv does not override exported vars). Restart Metro after changes |
| Stuck on **Open in “Coach Watts”?** over DEVELOPMENT SERVERS | Stale scheme confirm from a prior `openLink` | [`connect-dev-client.yaml`](../maestro/subflows/connect-dev-client.yaml) Cancels Open first. [`e2e-login.yaml`](../maestro/subflows/e2e-login.yaml) waits/taps Open when present (optional — foreground `openLink` often skips the sheet) |
| Splash / **In progress** forever | Metro down or packager never attached | Start Metro first; connect deep-links loopback when server list missing. Do **not** tap a server **and** deep-link (Fabric `AppContextLost` / SIGTRAP) |
| Native crash after Dev Menu **Continue** | Double packager attach | One attach path only (see connect subflow comments) |
| Activation **Your goal** wizard instead of Today | e2e athlete not soft-activated | coach-wattz `pnpm e2e:reset` (seed must include primary goal + active plan) |
| `localhost:3199` hangs, `127.0.0.1:3199` works from host | IPv6 `::1` vs IPv4 | Prefer `127.0.0.1` in deep links; `mintE2eToken` rewrites `localhost` → `127.0.0.1` |
| `smoke-unauth` lands on Today as E2E | Tokens survived `clearState` | Always `clearKeychain: true` with `clearState` on cold launches |
| `tapOn: More` opens recommendation action sheet | Today CTA label collides with tab | Use [`subflows/tap-tab-more.yaml`](../maestro/subflows/tap-tab-more.yaml) (`coachwatts://more`), not bare `tapOn: More` from Today |
| Log check-in sheet never appears; Dev Menu visible | Expo floating **Tools** FAB steals taps (opens Dev Menu) | App hides FAB via [`hideDevMenuFab`](../src/dev/hideDevMenuFab.ts) on launch; [`dismiss-dev-menu.yaml`](../maestro/subflows/dismiss-dev-menu.yaml) closes leftover menus (`xmark` / swipe DOWN) |
| Sheet opens but `mood-score-7` / `wellness-checkin-save` missing; `scrollUntilVisible` fails | Modal sheet `Pressable` is a single a11y node (children flattened); ScrollView inside Modal is opaque to Maestro scroll | Sheet + backdrop use `accessible={false}`; Save is a **sticky** CTA outside the ScrollView; taps can use a11y text `Mood 7` |

### Quick triage checklist

```text
1. curl http://127.0.0.1:8081/status          → packager-status:running
2. curl http://127.0.0.1:3199/api/health      → 200
3. env | rg EXPO_PUBLIC_E2E_AUTH              → empty / 0 (for deep-link local)
4. .env.local E2E_AUTH                        → 0 or unset (not true/1)
5. Maestro failure screenshot                 → wrong packager IP? Open sheet? login error copy?
6. pnpm test:e2e:shell                        → runner prints instance http://<lan>:3199 when forwarding
```

### Intentional design (so we don’t “fix” it back)

| Piece | Role |
|-------|------|
| `coachwatts://e2e/login?email=&instance=` | Runtime mint via `__e2e/token` — no Metro token bake-in |
| `+native-intent` + AuthProvider wake | Pending login can arrive **after** first bootstrap (Maestro `openLink`) |
| `run-maestro-e2e.mjs` | Sets `E2E_LOGIN_URL`; LAN-forwards loopback-only e2e |
| `connect-dev-client.yaml` | Safe packager attach; Cancel stale Open; no random LAN tap |
| `applyE2eAuthSeed` | CI / baked `e2e` profile **fallback** only |

OpenSpec: `openspec/changes/e2e-deeplink-login/`.

## EAS profile

`eas.json` includes an `e2e` profile that extends `development` and sets `EXPO_PUBLIC_E2E_AUTH=1` + e2e instance URL (`http://localhost:3199`). Supply `EXPO_PUBLIC_E2E_ACCESS_TOKEN` via EAS secrets or local env when building — not committed.

## Flows

| File | What it checks | Auth | Isolation |
|------|----------------|------|-----------|
| `maestro/smoke-unauth.yaml` | Cold start → login screen | Off | Isolated wipe |
| `maestro/suite-shared.yaml` | Shell + open journeys + deeplinks (one session) | On | Shared (boot once) |
| `maestro/smoke-shell.yaml` | Tab shell only (CI / `test:e2e:shell`) | On | Isolated (standalone tag) |
| `maestro/scenarios/shell-tabs.yaml` | Today → Log → Coach → More | On | Scenario |
| `maestro/scenarios/today-recommendation.yaml` | Recommendation or readiness panel | On | Scenario |
| `maestro/scenarios/log-checkin-open.yaml` | Wellness check-in sheet open | On | Scenario |
| `maestro/scenarios/log-meal-open.yaml` | Meal sheet → food search → barcode scanner open/cancel (nutrition on) | On | Scenario |
| `maestro/scenarios/coach-compose.yaml` | Coach composer + send | On | Scenario |
| `maestro/scenarios/more-hubs.yaml` | More → profile / Settings → health source | On | Scenario |
| `maestro/scenarios/today-athlete.yaml` | Today name → Athlete → Sports & thresholds | On | Scenario |
| `maestro/scenarios/more-invite.yaml` | More → Invite a friend QR / share | On | Scenario |
| `maestro/scenarios/more-subscription.yaml` | More → Subscription screen renders (read-only; no purchase) | On | Scenario |
| `maestro/scenarios/deeplink-*.yaml` | Scheme deep links | On | Scenario |
| `maestro/flow-wellness-save.yaml` | Wellness save (mutation; reset after) | On | Isolated wipe |
| `maestro/flow-recommendation-accept.yaml` | Accept recommendation when CTA present | On | Isolated wipe |
| `maestro/standalone/flow-*.yaml` | Single-scenario debug wrappers | On | Isolated (excluded from default) |

## Manual / sandbox matrix (out of Maestro)

These stay manual or store-sandbox. Unauth smoke already proves login chrome; do not automate OS sheets.

| Area | How to verify | Notes |
|------|---------------|-------|
| System-browser PKCE | Sign in on a non-e2e build against `:3099` or hosted | Real ASWebAuthenticationSession / Chrome Custom Tabs |
| HealthKit / Health Connect | Settings → Health Sync → grant / deny | OS permission sheet; simulator Health data optional |
| Store IAP (RevenueCat) | Sandbox Apple / Play license testers | OpenSpec `store-subscriptions-revenuecat` task 7.3; unit-test adapters. Maestro `more-subscription` covers navigation + rendered chrome only — purchase/restore need an interactive sandbox account and a hosted-instance login, so they cannot run headless |
| Barcode camera permission + real product scan | Fresh install/device → Log Meal → Search Food → Scan | Maestro covers scanner open/cancel; verify OS permission and barcode recognition manually |
| Push permission denial | Fresh install → deny notifications | Inbox still reachable from More |
| Full activation wizard | Incomplete-activation athlete (not e2e happy-path) | consent → goal → plan → insight → connect; add Maestro after activation `testID`s |
| Airplane / offline check-in queue | Toggle airplane mid-save | Manual until offline queue hardening ships |
| Universal Links | Hosted AASA / assetlinks live | Scheme deep links are covered by Maestro `openLink` |

## CI / store gate

GitHub Actions workflows: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for
static validation and [`.github/workflows/e2e-smoke.yml`](../.github/workflows/e2e-smoke.yml)
for manual simulator smoke.

| Job | When | What |
|-----|------|------|
| `CI / Quality gates` | PRs into `develop` / `master`, pushes to `develop` | YAML parse + required flow files present; does **not** launch Maestro |
| `validate-flows` | `workflow_dispatch` (manual) | Validate the flow definitions before the simulator build |
| `ios-smoke` | `workflow_dispatch` (manual) | Build sim app → `smoke-unauth`; optionally `smoke-shell` when secrets + reachable e2e API are set |

Secrets / vars for authenticated CI smoke (optional):

| Name | Purpose |
|------|---------|
| `E2E_ACCESS_TOKEN` | Fixture Bearer (minted from coach-wattz `__e2e/token`) |
| `E2E_INSTANCE_URL` | Default `http://localhost:3199` (or tunneled host) |

Never bake fixture tokens into store / preview artifacts. Maestro execution is manual; the regular CI gate only validates the checked-in flow definitions. Full companion suites remain local until the flaky rate is near zero.
