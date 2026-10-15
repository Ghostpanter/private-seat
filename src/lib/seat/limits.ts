/** Per person, per Tokyo day. Keeps a shared key from being drained. */
export const DAILY_CAP = 20;

/** All seats combined, per Tokyo day. */
export const GLOBAL_CAP = 80;

export const MAX_INPUT = 2000;

export const MODEL = "grok-4.5";

export const MAX_OUTPUT_TOKENS = 640;

export function tokyoDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
