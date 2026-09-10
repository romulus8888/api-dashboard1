import { describe, expect, it } from "vitest";

import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { CsrfError } from "@/lib/auth/errors";

function buildRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/admin/leads/111/status", {
    method: "POST",
    headers,
  });
}

describe("assertSameOriginMutation", () => {
  it("accepts same-origin requests", () => {
    expect(() =>
      assertSameOriginMutation(
        buildRequest({
          origin: "http://localhost",
          host: "localhost",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects cross-origin requests", () => {
    expect(() =>
      assertSameOriginMutation(
        buildRequest({
          origin: "https://evil.example",
          host: "localhost",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrow(CsrfError);
  });
});
