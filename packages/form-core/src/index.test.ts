import { describe, expect, it, vi } from "vitest";
import { createDraftKey, FormEngine, MemoryDraftAdapter, type DraftRecord } from "./index";
import type { FormDefinition, FormPlatformContext, FormValues } from "@admiral/form-schema";

const context: FormPlatformContext = { tenantId: "tenant-a", userId: "user-1", locale: "en", timezone: "UTC", permissions: [], correlationId: "test" };

describe("form-core", () => {
  it("normalizes backend authorisation failures through submission state", async () => {
    const definition: FormDefinition<{ reference: string }> = {
      id: "auth-submit",
      version: 1,
      title: "Auth submit",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }],
      submission: {
        submit: async (_values, submitContext) => submitContext.permissions.includes("submit.allowed")
          ? { status: "succeeded", entityId: "ok", entityVersion: 1 }
          : { status: "failed", error: { type: "authorisation", message: "Server denied submit." } }
      }
    };
    const engine = new FormEngine({ definition, initialValues: { reference: "REF-1" }, context });
    const result = await engine.submit();
    expect(result).toEqual({ status: "failed", error: { type: "authorisation", message: "Server denied submit." } });
  });

  it("discovers tenant-scoped drafts through versioned keys", async () => {
    const adapter = new MemoryDraftAdapter();
    const definition: FormDefinition<{ reference: string }> = {
      id: "drafted",
      version: 2,
      title: "Drafted",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }],
      migrations: { 1: (values: FormValues) => ({ ...values, reference: `${values.reference}-migrated` }) }
    };
    const record: DraftRecord<{ reference: string }> = { values: { reference: "REF" }, formVersion: 1, savedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() };
    await adapter.save(createDraftKey(context, definition.id, "new", 1), record);
    const engine = new FormEngine({ definition, initialValues: { reference: "" }, context, draftAdapter: adapter });
    expect(await engine.restoreDraft()).toBe(true);
    expect(engine.state.values.reference).toBe("REF-migrated");
  });

  it("emits backend contract telemetry for failed plugin setup", () => {
    const telemetry = { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() };
    const definition: FormDefinition<{ reference: string }> = {
      id: "plugin-failure",
      version: 1,
      title: "Plugin failure",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }]
    };
    new FormEngine({ definition, initialValues: { reference: "" }, context, telemetry, plugins: [{ id: "bad-plugin", version: "1.0.0", setup: () => { throw new Error("nope"); } }] });
    expect(telemetry.track).toHaveBeenCalledWith("plugin_failed", { pluginId: "bad-plugin" });
    expect(telemetry.captureError).toHaveBeenCalled();
  });
});
