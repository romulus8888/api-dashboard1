import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n/get-dictionary";
import { mapDemoApiError } from "@/lib/map-demo-api-error";

describe("mapDemoApiError", () => {
  it("maps language-neutral API codes to localized messages", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(mapDemoApiError(en, "rate_limited")).toBe(en.errors.api.rate_limited);
    expect(mapDemoApiError(ru, "rate_limited")).toBe(ru.errors.api.rate_limited);
  });
});
