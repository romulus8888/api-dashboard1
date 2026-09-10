import { describe, expect, it } from "vitest";

import { switchLocalePath } from "@/i18n/switch-locale-path";

describe("switchLocalePath", () => {
  it("preserves the current route when switching locale", () => {
    expect(switchLocalePath("/en/dashboard", "ru")).toBe("/ru/dashboard");
    expect(switchLocalePath("/ru", "en")).toBe("/en");
  });
});
