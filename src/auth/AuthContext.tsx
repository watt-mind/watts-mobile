import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { fetchUserInfo, setAuthFailureHandler, type UserInfo } from '@/src/api/client';
import { friendlyError, isReachabilityError } from '@/src/api/errors';
import {
  bumpAuthSessionGeneration,
  getAuthSessionGeneration,
} from '@/src/auth/authSessionGeneration';
import { applyE2eAuthSeed, applyPendingE2eLogin, isE2eAuthEnabled } from '@/src/auth/e2eAuth';
import { parseE2eLoginDeepLink } from '@/src/auth/e2eLoginDeepLink';
import { AuthFlowError } from '@/src/auth/authErrors';
import { loginWithPkce } from '@/src/auth/oauth';
import { loadPendingE2eLogin, setPendingE2eLogin } from '@/src/auth/pendingE2eLogin';
import { teardownSessionCaches } from '@/src/auth/sessionTeardown';
import { clearTokens, loadTokens } from '@/src/auth/tokenStorage';
import { reportAuthFailure, trackAuthStage } from '@/src/features/auth/analytics';
import {
  getDefaultInstanceUrl,
  getInstanceUrl,
  normalizeInstanceUrl,
  setInstanceUrl,
  validateInstanceReachability,
} from '@/src/config/instance';
import { wireQueryConnectivity } from '@/src/query/connectivity';
import { createAppQueryClient } from '@/src/query/queryClient';
import {
  clearPersistedQueryCache,
  queryPersister,
  shouldDehydratePersistedQuery,
} from '@/src/query/persist';

wireQueryConnectivity();

async function clearHealthSyncForIdentityTransition(): Promise<void> {
  try {
    const { clearHealthSyncOnSignOut } = await import('@/src/features/health/clearOnSignOut');
    await clearHealthSyncOnSignOut();
  } catch (error) {
    console.warn('Failed to clear health sync state during account transition', error);
  }
}

async function clearPushRegistrationForIdentityTransition(): Promise<void> {
  try {
    const { clearPushRegistrationOnSignOut } =
      await import('@/src/features/notifications/pushRegistration');
    await clearPushRegistrationOnSignOut();
  } catch (error) {
    console.warn('Failed to clear push registration during account transition', error);
  }
}

async function clearPendingWellnessCheckinForIdentityTransition(): Promise<void> {
  try {
    const { clearPendingWellnessCheckin } = await import('@/src/features/log/offlineWellnessQueue');
    await clearPendingWellnessCheckin();
  } catch (error) {
    console.warn('Failed to clear offline wellness queue during account transition', error);
  }
}

type AuthStatus = 'loading' | 'needs_instance' | 'needs_login' | 'authenticated';

type AuthContextValue = {
  status: AuthStatus;
  instanceUrl: string | null;
  user: UserInfo | null;
  error: string | null;
  defaultInstanceUrl: string;
  saveInstance: (url: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const queryClient = createAppQueryClient();

/**
 * Every identity transition (sign-out, server-revoked refresh token, instance
 * switch) tears the caches down through the one routine, so the
 * cancel → memory → disk ordering is defined in a single place. See
 * `sessionTeardown.ts` for why wiping disk first leaks the previous athlete's
 * data across a cold launch.
 */
function teardownQueryCaches(): Promise<void> {
  return teardownSessionCaches({
    cancelQueries: () => queryClient.cancelQueries(),
    clearMemoryCache: () => queryClient.clear(),
    clearPersistedCache: () => clearPersistedQueryCache(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [instanceUrl, setInstanceUrlState] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    try {
      // Deep-link fixture login (Maestro) first; env seed remains a CI fallback.
      let e2eSeed: Awaited<ReturnType<typeof applyPendingE2eLogin>> = null;
      try {
        e2eSeed = (await applyPendingE2eLogin()) ?? (await applyE2eAuthSeed());
      } catch (err) {
        setUser(null);
        setError(err instanceof Error ? `E2E login: ${err.message}` : 'E2E login failed');
        setStatus('needs_login');
        return;
      }

      if (e2eSeed) {
        setInstanceUrlState(e2eSeed.instanceUrl);
        try {
          const info = await fetchUserInfo();
          setUser(info);
          setError(null);
          setStatus('authenticated');
        } catch (err) {
          if (isReachabilityError(err)) {
            // Transient connectivity/server error — keep the seeded session and Health
            // Sync state intact rather than treating a network blip as a login failure.
            setError(friendlyError(err, 'Could not verify E2E session — check your connection'));
            setStatus('authenticated');
          } else {
            await clearHealthSyncForIdentityTransition();
            setUser(null);
            setError(
              err instanceof Error
                ? `E2E userinfo: ${err.message}`
                : 'E2E auth seed failed — check token and instance URL',
            );
            setStatus('needs_login');
          }
        }
        return;
      }

      let storedInstance = await getInstanceUrl();
      if (!storedInstance) {
        const defaultUrl = getDefaultInstanceUrl();
        await setInstanceUrl(defaultUrl);
        storedInstance = defaultUrl;
      }
      setInstanceUrlState(storedInstance);

      const tokens = await loadTokens();
      if (!tokens?.accessToken) {
        setStatus('needs_login');
        return;
      }

      try {
        const info = await fetchUserInfo();
        setUser(info);
        setError(null);
        setStatus('authenticated');
      } catch (err) {
        if (isReachabilityError(err)) {
          // Offline/DNS/5xx while checking the existing session: the tokens are still
          // valid as far as we know, so keep the user signed in and leave Health Sync
          // state (ledger/watermarks/background task) untouched. Only a definitive auth
          // failure (401/403) below should sign the user out and wipe health state.
          setError(
            friendlyError(err, "Can't reach your Coach Watts instance — check your connection"),
          );
          setStatus('authenticated');
        } else {
          await clearHealthSyncForIdentityTransition();
          setUser(null);
          setStatus('needs_login');
        }
      }
    } catch (err) {
      setError(friendlyError(err, 'Failed to start app'));
      setStatus('needs_instance');
    }
  }, []);

  useEffect(() => {
    const initialBootstrap = setTimeout(() => void bootstrap(), 0);
    return () => clearTimeout(initialBootstrap);
  }, [bootstrap]);

  // Maestro openLink often lands after the first bootstrap finished on the login screen.
  // +native-intent stores pending e2e login; re-bootstrap when it appears.
  const e2eWakeBusy = useRef(false);
  useEffect(() => {
    if (!isE2eAuthEnabled()) return;
    if (status === 'authenticated' || status === 'loading') return;

    async function wakeIfPendingE2eLogin() {
      if (e2eWakeBusy.current) return;
      const pending = await loadPendingE2eLogin();
      if (!pending) return;
      e2eWakeBusy.current = true;
      try {
        await bootstrap();
      } finally {
        e2eWakeBusy.current = false;
      }
    }

    async function onUrl(url: string) {
      const parsed = parseE2eLoginDeepLink(url);
      if (parsed) {
        await setPendingE2eLogin(parsed);
      }
      await wakeIfPendingE2eLogin();
    }

    const sub = Linking.addEventListener('url', ({ url }) => {
      void onUrl(url);
    });
    const poll = setInterval(() => {
      void wakeIfPendingE2eLogin();
    }, 400);
    const stopPoll = setTimeout(() => clearInterval(poll), 15_000);
    void wakeIfPendingE2eLogin();

    return () => {
      sub.remove();
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bootstrap, status]);

  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setStatus((current) => (current === 'needs_instance' ? current : 'needs_login'));
      // Synchronous callback: fire and forget, but the helper still enforces the
      // cancel → memory → disk order internally and never rejects.
      void teardownQueryCaches();
      // A server-revoked refresh token signs the athlete out just as definitively
      // as tapping Sign out: the device must stop receiving that account's push
      // notifications, and the local token must be cleared so the pending
      // unregister retry can recover.
      void clearPushRegistrationForIdentityTransition();
      void clearHealthSyncForIdentityTransition();
      void clearPendingWellnessCheckinForIdentityTransition();
      void import('@/src/features/activation/connectLater')
        .then(({ clearConnectLater }) => clearConnectLater())
        .catch(() => {
          /* best-effort */
        });
    });
    return () => setAuthFailureHandler(null);
  }, []);

  const saveInstance = useCallback(
    async (url: string) => {
      setError(null);
      let generation = getAuthSessionGeneration();
      await validateInstanceReachability(url);
      const previous = instanceUrl ?? (await getInstanceUrl());
      const normalized = normalizeInstanceUrl(url);
      if (previous && previous !== normalized) {
        generation = bumpAuthSessionGeneration();
        await clearHealthSyncForIdentityTransition();
        const { clearConnectLater } = await import('@/src/features/activation/connectLater');
        await clearConnectLater();
        await clearTokens();
        setUser(null);
        await teardownQueryCaches();
      }
      await setInstanceUrl(normalized);
      if (getAuthSessionGeneration() !== generation) {
        // A sign-out or another instance switch already took effect while this
        // call was awaiting I/O — don't stomp on that newer state.
        return;
      }
      setInstanceUrlState(normalized);
      setStatus('needs_login');
    },
    [instanceUrl],
  );

  const signIn = useCallback(async () => {
    setError(null);
    const instance = instanceUrl ?? (await getInstanceUrl());
    if (!instance) {
      setStatus('needs_instance');
      throw new Error('Configure an instance URL first');
    }

    try {
      await validateInstanceReachability(instance);
    } catch (cause) {
      const authError = new AuthFlowError({
        code: 'instance_unreachable',
        stage: 'instance',
        cause,
      });
      reportAuthFailure(authError, instance);
      throw authError;
    }

    const pendingTokens = await loadTokens();
    if (pendingTokens?.accessToken) {
      const pendingGeneration = getAuthSessionGeneration();
      try {
        const pendingInfo = await fetchUserInfo();
        if (!pendingInfo.sub?.trim()) {
          throw new AuthFlowError({
            code: 'account_verification_rejected',
            stage: 'account_verification',
          });
        }
        if (getAuthSessionGeneration() !== pendingGeneration) return;
        setUser(pendingInfo);
        setStatus('authenticated');
        trackAuthStage('session_resumed', { stage: 'account_verification', instanceUrl: instance });
        return;
      } catch (cause) {
        if (isReachabilityError(cause)) {
          const authError = new AuthFlowError({
            code: 'account_verification_unavailable',
            stage: 'account_verification',
            cause,
          });
          reportAuthFailure(authError, instance);
          throw authError;
        }
        await clearTokens(pendingGeneration);
      }
    }

    // Invalidate stale 401/refresh handlers before opening the browser, then drop
    // in-flight field reads so they cannot race the new grant.
    const generation = bumpAuthSessionGeneration();
    await queryClient.cancelQueries();
    try {
      trackAuthStage('authorization_started', { stage: 'authorization', instanceUrl: instance });
      await loginWithPkce(instance, generation);
    } catch (error) {
      reportAuthFailure(error, instance);
      throw error;
    }

    let info: UserInfo;
    try {
      info = await fetchUserInfo();
      if (!info.sub?.trim()) {
        throw new AuthFlowError({
          code: 'account_verification_rejected',
          stage: 'account_verification',
        });
      }
    } catch (cause) {
      if (isReachabilityError(cause)) {
        const authError = new AuthFlowError({
          code: 'account_verification_unavailable',
          stage: 'account_verification',
          cause,
        });
        reportAuthFailure(authError, instance);
        throw authError;
      }
      await clearTokens(generation);
      const authError =
        cause instanceof AuthFlowError
          ? cause
          : new AuthFlowError({
              code: 'account_verification_rejected',
              stage: 'account_verification',
              cause,
            });
      reportAuthFailure(authError, instance);
      throw authError;
    }
    if (getAuthSessionGeneration() !== generation) {
      // A sign-out (or another sign-in) happened while this OAuth flow was in
      // flight. That newer state transition already won — don't resurrect this
      // stale session by overwriting it.
      return;
    }
    setUser(info);
    setStatus('authenticated');
    trackAuthStage('authentication_completed', {
      stage: 'account_verification',
      instanceUrl: instance,
    });
  }, [instanceUrl]);

  const signOut = useCallback(async () => {
    const generation = bumpAuthSessionGeneration();
    await clearPushRegistrationForIdentityTransition();
    await clearHealthSyncForIdentityTransition();
    await clearPendingWellnessCheckinForIdentityTransition();
    try {
      const { clearConnectLater } = await import('@/src/features/activation/connectLater');
      await clearConnectLater();
    } catch {
      /* best-effort */
    }
    await clearTokens();
    // Unconditional, exactly as the persisted-cache wipe was before: the caches
    // must not survive a sign-out even if a newer transition raced us. The
    // generation guard below still gates the React state updates.
    await teardownQueryCaches();
    if (getAuthSessionGeneration() !== generation) {
      // A newer sign-in (or another sign-out) already took effect while this
      // sign-out was still cleaning up — don't clobber it with stale state.
      return;
    }
    setUser(null);
    setStatus(instanceUrl ? 'needs_login' : 'needs_instance');
  }, [instanceUrl]);

  const refreshUser = useCallback(async () => {
    const info = await fetchUserInfo();
    setUser(info);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      instanceUrl,
      user,
      error,
      defaultInstanceUrl: getDefaultInstanceUrl(),
      saveInstance,
      signIn,
      signOut,
      clearError: () => setError(null),
      refreshUser,
    }),
    [status, instanceUrl, user, error, saveInstance, signIn, signOut, refreshUser],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydratePersistedQuery,
        },
      }}
    >
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </PersistQueryClientProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
