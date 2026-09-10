import { describe, expect, it } from "vitest";

import { buildSyntheticLeadDraft } from "@/lib/demo/synthetic-personas";

describe("buildSyntheticLeadDraft", () => {
  it("generates only predefined synthetic lead data", () => {
    const draft = buildSyntheticLeadDraft("en", "00000000-0000-0000-0000-000000000001");

    expect(draft.insert.source).toBe("demo_seed");
    expect(draft.insert.is_synthetic).toBe(true);
    expect(draft.insert.demo_reset_group_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(draft.insert.contact_email).toContain("@example.demo");
    expect(draft.insert.title.length).toBeGreaterThan(0);
    expect(draft.insert.description.length).toBeGreaterThan(0);
    expect(draft.personaLabel.length).toBeGreaterThan(0);
  });

  it("uses locale-specific presets", () => {
    const draft = buildSyntheticLeadDraft("ru", "00000000-0000-0000-0000-000000000002");

    expect(draft.insert.locale).toBe("ru");
    expect(draft.insert.contact_email).toContain("@example.demo");
    expect(draft.insert.title).toMatch(/[А-Яа-яЁё]/);
  });
});
