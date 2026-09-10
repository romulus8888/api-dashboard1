import { isIP } from "node:net";

export const UNKNOWN_CLIENT_IDENTITY = "unknown";

const VERCEL_FORWARDED_FOR_HEADER = "x-vercel-forwarded-for";

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

export function parseValidatedClientIp(value: string): string | null {
  const candidate = value.split(",")[0]?.trim();
  if (!candidate) return null;

  if (isIP(candidate) !== 0) {
    return candidate;
  }

  const lastColon = candidate.lastIndexOf(":");
  if (lastColon > -1 && candidate.includes(".")) {
    const host = candidate.slice(0, lastColon);
    if (isIP(host) === 4) {
      return host;
    }
  }

  return null;
}

export function getTrustedClientIp(request: Request): string {
  const vercelForwardedFor = request.headers.get(VERCEL_FORWARDED_FOR_HEADER);

  if (vercelForwardedFor) {
    const validated = parseValidatedClientIp(vercelForwardedFor);
    if (validated) {
      return validated;
    }
  }

  return UNKNOWN_CLIENT_IDENTITY;
}
