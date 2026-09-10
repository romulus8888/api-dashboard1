import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

const ALLOWED_BROWSER_DATA_PATHS = [
  "lib/admin/admin-leads-client.ts",
  "hooks/use-leads.ts",
];

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("browser data client guard", () => {
  it("does not import the legacy browser Supabase client or query jobs/leads directly", () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relativePath = file
        .replace(`${SRC_ROOT}\\`, "")
        .replace(`${SRC_ROOT}/`, "")
        .replaceAll("\\", "/");
      if (relativePath.endsWith(".test.ts")) continue;
      if (ALLOWED_BROWSER_DATA_PATHS.includes(relativePath)) continue;

      const content = readFileSync(file, "utf8");

      if (content.includes('@/lib/supabase"') || content.includes("@/lib/supabase'")) {
        violations.push(`${relativePath}: imports @/lib/supabase`);
      }

      if (content.includes('from("jobs")') || content.includes("from('jobs')")) {
        violations.push(`${relativePath}: queries jobs directly`);
      }

      if (
        (content.includes('from("leads")') || content.includes("from('leads')")) &&
        !relativePath.startsWith("lib/admin/handlers/") &&
        relativePath !== "lib/leads.ts"
      ) {
        violations.push(`${relativePath}: queries leads directly`);
      }
    }

    expect(violations).toEqual([]);
  });
});
