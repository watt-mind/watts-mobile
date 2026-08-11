import { describe, expect, it } from 'vitest';

import {
  formatNotificationTime,
  mapNotificationItem,
  mapNotificationsList,
  markNotificationRepeats,
} from '../mapNotifications';

describe('mapNotificationItem', () => {
  it('maps title/message/read/createdAt', () => {
    expect(
      mapNotificationItem({
        id: 'n1',
        title: 'Ready',
        message: 'Your recommendation is ready',
        read: false,
        createdAt: '2026-07-19T10:00:00.000Z',
        link: '/',
      }),
    ).toEqual({
      id: 'n1',
      title: 'Ready',
      body: 'Your recommendation is ready',
      read: false,
      createdAt: '2026-07-19T10:00:00.000Z',
      link: '/',
    });
  });

  it('accepts body as an alias for message', () => {
    expect(
      mapNotificationItem({
        id: 'n2',
        title: 'Sync',
        body: 'Sync finished',
        read: true,
        createdAt: '2026-07-19T11:00:00.000Z',
      }),
    ).toMatchObject({ body: 'Sync finished', read: true, link: null });
  });

  it('returns null only when the id is unusable', () => {
    expect(mapNotificationItem(null)).toBeNull();
    expect(mapNotificationItem({ title: 'No id' })).toBeNull();
    expect(mapNotificationItem({ id: '', title: 'Blank id' })).toBeNull();
  });

  it('degrades gracefully instead of dropping rows with missing fields (CW-300)', () => {
    // An unread row the server counts must never vanish from the list.
    expect(mapNotificationItem({ id: 'x', title: 'Nope' })).toEqual({
      id: 'x',
      title: 'Nope',
      body: '',
      read: false,
      createdAt: '',
      link: null,
    });
    expect(mapNotificationItem({ id: 'y', message: '', read: false })).toMatchObject({
      id: 'y',
      title: 'Notification',
      body: '',
    });
  });

  it('keeps unread rows with empty message in the list so badge and inbox agree (CW-300)', () => {
    const inbox = mapNotificationsList({
      notifications: [
        { id: 'a', title: 'One', message: '', read: false, createdAt: '2026-07-19T10:00:00.000Z' },
        { id: 'b', title: '', message: '', read: false, createdAt: '' },
      ],
      unreadCount: 2,
    });
    expect(inbox.items).toHaveLength(2);
    expect(inbox.unreadCount).toBe(2);
  });
});

describe('mapNotificationsList', () => {
  it('maps list payload and unreadCount', () => {
    const inbox = mapNotificationsList({
      notifications: [
        {
          id: 'a',
          title: 'One',
          message: 'First',
          read: false,
          createdAt: '2026-07-19T10:00:00.000Z',
        },
        {
          id: 'b',
          title: 'Two',
          message: 'Second',
          read: true,
          createdAt: '2026-07-19T09:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
      unreadCount: 1,
    });

    expect(inbox.items).toHaveLength(2);
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.total).toBe(2);
  });

  it('derives unreadCount from items when API omits it', () => {
    const inbox = mapNotificationsList({
      notifications: [
        {
          id: 'a',
          title: 'One',
          message: 'First',
          read: false,
          createdAt: '2026-07-19T10:00:00.000Z',
        },
        {
          id: 'b',
          title: 'Two',
          message: 'Second',
          read: false,
          createdAt: '2026-07-19T09:00:00.000Z',
        },
      ],
    });
    expect(inbox.unreadCount).toBe(2);
  });

  it('handles empty list', () => {
    expect(mapNotificationsList({ notifications: [], unreadCount: 0 }).items).toEqual([]);
  });
});

describe('formatNotificationTime', () => {
  const now = Date.parse('2026-07-20T12:00:00.000Z');

  it('uses relative labels within a week', () => {
    expect(formatNotificationTime('2026-07-20T11:30:00.000Z', now)).toBe('30m ago');
    expect(formatNotificationTime('2026-07-18T12:00:00.000Z', now)).toBe('2d ago');
  });

  it('uses locale short date beyond a week', () => {
    // The label is rendered in the device's local zone, so the expected day is
    // derived from the same instant rather than hardcoded — at UTC+12/+13 a
    // UTC-noon timestamp is already the next local day.
    const instant = new Date('2026-06-05T12:00:00.000Z');
    const label = formatNotificationTime(instant.toISOString(), now);
    expect(label).toMatch(/Jun/);
    expect(label).toMatch(new RegExp(`\\b${instant.getDate()}\\b`));
  });
});

describe('markNotificationRepeats', () => {
  it('flags consecutive same title+link rows', () => {
    const marked = markNotificationRepeats([
      {
        id: '1',
        title: 'Workout Analysis Ready',
        body: 'A',
        read: false,
        createdAt: '2026-07-20T10:00:00.000Z',
        link: '/workouts/1',
      },
      {
        id: '2',
        title: 'Workout Analysis Ready',
        body: 'B',
        read: false,
        createdAt: '2026-07-20T09:00:00.000Z',
        link: '/workouts/1',
      },
      {
        id: '3',
        title: 'Other',
        body: 'C',
        read: true,
        createdAt: '2026-07-20T08:00:00.000Z',
        link: null,
      },
    ]);
    expect(marked.map((m) => m.isRepeat)).toEqual([false, true, false]);
  });
});
