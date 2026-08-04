import { describe, expect, it } from "vitest";
import { MemoryTelemetry, redact } from "./index";

describe("telemetry", () => {
  it("redacts sensitive attributes before storing events", () => {
    const telemetry = new MemoryTelemetry();
    telemetry.track("field_changed", { fieldId: "salary", salaryValue: 120000, token: "secret-token", tenantId: "tenant-a" });
    telemetry.captureError(new Error("failed"), { bankAccount: "123", correlationId: "corr-1" });

    expect(telemetry.events[0]?.attributes).toEqual({ fieldId: "salary", salaryValue: "[redacted]", token: "[redacted]", tenantId: "tenant-a" });
    expect(telemetry.events[1]?.attributes).toEqual({ bankAccount: "[redacted]", correlationId: "corr-1" });
    expect(redact(undefined)).toBeUndefined();
  });
});
