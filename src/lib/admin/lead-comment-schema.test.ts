import { describe, expect, it } from "vitest";

import { leadCommentCreateSchema, MAX_COMMENT_BODY_LENGTH } from "@/lib/admin/lead-comment-schema";

describe("leadCommentCreateSchema", () => {
  it("accepts non-empty comment bodies", () => {
    expect(leadCommentCreateSchema.parse({ body: "Follow up tomorrow." }).body).toBe(
      "Follow up tomorrow.",
    );
  });

  it("rejects blank, oversized, and forged author fields", () => {
    expect(() => leadCommentCreateSchema.parse({ body: "   " })).toThrow();
    expect(() =>
      leadCommentCreateSchema.parse({ body: "x".repeat(MAX_COMMENT_BODY_LENGTH + 1) }),
    ).toThrow();
    expect(() =>
      leadCommentCreateSchema.parse({
        body: "note",
        author_id: "99999999-9999-4999-8999-999999999999",
      }),
    ).toThrow();
  });
});
