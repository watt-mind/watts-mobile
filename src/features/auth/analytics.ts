import * as Sentry from '@sentry/react-native';

import { AuthFlowError, isAuthCancellation } from '@/src/auth/authErrors';

function safeInstanceHost(instanceUrl: string | null | undefined): string {
  if (!instanceUrl) return 'unknown';
  try {
    return new URL(instanceUrl).hostname;
  } catch {
    return 'invalid';
  }
}

export function trackAuthStage(
  message: string,
  data: { stage: string; code?: string; instanceUrl?: string | null },
): void {
  Sentry.addBreadcrumb({
    category: 'authentication',
    message,
    level: 'info',
    data: {
      stage: data.stage,
      ...(data.code ? { code: data.code } : {}),
      instanceHost: safeInstanceHost(data.instanceUrl),
    },
  });
}

/** Capture only a synthetic stable error. Never attach the raw provider/server cause. */
export function reportAuthFailure(error: unknown, instanceUrl?: string | null): void {
  if (isAuthCancellation(error)) return;
  const authError =
    error instanceof AuthFlowError
      ? error
      : new AuthFlowError({
          code: 'authorization_failed',
          stage: 'authorization',
          cause: error,
        });

  Sentry.captureException(new Error(`Authentication failed: ${authError.code}`), {
    tags: {
      auth_stage: authError.stage,
      auth_code: authError.code,
      instance_host: safeInstanceHost(instanceUrl),
    },
  });
}
