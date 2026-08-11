/**
 * Event website URLs come from the web app's free-text field, where organizers
 * routinely enter schemeless hosts like `www.myrace.com`. `Linking.openURL`
 * rejects those, so normalize them to https:// before opening.
 *
 * Anything that already carries a scheme (http:, https:, or a custom one such
 * as mailto: / myapp:) is passed through untouched. Returns null when there is
 * nothing openable, so callers can bail instead of firing a doomed openURL.
 */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (SCHEME_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}
