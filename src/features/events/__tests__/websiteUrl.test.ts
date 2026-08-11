import { describe, expect, it } from 'vitest';

import { normalizeWebsiteUrl } from '../websiteUrl';

describe('normalizeWebsiteUrl', () => {
  it('adds https:// to a schemeless host', () => {
    expect(normalizeWebsiteUrl('www.myrace.com')).toBe('https://www.myrace.com');
    expect(normalizeWebsiteUrl('myrace.com')).toBe('https://myrace.com');
  });

  it('keeps a schemeless host path, query and fragment intact', () => {
    expect(normalizeWebsiteUrl('www.myrace.com/2026/register?ref=app#start')).toBe(
      'https://www.myrace.com/2026/register?ref=app#start',
    );
  });

  it('leaves http:// alone rather than upgrading it', () => {
    expect(normalizeWebsiteUrl('http://myrace.com/info')).toBe('http://myrace.com/info');
  });

  it('leaves https:// untouched', () => {
    expect(normalizeWebsiteUrl('https://myrace.com/info')).toBe('https://myrace.com/info');
  });

  it('leaves mailto: and custom schemes untouched', () => {
    expect(normalizeWebsiteUrl('mailto:info@myrace.com')).toBe('mailto:info@myrace.com');
    expect(normalizeWebsiteUrl('myrace://event/12')).toBe('myrace://event/12');
    expect(normalizeWebsiteUrl('tel:+15551234')).toBe('tel:+15551234');
  });

  it('is case-insensitive about the scheme', () => {
    expect(normalizeWebsiteUrl('HTTPS://myrace.com')).toBe('HTTPS://myrace.com');
  });

  it('resolves protocol-relative URLs against https', () => {
    expect(normalizeWebsiteUrl('//myrace.com/info')).toBe('https://myrace.com/info');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeWebsiteUrl('  www.myrace.com  ')).toBe('https://www.myrace.com');
  });

  it('returns null for empty, whitespace-only and missing values', () => {
    expect(normalizeWebsiteUrl('')).toBeNull();
    expect(normalizeWebsiteUrl('   ')).toBeNull();
    expect(normalizeWebsiteUrl(null)).toBeNull();
    expect(normalizeWebsiteUrl(undefined)).toBeNull();
  });
});
