/**
 * Transport policy for self-hosted instance URLs (CW-347).
 *
 * A plaintext `http://` instance sends the OAuth Bearer access/refresh token
 * across the network in clear text on every request, so plaintext is refused
 * for public hosts. Loopback, the Android emulator host alias and (in dev)
 * RFC1918 ranges stay allowed — local development and the Maestro e2e stack
 * deliberately serve plaintext there.
 *
 * This module is deliberately **pure**: no `expo-*` imports, no I/O. Its
 * sibling `./instance.ts` pulls `expo-secure-store` and is `vi.mock`ed wholesale
 * by several suites, so the policy has to live outside it to be unit-testable.
 * `normalizeInstanceUrl` lives here rather than in `./instance.ts` (which
 * re-exports it) so there is exactly one normalization implementation feeding
 * both the policy and its callers.
 */

/**
 * `insecure-public` — plaintext `http://` to a host that is not local.
 * `invalid-url` — input that does not parse as a URL at all.
 */
export type InstanceTransportIssue = 'insecure-public' | 'invalid-url';

/**
 * Hosts that may legitimately be served over plain `http://`, regardless of
 * build flavour: loopback plus the Android emulator alias for the host machine.
 *
 * Mirrors `DEFAULT_ALLOWED_HOSTS` in `src/auth/e2eAuth.ts` — keep the two in
 * step; they express one policy, not two.
 */
export const PLAINTEXT_ALLOWED_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '10.0.2.2'];

export const INSECURE_PUBLIC_INSTANCE_MESSAGE =
  'This server must use https:// — a plain http:// instance would send your login token in clear text. Change the instance URL to https://.';

export const INVALID_INSTANCE_URL_MESSAGE = 'Enter a valid instance URL';

/**
 * An instance URL the user has to fix, carrying copy that is already end-user
 * facing. `userFacing` tells `friendlyError` (`src/api/errors.ts`) to show
 * `message` verbatim instead of substituting a generic fallback — without it a
 * security refusal would surface as "Could not save instance".
 */
export class InstanceTransportError extends Error {
  readonly userFacing = true;
  readonly issue: InstanceTransportIssue;

  constructor(issue: InstanceTransportIssue, message: string) {
    super(message);
    this.name = 'InstanceTransportError';
    this.issue = issue;
  }
}

type InstanceTransportOptions = {
  /**
   * Whether this is a development build. Defaults to the ambient `__DEV__`.
   * Injectable because Vitest hard-defines `__DEV__: true`, which would
   * otherwise make the dev-gated RFC1918 branch untestable.
   */
  dev?: boolean;
};

function ambientDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Trim, default a missing scheme to `https://`, and drop trailing slashes. */
export function normalizeInstanceUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  return url.replace(/\/+$/, '');
}

/**
 * RFC1918 private IPv4, dev-only.
 *
 * Mirrors `isPrivateLanHostname` in `src/auth/e2eAuth.ts`, including the
 * `0.0.0.0` exclusion: the simulator sometimes cannot use host loopback
 * tunnels, so Maestro may be pointed at the Mac's LAN IP instead.
 */
function isPrivateLanHostname(hostname: string, dev: boolean): boolean {
  if (!dev) return false;
  if (hostname === '0.0.0.0') return false;
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * The transport policy. Returns `null` when `url` may be used as-is.
 *
 * Never throws — unparseable input comes back as `'invalid-url'` so callers can
 * report it alongside the transport verdict.
 */
export function instanceTransportIssue(
  url: string,
  options: InstanceTransportOptions = {},
): InstanceTransportIssue | null {
  const dev = options.dev ?? ambientDev();

  let parsed: URL;
  try {
    const normalized = normalizeInstanceUrl(url);
    if (!normalized) return 'invalid-url';
    parsed = new URL(normalized);
  } catch {
    return 'invalid-url';
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'https:') return null;
  if (protocol !== 'http:') return 'invalid-url';

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) return 'invalid-url';
  if (PLAINTEXT_ALLOWED_HOSTS.includes(hostname)) return null;
  if (isPrivateLanHostname(hostname, dev)) return null;

  return 'insecure-public';
}

/**
 * Throw {@link InstanceTransportError} unless `url` may be used as-is.
 *
 * Fail closed: call this before any network request to the instance and before
 * persisting it, so a plaintext public URL can never carry a Bearer token.
 */
export function assertInstanceTransportAllowed(
  url: string,
  options: InstanceTransportOptions = {},
): void {
  const issue = instanceTransportIssue(url, options);
  if (!issue) return;

  throw new InstanceTransportError(
    issue,
    issue === 'insecure-public' ? INSECURE_PUBLIC_INSTANCE_MESSAGE : INVALID_INSTANCE_URL_MESSAGE,
  );
}
