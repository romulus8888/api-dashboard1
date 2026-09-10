import { describe, expect, it } from "vitest";

import { parseLeadsListQuery } from "@/lib/admin/leads-list-query";

describe("parseLeadsListQuery", () => {
  it("applies defaults for bounded pagination", () => {
    const query = parseLeadsListQuery(new URLSearchParams());

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.sortBy).toBe("created_at");
    expect(query.sortDir).toBe("desc");
  });

  it("rejects invalid filters and pagination", () => {
    expect(() =>
      parseLeadsListQuery(
        new URLSearchParams({
          page: "0",
        }),
      ),
    ).toThrow();

    expect(() =>
      parseLeadsListQuery(
        new URLSearchParams({
          status: "invalid",
        }),
      ),
    ).toThrow();

    expect(() =>
      parseLeadsListQuery(
        new URLSearchParams({
          pageSize: "500",
        }),
      ),
    ).toThrow();
  });
});
