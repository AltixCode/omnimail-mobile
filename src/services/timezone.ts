/**
 * Timezone helpers for OmniMail Mobile
 */

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

export function getDeviceTimezone(): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    }
  } catch {}
  return "UTC";
}

/**
 * Converts wall-clock time in a specific timezone to a UTC Date object.
 */
export function wallTimeToUTC(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  if (!timeZone || timeZone === "UTC" || timeZone === "GMT") {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  try {
    const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(approx);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        map[p.type] = parseInt(p.value, 10);
      }
    }

    const diffMs =
      approx.getTime() -
      Date.UTC(
        map.year,
        map.month - 1,
        map.day,
        map.hour,
        map.minute,
        map.second
      );

    return new Date(approx.getTime() + diffMs);
  } catch {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }
}

export function getWallClockInTimezone(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        map[p.type] = parseInt(p.value, 10);
      }
    }
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour: map.hour,
      minute: map.minute,
      second: map.second,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

export interface MobileSchedulePreset {
  id: string;
  label: string;
  displayTime: string;
  date: Date;
}

export function getMobileSchedulePresets(
  refDate = new Date(),
  timeZone = "UTC"
): MobileSchedulePreset[] {
  const wall = getWallClockInTimezone(refDate, timeZone);

  const addDays = (d: { year: number; month: number; day: number }, num: number) => {
    const base = new Date(Date.UTC(d.year, d.month - 1, d.day + num, 12, 0, 0));
    return {
      year: base.getUTCFullYear(),
      month: base.getUTCMonth() + 1,
      day: base.getUTCDate(),
    };
  };

  const tomorrow = addDays(wall, 1);
  const tomorrowMorning = wallTimeToUTC(tomorrow.year, tomorrow.month, tomorrow.day, 8, 0, 0, timeZone);
  const tomorrowAfternoon = wallTimeToUTC(tomorrow.year, tomorrow.month, tomorrow.day, 13, 0, 0, timeZone);

  const currentUtcDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  let daysUntilMonday = (1 - currentUtcDay + 7) % 7;
  if (daysUntilMonday <= 0 || (daysUntilMonday === 0 && wall.hour >= 8)) {
    daysUntilMonday += 7;
  }
  const nextMonday = addDays(wall, daysUntilMonday);
  const mondayMorning = wallTimeToUTC(nextMonday.year, nextMonday.month, nextMonday.day, 8, 0, 0, timeZone);

  const formatDisplay = (d: Date) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
    } catch {
      return d.toUTCString();
    }
  };

  return [
    {
      id: "tomorrow-morning",
      label: "Tomorrow morning",
      displayTime: formatDisplay(tomorrowMorning),
      date: tomorrowMorning,
    },
    {
      id: "tomorrow-afternoon",
      label: "Tomorrow afternoon",
      displayTime: formatDisplay(tomorrowAfternoon),
      date: tomorrowAfternoon,
    },
    {
      id: "monday-morning",
      label: "Monday morning",
      displayTime: formatDisplay(mondayMorning),
      date: mondayMorning,
    },
  ];
}
