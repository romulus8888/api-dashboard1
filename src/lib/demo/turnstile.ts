export class TurnstileConfigError extends Error {
  constructor(message = "Missing Turnstile server configuration.") {
    super(message);
    this.name = "TurnstileConfigError";
  }
}

export class TurnstileVerificationError extends Error {
  constructor(message = "Turnstile verification failed.") {
    super(message);
    this.name = "TurnstileVerificationError";
  }
}

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getTurnstileSecretKey(): string | null {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  return secret ? secret : null;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<void> {
  const secretKey = getTurnstileSecretKey();

  if (!secretKey) {
    if (isProductionEnvironment()) {
      throw new TurnstileConfigError();
    }

    return;
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new TurnstileVerificationError("Turnstile verification request failed.");
  }

  const payload = (await response.json()) as TurnstileVerifyResponse;

  if (!payload.success) {
    throw new TurnstileVerificationError("Turnstile token is invalid.");
  }
}
