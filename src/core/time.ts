/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns `true` if `timeZone` is an IANA time zone name the runtime knows,
 * such as `Europe/Vilnius` or `UTC`.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A point in time written out in UTC and in a named time zone. */
export interface ZonedTimestamp {
  /** ISO 8601 in UTC with milliseconds, e.g. `2026-06-19T08:30:00.000Z`. */
  readonly utc: string;
  /** Local wall-clock time with offset, e.g. `2026-06-19T11:30:00+03:00`. */
  readonly local: string;
  /** The IANA time zone name used for `local`. */
  readonly timeZone: string;
  /** The UTC offset of `local`, e.g. `+03:00`. */
  readonly offset: string;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/**
 * Formats an instant in UTC and in the given time zone. The output does not
 * depend on the runtime locale.
 *
 * @throws RangeError if the date is invalid or the time zone is unknown.
 *
 * @example
 * ```ts
 * formatZoned(new Date('2026-06-19T08:30:00Z'), 'Europe/Vilnius').local;
 * // '2026-06-19T11:30:00+03:00'
 * ```
 */
export function formatZoned(date: Date, timeZone: string): ZonedTimestamp {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  if (!isValidTimeZone(timeZone)) throw new RangeError('Unknown time zone');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  const offsetMinutes = Math.round((wallClockAsUtc - wholeSeconds) / 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  const local = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${offset}`;
  return Object.freeze({ utc: date.toISOString(), local, timeZone, offset });
}
