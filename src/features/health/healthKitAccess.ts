import type { HealthAuthStatus } from '@/src/features/log/healthAuth';

/**
 * What the Apple Health card is allowed to claim about read access (CW-571).
 *
 * HealthKit never reports whether *read* access was granted:
 *
 * > "Your app doesn't know whether someone granted or denied permission to read
 * > data from HealthKit."
 * > — https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
 *
 * `getRequestStatusForAuthorization` does not fill that gap either.
 * `.unnecessary` means authorization "has already been granted **or** denied" —
 * it only says *we already asked*. Treating it as "connected" showed a green
 * Connected badge to athletes who had denied every category, while "Sync now"
 * reported no data found on the same screen.
 *
 * The only honest positive signal is a read that actually came back with a
 * sample, so `connected` is reserved for that. Everything else that has already
 * been asked degrades to `unnecessary`, which the screen renders as
 * *unverified* rather than connected.
 *
 * Deliberately pure — no React, no react-native, no HealthKit imports — so the
 * decision is unit-testable off-device. The native probe is a thin shim in
 * `healthAuth.ts`.
 */

/** Normalised form of `AuthorizationRequestStatus`, plus the unusable case. */
export type HealthKitRequestStatus =
  /** HealthKit is not usable on this device, or the status call itself failed. */
  | 'unavailable'
  /** Never asked for this type set — requesting will present the system sheet. */
  | 'should_request'
  /** Already asked. Grant state is unknowable; the sheet will not appear again. */
  | 'already_requested';

export type HealthKitAccessInput = {
  requestStatus: HealthKitRequestStatus;
  /**
   * True only when a probe read actually returned a sample. `false` is *not*
   * evidence of denial — an athlete with an empty Health store reads the same
   * way as one who denied everything, which is precisely why this can only ever
   * upgrade the status, never downgrade it.
   */
  probeFoundData: boolean;
};

/**
 * Map the HealthKit request status plus probe evidence onto the shared status.
 *
 * `connected` requires positive evidence. A failed or empty probe leaves an
 * already-asked device on `unnecessary` — honest about not knowing — so a
 * flaky probe can never manufacture a "denied"-looking state for someone whose
 * access is fine.
 */
export function resolveHealthKitAccess(input: HealthKitAccessInput): HealthAuthStatus {
  if (input.requestStatus === 'unavailable') return 'not_available';
  if (input.requestStatus === 'should_request') return 'should_request';
  return input.probeFoundData ? 'connected' : 'unnecessary';
}

/**
 * Whether tapping a connect control can still produce the system consent sheet.
 *
 * iOS presents it only once per type set; afterwards `requestAuthorization`
 * resolves immediately with no UI. Offering a button that provably cannot do
 * anything is what made this state a dead end for the reporter, so the screen
 * asks this before rendering one.
 */
export function canPromptHealthKitSheet(status: HealthAuthStatus): boolean {
  return status === 'should_request';
}
