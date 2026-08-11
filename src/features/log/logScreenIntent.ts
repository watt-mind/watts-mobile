/**
 * Pure decision logic for the Log tab's deep-link handling.
 *
 * The Log tab screen stays mounted for the whole session, so every incoming
 * `?action=`/`?section=` param has to be consumed exactly once: opened, then
 * cleared. Keeping the decision here (rather than inline in the screen) makes
 * the rules testable — none of these paths are reachable from a render test.
 */

import type { LogTabPreference } from './logTabPreference';

/** Surfaces the Log screen can open in response to a route param. */
export type LogScreenTarget =
  | 'meal'
  | 'water'
  | 'wellness'
  | 'measurement'
  | 'nutritionDetail'
  | 'measurementsDetail'
  | 'photoMealRoute';

export type LogScreenIntentInput = {
  /** `?action=` param, if present. */
  action?: string;
  /** `?section=` param, if present. */
  section?: string;
  /** `?t=` launch token used to de-duplicate repeated camera launches. */
  token?: string;
  nutritionEnabled: boolean;
  /** True when a fullscreen photo-meal route is already on the stack. */
  onPhotoMealRoute: boolean;
  /** Token of the camera launch already handled by this screen instance. */
  handledPhotoToken: string | null;
  /** True while an untokened camera launch is still being processed. */
  untokenedCameraBusy: boolean;
  /** Device preference for the default Log view. */
  preference?: LogTabPreference;
  /** False while the preference is still hydrating from storage. */
  preferenceReady?: boolean;
  /** True once this screen instance has already settled its opening view. */
  defaultViewApplied?: boolean;
};

export type LogScreenIntent = {
  /** Sheet/route to open, or null when there is nothing to do. */
  open: LogScreenTarget | null;
  /** Params to clear so the effect cannot re-fire on the next tab switch. */
  clearParams: ('action' | 'section' | 't')[];
  /** Token to record as handled, so the same launch is not replayed. */
  handledPhotoToken: string | null;
  /** True when the untokened-camera guard should be claimed. */
  claimUntokenedCamera: boolean;
  /** True when the untokened-camera guard should be released. */
  releaseUntokenedCamera: boolean;
  /**
   * True once the screen has settled its opening view, so the default-view
   * preference is never applied again for this screen instance (including on
   * the re-run triggered by clearing the consumed params).
   */
  markDefaultViewApplied: boolean;
};

const NO_INTENT: LogScreenIntent = {
  open: null,
  clearParams: [],
  handledPhotoToken: null,
  claimUntokenedCamera: false,
  releaseUntokenedCamera: false,
  markDefaultViewApplied: true,
};

/**
 * Which sheet the "Default log view" preference opens when the athlete enters
 * Log without a deep link. `auto` (and the legacy `recovery` value, which has
 * no surface on the single-page Log) opens nothing and simply lands on the
 * page — the default behaviour.
 */
export function resolveDefaultLogSheet(
  preference: LogTabPreference,
  nutritionEnabled: boolean,
): LogScreenTarget | null {
  if (preference === 'wellness') return 'wellness';
  if (preference === 'measurements') return 'measurementsDetail';
  if (preference === 'nutrition') return nutritionEnabled ? 'nutritionDetail' : null;
  return null;
}

function sectionTarget(section: string, nutritionEnabled: boolean): LogScreenTarget | null {
  if (section === 'wellness') return 'wellness';
  if (section === 'measurements') return 'measurementsDetail';
  if (section === 'nutrition') return nutritionEnabled ? 'nutritionDetail' : null;
  return null;
}

function actionTarget(action: string): LogScreenTarget | null {
  if (action === 'meal') return 'meal';
  if (action === 'water') return 'water';
  if (action === 'wellness') return 'wellness';
  if (action === 'measurement') return 'measurement';
  return null;
}

/** Decide what the Log screen should do for the current route params. */
export function resolveLogScreenIntent(input: LogScreenIntentInput): LogScreenIntent {
  const { action, section } = input;

  if (action === 'camera') {
    const token = typeof input.token === 'string' && input.token.length > 0 ? input.token : null;

    if (token != null) {
      // Same launch token as the one we already handled: ignore the replay.
      if (input.handledPhotoToken === token) return NO_INTENT;
    } else if (input.untokenedCameraBusy) {
      return NO_INTENT;
    }

    const claimed = {
      clearParams: ['action', 't'] as ('action' | 'section' | 't')[],
      handledPhotoToken: token,
      claimUntokenedCamera: token == null,
    };

    // Match Today: do not open AI photo logging when nutrition tracking is off.
    // Also avoid stacking multiple fullscreen photo-meal routes.
    if (!input.nutritionEnabled || input.onPhotoMealRoute) {
      return { ...claimed, open: null, releaseUntokenedCamera: true, markDefaultViewApplied: true };
    }

    return {
      ...claimed,
      open: 'photoMealRoute',
      releaseUntokenedCamera: true,
      markDefaultViewApplied: true,
    };
  }

  // `?action=` wins over `?section=` when both are present.
  const resolved =
    (action ? actionTarget(action) : null) ??
    (section ? sectionTarget(section, input.nutritionEnabled) : null);

  const hasConsumableParam = action != null || section != null;

  if (!hasConsumableParam) {
    // No deep link: fall back to the athlete's default-log-view preference,
    // once per screen instance and only after the preference has hydrated.
    if (input.defaultViewApplied) return { ...NO_INTENT, releaseUntokenedCamera: true };
    if (input.preferenceReady === false) {
      // Still hydrating — do nothing yet and re-decide once it lands.
      return { ...NO_INTENT, releaseUntokenedCamera: true, markDefaultViewApplied: false };
    }
    return {
      ...NO_INTENT,
      open: resolveDefaultLogSheet(input.preference ?? 'auto', input.nutritionEnabled),
      releaseUntokenedCamera: true,
    };
  }

  return {
    open: resolved,
    // Clear whatever we consumed — including params we recognised but chose
    // not to act on, so they cannot re-open a sheet on the next tab switch.
    clearParams: ['action', 'section', 't'],
    handledPhotoToken: null,
    claimUntokenedCamera: false,
    releaseUntokenedCamera: true,
    // A deep link always wins over the default-view preference, and the
    // re-run caused by clearing these params must not open the default.
    markDefaultViewApplied: true,
  };
}
