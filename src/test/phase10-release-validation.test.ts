import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const FIXTURES_DIR = join(ROOT, "supabase/fixtures");
const VERIFY_DIR = join(ROOT, "supabase/verify");
const VALIDATION_SCRIPT = join(ROOT, "scripts/validate-disposable-database.sh");
const BUNDLE_SCAN_SCRIPT = join(ROOT, "scripts/scan-client-bundle-secrets.sh");
const SRC_DIR = join(ROOT, "src");

type WorkflowStep = { name: string; run: string | null };

function parseValidateJobSteps(workflow: string): WorkflowStep[] {
  const stepsMatch = workflow.match(/^  validate:\n[\s\S]*?^    steps:\n([\s\S]*)/m);
  if (!stepsMatch) return [];

  const stepsBlock = stepsMatch[1] ?? "";
  const chunks = stepsBlock.split(/\n(?=      - name:)/);
  const steps: WorkflowStep[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const nameMatch = trimmed.match(/^- name: (.+)$/m);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    const scalarRun = trimmed.match(/^        run: ([^|>].+)$/m);
    if (scalarRun) {
      steps.push({ name, run: scalarRun[1].trim() });
      continue;
    }

    const blockRun = trimmed.match(/^        run: \|?\n((?:          .*\n?)*)/m);
    if (blockRun) {
      const body = blockRun[1].replace(/^          /gm, "").replace(/\s+$/, "");
      steps.push({ name, run: body });
      continue;
    }

    if (/^        run:/m.test(trimmed)) {
      steps.push({ name, run: "" });
      continue;
    }

    steps.push({ name, run: null });
  }

  return steps;
}

function collectRunCommands(steps: WorkflowStep[]): string {
  return steps.filter((step) => step.run).map((step) => step.run!).join("\n");
}

function collectClientSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectClientSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("phase10 release validation", () => {
  it("ships a disposable SQL validation script with explicit opt-in and production guards", () => {
    const script = readFileSync(VALIDATION_SCRIPT, "utf8");
    const safetyScript = readFileSync(join(ROOT, "scripts/disposable-database-safety.sh"), "utf8");

    expect(script).toMatch(/disposable-database-safety\.sh/);
    expect(script).toMatch(/prepare_disposable_database_connection/);
    expect(script).toMatch(/disposable_psql/);
    expect(safetyScript).toMatch(/DISPOSABLE_TEST_ACK=yes/);
    expect(safetyScript).toMatch(/DISPOSABLE_DATABASE_URL/);
    expect(safetyScript).toMatch(/wait_for_disposable_postgres/);
    expect(script).toMatch(/disposable-test-prerequisites\.sql/);
    expect(script).toMatch(/supabase\/migrations/);
    expect(script).toMatch(/supabase\/verify/);
    expect(script).toMatch(/DISPOSABLE_VALIDATION_TRACK/);
    expect(script).toMatch(/supabase\/legacy\/migrations/);
    expect(safetyScript).toMatch(/supabase\.co|supabase\.com/i);
    expect(script).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("keeps fixtures out of the migrations directory", () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
    const fixtureSql = readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".sql"));

    for (const file of migrationFiles) {
      expect(file).toMatch(/^\d{14}_.+\.sql$/);
    }

    for (const file of fixtureSql) {
      expect(migrationFiles).not.toContain(file);
      const content = readFileSync(join(FIXTURES_DIR, file), "utf8");
      expect(content).toMatch(/LOCAL \/ CI ONLY|Never apply to hosted Supabase/i);
    }
  });

  it("lists every verify script for disposable validation", () => {
    const verifyFiles = readdirSync(VERIFY_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(verifyFiles).toEqual(
      [
        "phase1_lead_schema.sql",
        "phase2_demo_rate_limit.sql",
        "phase7_lead_metrics.sql",
        "phase8_lead_automation.sql",
        "phase9_demo_reset.sql",
        "phase11_clean_install.sql",
      ].sort(),
    );
  });

  it("does not reference service_role secrets in use client modules", () => {
    const violations: string[] = [];

    for (const file of collectClientSourceFiles(SRC_DIR)) {
      const relativePath = file.replace(`${SRC_DIR}\\`, "").replace(`${SRC_DIR}/`, "").replaceAll("\\", "/");
      if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) continue;

      const content = readFileSync(file, "utf8");
      if (!content.includes('"use client"') && !content.includes("'use client'")) continue;

      if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(content)) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it("ships a post-build client bundle secret scan script", () => {
    const script = readFileSync(BUNDLE_SCAN_SCRIPT, "utf8");
    expect(script).toMatch(/\.next\/static/);
    expect(script).toMatch(/service_role/i);
  });

  it("documents CI workflow with PostgreSQL 16 and disposable SQL validation", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const steps = parseValidateJobSteps(workflow);
    const runCommands = collectRunCommands(steps);

    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow).toMatch(/node-version: 24\.15\.0/);
    expect(workflow).toMatch(/DISPOSABLE_TEST_ACK: "yes"/);
    expect(workflow).toMatch(
      /DISPOSABLE_DATABASE_URL: postgresql:\/\/postgres:postgres@localhost:5432\/postgres/,
    );
    expect(workflow).not.toMatch(/continue-on-error:/i);
    expect(workflow).not.toMatch(/secrets:/);

    const disposableStep = steps.find(
      (step) => step.name === "Disposable SQL migrations and verification",
    );
    expect(disposableStep?.run).toBe("bash scripts/ci-disposable-validation.sh");

    const wrapperInvocations = runCommands.match(/bash scripts\/ci-disposable-validation\.sh/g);
    expect(wrapperInvocations).toHaveLength(1);

    expect(runCommands).not.toMatch(/psql\s+.*-f\s+supabase\/migrations\//);
    expect(runCommands).not.toMatch(/psql\s+.*-f\s+supabase\/fixtures\//);
    expect(runCommands).not.toMatch(/psql\s+.*-f\s+supabase\/verify\//);
    expect(runCommands).not.toMatch(/psql\s+.*-f\s+supabase\/legacy\//);

    const syntaxStep = steps.find((step) => step.name === "Syntax-check shell scripts");
    expect(syntaxStep?.run).toMatch(/bash -n/);
    expect(syntaxStep?.run).toMatch(/find scripts -name '\*\.sh'/);

    const ciDisposable = readFileSync(join(ROOT, "scripts/ci-disposable-validation.sh"), "utf8");
    expect(ciDisposable).toMatch(/postgres:16/);
    expect(ciDisposable).toMatch(/DISPOSABLE_VALIDATION_TRACK=clean/);
    expect(ciDisposable).toMatch(/DISPOSABLE_VALIDATION_TRACK=legacy/);
    expect(ciDisposable).toMatch(/postgres_legacy/);
    expect(ciDisposable).toMatch(/validate-disposable-database\.sh/);
    expect(ciDisposable).toMatch(/prepare_disposable_database_connection/);
    expect(ciDisposable).toMatch(/disposable_psql/);
  });

  it("ships two-connection disposable integration scripts with safety gates", () => {
    const validationScript = readFileSync(VALIDATION_SCRIPT, "utf8");
    const resetIntegration = readFileSync(
      join(ROOT, "scripts/integration/phase9-reset-xact-lock.sh"),
      "utf8",
    );
    const gucIntegration = readFileSync(
      join(ROOT, "scripts/integration/phase1-transition-zero-row-guc.sh"),
      "utf8",
    );

    expect(validationScript).toMatch(/run_integration_scripts/);
    expect(resetIntegration).toMatch(/disposable-database-safety\.sh/);
    expect(resetIntegration).toMatch(/require_disposable_database_target/);
    expect(resetIntegration).toMatch(/Two-connection disposable integration/i);
    expect(resetIntegration).toMatch(/another reset is already in progress/i);
    expect(gucIntegration).toMatch(/disposable-database-safety\.sh/);
    expect(gucIntegration).toMatch(/require_disposable_database_target/);
    expect(gucIntegration).toMatch(/Two-connection disposable integration/i);
    expect(gucIntegration).toMatch(/disappeared during update/i);
    expect(gucIntegration).toMatch(/source GUC not restored after disappearance/i);
    expect(gucIntegration).toMatch(/empty prior context/i);
    expect(gucIntegration).toMatch(/integration_conn_a/);
    expect(gucIntegration).toMatch(/integration_conn_b/);
    expect(gucIntegration).not.toMatch(/transition_lead_status_with_pause/);
    expect(gucIntegration).not.toMatch(/supabase\.co|supabase\.com/i);
  });

  it("optionally scans built client bundles when .next/static exists", () => {
    const staticDir = join(ROOT, ".next/static");
    if (!existsSync(staticDir)) return;

    function collectBundleFiles(directory: string): string[] {
      const entries = readdirSync(directory, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectBundleFiles(fullPath));
          continue;
        }

        if (entry.name.endsWith(".js") || entry.name.endsWith(".json")) {
          files.push(fullPath);
        }
      }

      return files;
    }

    const combined = collectBundleFiles(staticDir)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(combined).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  });
});
