import { describe, expect, it } from 'vitest';

import { feedbackOnSendStart } from '../composerState';

describe('feedbackOnSendStart (CW-494d)', () => {
  it('clears the quota card as well as the error text', () => {
    // send() previously reset only sendError, so the "you've hit your limit"
    // card stayed pinned after the athlete upgraded and sent successfully —
    // until they switched rooms.
    expect(feedbackOnSendStart()).toEqual({ sendError: null, sendQuota: null });
  });
});
