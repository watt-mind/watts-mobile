import { describe, expect, it } from 'vitest';

import { canPromptHealthKitSheet, resolveHealthKitAccess } from '../healthKitAccess';

describe('resolveHealthKitAccess', () => {
  it('reports not_available when HealthKit is unusable, whatever the probe saw', () => {
    expect(resolveHealthKitAccess({ requestStatus: 'unavailable', probeFoundData: false })).toBe(
      'not_available',
    );
    expect(resolveHealthKitAccess({ requestStatus: 'unavailable', probeFoundData: true })).toBe(
      'not_available',
    );
  });

  it('asks for access when the type set has never been requested', () => {
    expect(resolveHealthKitAccess({ requestStatus: 'should_request', probeFoundData: false })).toBe(
      'should_request',
    );
  });

  it('claims connected only once a read actually returned data', () => {
    expect(
      resolveHealthKitAccess({ requestStatus: 'already_requested', probeFoundData: true }),
    ).toBe('connected');
  });

  it('stays unverified when access was requested but nothing could be read', () => {
    // The reported bug: `.unnecessary` was rendered as a green "Connected"
    // badge for an athlete who had denied every category (CW-571).
    expect(
      resolveHealthKitAccess({ requestStatus: 'already_requested', probeFoundData: false }),
    ).toBe('unnecessary');
  });

  it('never lets a failed probe downgrade a never-asked device', () => {
    // A probe that throws is reported as `probeFoundData: false`; it must not
    // turn "we have not asked yet" into "we asked and got nothing".
    expect(resolveHealthKitAccess({ requestStatus: 'should_request', probeFoundData: false })).toBe(
      'should_request',
    );
  });
});

describe('canPromptHealthKitSheet', () => {
  it('allows a prompt only before the first request', () => {
    expect(canPromptHealthKitSheet('should_request')).toBe(true);
  });

  it('refuses to offer a prompt that iOS will silently ignore', () => {
    // iOS shows the consent sheet once per type set; after that
    // requestAuthorization resolves with no UI at all.
    expect(canPromptHealthKitSheet('unnecessary')).toBe(false);
    expect(canPromptHealthKitSheet('connected')).toBe(false);
    expect(canPromptHealthKitSheet('not_available')).toBe(false);
    expect(canPromptHealthKitSheet('loading')).toBe(false);
  });
});
