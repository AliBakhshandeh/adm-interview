import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { generate, validateFormName } from "./index";

let cwd: string | undefined;
const originalCwd = process.cwd();
const repoRoot = join(originalCwd, "..", "..");

afterEach(() => {
  process.chdir(originalCwd);
  if (cwd) rmSync(cwd, { recursive: true, force: true });
  cwd = undefined;
});

function useTempCwd(): string {
  cwd = mkdtempSync(join(tmpdir(), "admiral-form-cli-"));
  process.chdir(cwd);
  return cwd;
}

describe("admiral-form generator", () => {
  it("validates kebab-case names", () => {
    expect(() => validateFormName("ShipmentBooking")).toThrow(/kebab-case/);
    expect(() => validateFormName("shipment-booking")).not.toThrow();
  });

  it("generates typed files and multi-step template", () => {
    const root = useTempCwd();
    generate("shipment-booking", "multi-step");
    const form = readFileSync(join(root, "features", "shipment-booking", "shipment-booking.form.ts"), "utf8");
    const test = readFileSync(join(root, "features", "shipment-booking", "shipment-booking.test.tsx"), "utf8");
    expect(form).toContain("FormDefinition<ShipmentBookingValue>");
    expect(form).toContain("sectionIds");
    expect(test).toContain("generates a valid form definition");
  });

  it("omits optional steps for the basic template", () => {
    const root = useTempCwd();
    generate("invoice-request");
    const form = readFileSync(join(root, "features", "invoice-request", "invoice-request.form.ts"), "utf8");
    expect(form).not.toContain("steps: undefined");
  });

  it("generates templates that compile in a strict consumer project", () => {
    const root = useTempCwd();
    generate("invoice-request");
    generate("shipment-booking", "multi-step");
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        module: "ESNext",
        target: "ES2022",
        moduleResolution: "Bundler",
        skipLibCheck: true,
        baseUrl: repoRoot,
        paths: { "@admiral/form-platform": ["packages/form-platform/src/index.ts"] }
      },
      include: ["features/**/*.ts"]
    }, null, 2));
    execFileSync("pnpm", ["exec", "tsc", "--noEmit", "-p", join(root, "tsconfig.json")], { cwd: repoRoot, stdio: "pipe" });
  });

  it("refuses to overwrite existing generated directories", () => {
    useTempCwd();
    generate("employee-onboarding");
    expect(() => generate("employee-onboarding")).toThrow(/Refusing to overwrite/);
  });
});
