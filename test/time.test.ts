import { describe, expect, it } from 'vitest';

import { formatZoned, isValidTimeZone } from '../src/core/time.js';

describe('formatZoned', () => {
  it('formats summer time in Vilnius (UTC+3)', () => {
    expect(formatZoned(new Date('2026-06-19T08:30:00.000Z'), 'Europe/Vilnius')).toEqual({
      utc: '2026-06-19T08:30:00.000Z',
      local: '2026-06-19T11:30:00+03:00',
      timeZone: 'Europe/Vilnius',
      offset: '+03:00',
    });
  });

  it('formats winter time and crosses the date line correctly', () => {
    expect(formatZoned(new Date('2026-12-31T23:30:00.000Z'), 'Europe/Berlin').local).toBe('2027-01-01T00:30:00+01:00');
    expect(formatZoned(new Date('2026-01-01T00:30:00.000Z'), 'Atlantic/Azores').local).toBe('2025-12-31T23:30:00-01:00');
  });

  it('handles UTC, half-hour offsets and sub-second instants', () => {
    expect(formatZoned(new Date('2026-06-19T08:30:00.999Z'), 'UTC').local).toBe('2026-06-19T08:30:00+00:00');
    expect(formatZoned(new Date('2026-06-19T08:30:00.000Z'), 'Asia/Kolkata').offset).toBe('+05:30');
  });

  it('handles the DST change in Europe', () => {
    expect(formatZoned(new Date('2026-03-29T00:59:59.000Z'), 'Europe/Paris').local).toBe('2026-03-29T01:59:59+01:00');
    expect(formatZoned(new Date('2026-03-29T01:00:00.000Z'), 'Europe/Paris').local).toBe('2026-03-29T03:00:00+02:00');
  });

  it('throws for an invalid date or time zone', () => {
    expect(() => formatZoned(new Date('nope'), 'UTC')).toThrow(RangeError);
    expect(() => formatZoned(new Date(), 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and refuses others', () => {
    expect(isValidTimeZone('Europe/Vilnius')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('x'.repeat(65))).toBe(false);
  });
});
