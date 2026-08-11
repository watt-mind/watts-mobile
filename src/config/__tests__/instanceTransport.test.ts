import { describe, expect, it } from 'vitest';

import {
  INSECURE_PUBLIC_INSTANCE_MESSAGE,
  InstanceTransportError,
  PLAINTEXT_ALLOWED_HOSTS,
  assertInstanceTransportAllowed,
  instanceTransportIssue,
  normalizeInstanceUrl,
} from '../instanceTransport';

describe('normalizeInstanceUrl', () => {
  it('defaults a scheme-less host to https and strips trailing slashes', () => {
    expect(normalizeInstanceUrl('coachwatts.com')).toBe('https://coachwatts.com');
    expect(normalizeInstanceUrl('  coachwatts.com/  ')).toBe('https://coachwatts.com');
    expect(normalizeInstanceUrl('https://coachwatts.com///')).toBe('https://coachwatts.com');
  });

  it('leaves an explicit scheme alone and returns empty for blank input', () => {
    expect(normalizeInstanceUrl('http://localhost:3099')).toBe('http://localhost:3099');
    expect(normalizeInstanceUrl('')).toBe('');
    expect(normalizeInstanceUrl('   ')).toBe('');
  });
});

describe('instanceTransportIssue', () => {
  describe('https and scheme-less input is always accepted', () => {
    it.each([
      'https://coachwatts.com',
      'https://my-nas.example.org:8443',
      'https://192.168.1.20:3099',
      'coachwatts.com',
      '  coachwatts.com/  ',
      'my-nas.example.org:8443',
    ])('accepts %s', (url) => {
      expect(instanceTransportIssue(url)).toBeNull();
    });
  });

  describe('plaintext http to a public host is blocked', () => {
    it.each([
      'http://coachwatts.com',
      'http://my-nas.example.org:3000',
      'http://203.0.113.10:3000',
      'HTTP://CoachWatts.com',
      'http://0.0.0.0:3000',
      // Adjacent to RFC1918 but outside it.
      'http://172.15.0.1:3000',
      'http://172.32.0.1:3000',
      'http://11.0.0.1:3000',
      'http://192.169.1.20:3000',
    ])('rejects %s', (url) => {
      expect(instanceTransportIssue(url)).toBe('insecure-public');
    });
  });

  describe('plaintext http to loopback / emulator hosts stays allowed', () => {
    it.each(['http://localhost:3099', 'http://127.0.0.1:3199', 'http://10.0.2.2:3199'])(
      'accepts %s',
      (url) => {
        expect(instanceTransportIssue(url)).toBeNull();
      },
    );

    it('keeps loopback and the Android emulator alias allowed outside dev builds', () => {
      // The e2e profile extends `development`, but a release-flavoured e2e build
      // must not lose the hosts the Maestro suite actually points at.
      for (const url of [
        'http://localhost:3099',
        'http://127.0.0.1:3199',
        'http://10.0.2.2:3199',
      ]) {
        expect(instanceTransportIssue(url, { dev: false })).toBeNull();
      }
    });
  });

  describe('RFC1918 plaintext is allowed in dev only, mirroring e2eAuth', () => {
    it.each([
      'http://192.168.1.20:3099',
      'http://10.1.2.3:3000',
      'http://172.16.0.5:3000',
      'http://172.31.255.254:3000',
    ])('accepts %s under __DEV__', (url) => {
      expect(instanceTransportIssue(url, { dev: true })).toBeNull();
    });

    it.each(['http://192.168.1.20:3099', 'http://10.1.2.3:3000', 'http://172.16.0.5:3000'])(
      'rejects %s in a non-dev build',
      (url) => {
        expect(instanceTransportIssue(url, { dev: false })).toBe('insecure-public');
      },
    );

    it('still allows the Android emulator alias in a non-dev build', () => {
      expect(instanceTransportIssue('http://10.0.2.2:3199', { dev: false })).toBeNull();
    });
  });

  describe('unparseable input is rejected rather than thrown', () => {
    it.each(['', '   ', 'http://', 'https://', 'http://:::', 'javascript:alert(1)', 'not a url'])(
      'reports %s as invalid-url',
      (url) => {
        expect(() => instanceTransportIssue(url)).not.toThrow();
        expect(instanceTransportIssue(url)).toBe('invalid-url');
      },
    );
  });

  it('exports the plaintext host allowlist', () => {
    expect([...PLAINTEXT_ALLOWED_HOSTS].sort()).toEqual(['10.0.2.2', '127.0.0.1', 'localhost']);
  });
});

describe('assertInstanceTransportAllowed', () => {
  it('passes through allowed URLs', () => {
    expect(() => assertInstanceTransportAllowed('https://coachwatts.com')).not.toThrow();
    expect(() => assertInstanceTransportAllowed('http://localhost:3099')).not.toThrow();
  });

  it('throws an actionable, user-facing error naming the cause and the fix', () => {
    expect(() => assertInstanceTransportAllowed('http://coachwatts.com')).toThrow(
      InstanceTransportError,
    );

    let caught: unknown;
    try {
      assertInstanceTransportAllowed('http://coachwatts.com');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toBe(INSECURE_PUBLIC_INSTANCE_MESSAGE);
    // Names the problem and the fix, not a generic validation failure.
    expect(message).toContain('https://');
    expect(message).toContain('clear text');
    // Marked so `friendlyError` shows it verbatim instead of a fallback.
    expect((caught as { userFacing?: unknown }).userFacing).toBe(true);
  });

  it('rejects unparseable input with a distinct message', () => {
    expect(() => assertInstanceTransportAllowed('http://:::')).toThrow(InstanceTransportError);
    expect(() => assertInstanceTransportAllowed('http://:::')).toThrow(/valid instance URL/i);
  });
});
