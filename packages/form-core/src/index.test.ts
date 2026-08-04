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

  it("isolates runtime plugin hook and cleanup failures", () => {
    const telemetry = { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() };
    const observed: string[] = [];
    const definition: FormDefinition<{ reference: string }> = {
      id: "plugin-runtime",
      version: 1,
      title: "Plugin runtime",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }]
    };
    const engine = new FormEngine({
      definition,
      initialValues: { reference: "" },
      context,
      telemetry,
      plugins: [
        { id: "throwing", version: "1.0.0", setup: () => ({ onEvent: () => { throw new Error("event failed"); }, cleanup: () => { throw new Error("cleanup failed"); } }) },
        { id: "observer", version: "1.0.0", setup: () => ({ onEvent: (event) => observed.push(event.event), cleanup: () => observed.push("cleanup") }) }
      ]
    });
    expect(() => engine.setValue("reference", "REF-2")).not.toThrow();
    expect(observed).toContain("field_changed");
    expect(() => engine.destroy()).not.toThrow();
    expect(observed).toContain("cleanup");
    expect(telemetry.track).toHaveBeenCalledWith("plugin_failed", { pluginId: "throwing", event: "field_changed" });
    expect(telemetry.track).toHaveBeenCalledWith("plugin_failed", { pluginId: "throwing", event: "cleanup" });
  });

  it("does not apply stale async validation after a value changes", async () => {
    let resolveValidation: ((result: boolean) => void) | undefined;
    const definition: FormDefinition<{ code: string }> = {
      id: "async-ownership",
      version: 1,
      title: "Async ownership",
      sections: [{ id: "main", title: "Main", fields: [{
        id: "code",
        type: "text",
        label: "Code",
        validation: [{ type: "async", message: "Old code failed.", validate: () => new Promise<boolean>((resolve) => { resolveValidation = resolve; }) }]
      }] }]
    };
    const engine = new FormEngine({ definition, initialValues: { code: "old" }, context });
    const validation = engine.validate();
    engine.setValue("code", "new");
    resolveValidation?.(false);
    await validation;
    expect(engine.state.values.code).toBe("new");
    expect(engine.state.errors).toEqual([]);
    expect(engine.state.pendingAsyncValidations.size).toBe(0);
  });

  it("separates field notifications from form-shell notifications", async () => {
    const definition: FormDefinition<{ reference: string; status: string }> = {
      id: "notification-isolation",
      version: 1,
      title: "Notification isolation",
      sections: [{ id: "main", title: "Main", fields: [
        { id: "reference", type: "text", label: "Reference" },
        { id: "status", type: "text", label: "Status" }
      ] }]
    };
    const engine = new FormEngine({ definition, initialValues: { reference: "", status: "" }, context });
    const formShell = vi.fn();
    const referenceField = vi.fn();
    const statusField = vi.fn();
    engine.subscribeForm(formShell);
    engine.subscribeField("reference", referenceField);
    engine.subscribeField("status", statusField);

    engine.setValue("reference", "REF-1");

    expect(formShell).not.toHaveBeenCalled();
    expect(referenceField).toHaveBeenCalledTimes(1);
    expect(statusField).not.toHaveBeenCalled();
    await engine.validate();
    expect(formShell).toHaveBeenCalled();
  });

  it("normalizes draft restore and discard failures", async () => {
    const telemetry = { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() };
    const adapter = {
      load: vi.fn(async () => { throw new Error("bad json"); }),
      save: vi.fn(),
      discard: vi.fn(async () => { throw new Error("cannot discard"); })
    };
    const definition: FormDefinition<{ reference: string }> = {
      id: "draft-failure",
      version: 1,
      title: "Draft failure",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }]
    };
    const engine = new FormEngine({ definition, initialValues: { reference: "" }, context, telemetry, draftAdapter: adapter });
    await expect(engine.restoreDraft()).resolves.toBe(false);
    expect(engine.state.draft.status).toBe("failed");
    await expect(engine.discardDraft()).resolves.toBeUndefined();
    expect(engine.state.draft.status).toBe("failed");
    expect(telemetry.track).toHaveBeenCalledWith("draft_restore_failed", expect.any(Object));
    expect(telemetry.track).toHaveBeenCalledWith("draft_discard_failed", expect.any(Object));
  });
});
