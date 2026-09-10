const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

interface JsonErrorBody {
  error: string;
}

export function adminJsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export function adminJsonError(message: string, status: number): Response {
  return adminJsonResponse({ error: message } satisfies JsonErrorBody, status);
}

export function adminInternalError(): Response {
  return adminJsonError("Unable to process request.", 500);
}
