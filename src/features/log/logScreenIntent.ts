/**
 * Pure decision logic for the Log tab's deep-link handling.
 *
 * The Log tab screen stays mounted for the whole session, so every incoming
 * `?action=`/`?section=` param has to be consumed exactly once: opened, then
 * cleared. Keeping the decision here (rather than inline in the screen) makes
 * the rules testable — none of these paths are reachable from a render test.
 */

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
};

const NO_INTENT: LogScreenIntent = {
  open: null,
  clearParams: [],
  handledPhotoToken: null,
  claimUntokenedCamera: false,
  releaseUntokenedCamera: false,
};

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
      return { ...claimed, open: null, releaseUntokenedCamera: true };
    }

    return { ...claimed, open: 'photoMealRoute', releaseUntokenedCamera: true };
  }

  // `?action=` wins over `?section=` when both are present.
  const resolved =
    (action ? actionTarget(action) : null) ??
    (section ? sectionTarget(section, input.nutritionEnabled) : null);

  const hasConsumableParam = action != null || section != null;

  return {
    open: resolved,
    // Clear whatever we consumed — including params we recognised but chose
    // not to act on, so they cannot re-open a sheet on the next tab switch.
    clearParams: hasConsumableParam ? ['action', 'section', 't'] : [],
    handledPhotoToken: null,
    claimUntokenedCamera: false,
    releaseUntokenedCamera: true,
  };
}
