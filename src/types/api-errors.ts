export const DEMO_API_ERROR_CODES = [
  "demo_not_configured",
  "rate_limited",
  "invalid_payload",
  "turnstile_failed",
  "body_too_large",
  "invalid_json",
  "generation_failed",
  "verification_required",
] as const;

export type DemoApiErrorCode = (typeof DEMO_API_ERROR_CODES)[number];

export function isDemoApiErrorCode(value: string): value is DemoApiErrorCode {
  return (DEMO_API_ERROR_CODES as readonly string[]).includes(value);
}
