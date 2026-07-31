import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generate, validateFormName } from "./index";

let cwd: string | undefined;
const originalCwd = process.cwd();

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

  it("refuses to overwrite existing generated directories", () => {
    useTempCwd();
    generate("employee-onboarding");
    expect(() => generate("employee-onboarding")).toThrow(/Refusing to overwrite/);
  });
});
