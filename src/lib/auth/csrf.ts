import { CsrfError } from "@/lib/auth/errors";

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function assertSameOriginMutation(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const requestUrl = new URL(request.url);

  if (!origin) {
    throw new CsrfError();
  }

  if (host && host !== requestUrl.host) {
    throw new CsrfError();
  }

  const requestOrigin = normalizeOrigin(origin);

  if (!requestOrigin || requestOrigin !== requestUrl.origin) {
    throw new CsrfError();
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new CsrfError();
  }
}
