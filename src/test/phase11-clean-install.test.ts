import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const LEGACY_MIGRATIONS_DIR = join(ROOT, "supabase/legacy/migrations");
const VERIFY_DIR = join(ROOT, "supabase/verify");
const LEGACY_VERIFY_DIR = join(ROOT, "supabase/legacy/verify");
const VALIDATION_SCRIPT = join(ROOT, "scripts/validate-disposable-database.sh");
const PREREQUISITES = join(ROOT, "supabase/fixtures/disposable-test-prerequisites.sql");

describe("phase11 clean install readiness", () => {
  it("keeps legacy jobs migrations out of the active production directory", () => {
    const activeMigrations = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
    const legacyMigrations = readdirSync(LEGACY_MIGRATIONS_DIR).filter((name) =>
      name.endsWith(".sql"),
    );

    expect(activeMigrations).not.toContain("20260814000000_create_job_processing_audit.sql");
    expect(activeMigrations).not.toContain("20260910180000_lockdown_legacy_jobs.sql");
    expect(legacyMigrations).toEqual([
      "20260814000000_create_job_processing_audit.sql",
      "20260910180000_lockdown_legacy_jobs.sql",
    ]);

    for (const file of activeMigrations) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(content).not.toMatch(/create table if not exists public\.jobs/i);
      expect(content).not.toMatch(/create table if not exists public\.job_processing_audit/i);
    }
  });

  it("moves jobs lockdown verification under supabase/legacy/verify", () => {
    const activeVerify = readdirSync(VERIFY_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const legacyVerify = readdirSync(LEGACY_VERIFY_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(activeVerify).not.toContain("phase5_jobs_lockdown.sql");
    expect(legacyVerify).toEqual(["phase5_jobs_lockdown.sql"]);
    expect(activeVerify).toContain("phase11_clean_install.sql");
  });

  it("ships a clean-install guard and split validation tracks", () => {
    const validation = readFileSync(VALIDATION_SCRIPT, "utf8");
    const cleanGuard = readFileSync(join(VERIFY_DIR, "phase11_clean_install.sql"), "utf8");
    const prerequisites = readFileSync(PREREQUISITES, "utf8");

    expect(validation).toMatch(/DISPOSABLE_VALIDATION_TRACK/);
    expect(validation).toMatch(/run_clean_bootstrap/);
    expect(validation).toMatch(/run_legacy_bootstrap/);
    expect(validation).toMatch(/supabase\/legacy\/migrations/);
    expect(validation).toMatch(/phase11_clean_install\.sql/);
    expect(validation).toMatch(/clean-install guard only/);
    expect(validation).toMatch(/run_sql_file "verify" "\$clean_guard"/);
    expect(cleanGuard).toMatch(/public\.jobs must not exist/i);
    expect(cleanGuard).toMatch(/public\.job_processing_audit must not exist/i);
    expect(prerequisites).not.toMatch(/create table if not exists public\.jobs/i);
  });
});
