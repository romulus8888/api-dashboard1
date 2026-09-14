import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SAFETY_SCRIPT = join(ROOT, "scripts/disposable-database-safety.sh");
const VALIDATION_SCRIPT = join(ROOT, "scripts/validate-disposable-database.sh");
const PHASE1_INTEGRATION = join(ROOT, "scripts/integration/phase1-transition-zero-row-guc.sh");
const PHASE9_INTEGRATION = join(ROOT, "scripts/integration/phase9-reset-xact-lock.sh");

function runBash(script: string, env: Record<string, string | undefined>) {
  return spawnSync("bash", [script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("disposable database safety gate", () => {
  it("sources the shared helper from validation and integration scripts", () => {
    const validation = readFileSync(VALIDATION_SCRIPT, "utf8");
    expect(validation).toMatch(/disposable-database-safety\.sh/);
    expect(validation).toMatch(/prepare_disposable_database_connection/);

    for (const script of [PHASE1_INTEGRATION, PHASE9_INTEGRATION]) {
      const content = readFileSync(script, "utf8");
      expect(content).toMatch(/disposable-database-safety\.sh/);
      expect(content).toMatch(/require_disposable_database_target/);
    }
  });

  it("documents ACK, URL validation, hosted URL refusal, and disposable_psql in the helper", () => {
    const helper = readFileSync(SAFETY_SCRIPT, "utf8");

    expect(helper).toMatch(/DISPOSABLE_TEST_ACK=yes/);
    expect(helper).toMatch(/DISPOSABLE_DATABASE_URL/);
    expect(helper).toMatch(/supabase\.co|supabase\.com/i);
    expect(helper).toMatch(/disposable_psql/);
    expect(helper).toMatch(/DISPOSABLE_PSQL_MODE/);
    expect(helper).toMatch(/\"\$\{1:-\}\" == \"-f\"/);
    expect(helper).toMatch(/docker exec -i/);
    expect(helper).toMatch(/DISPOSABLE_CI_HOST_WORKSPACE_ROOT/);
    expect(helper).toMatch(/workspace_root\/\$rel/);
    expect(helper).toMatch(/unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE/);
    expect(helper).not.toMatch(/unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE/);
    expect(helper).toMatch(/wait_for_disposable_postgres/);
  });

  const bashAvailable = process.platform !== "win32";

  it.skipIf(!bashAvailable)("refuses direct integration invocation without DISPOSABLE_TEST_ACK", () => {
    for (const script of [PHASE1_INTEGRATION, PHASE9_INTEGRATION]) {
      const result = runBash(script, {
        DISPOSABLE_TEST_ACK: "",
        DISPOSABLE_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(
        /Refusing to run: set DISPOSABLE_TEST_ACK=yes/,
      );
    }
  });

  it.skipIf(!bashAvailable)("refuses direct integration invocation with a hosted Supabase URL", () => {
    for (const script of [PHASE1_INTEGRATION, PHASE9_INTEGRATION]) {
      const result = runBash(script, {
        DISPOSABLE_TEST_ACK: "yes",
        DISPOSABLE_DATABASE_URL:
          "postgresql://postgres:password@db.abcdef.supabase.co:5432/postgres",
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/Refusing production-like database URL/);
    }
  });
});
