import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FieldRegistry,
  FormEngine,
  FormRenderer,
  MemoryDraftAdapter,
  affectedFields,
  attachmentPlugin,
  auditTrailPlugin,
  buildDependencyGraph,
  createDefaultFieldRegistry,
  createDraftKey,
  evaluateRules,
  formAnalyticsPlugin,
  migrateDraft,
  topologicalOrder,
  validateFormDefinition,
  type FormDefinition,
  type FormPlatformContext
} from "@admiral/form-platform";
import { bookingInitialValues, employeeInitialValues, employeeOnboardingForm, shipmentBookingForm } from "../../../apps/showcase/src/forms";

function testContext(overrides: Partial<FormPlatformContext> = {}): FormPlatformContext {
  return { tenantId: "tenant-a", userId: "user-42", locale: "en", timezone: "UTC", permissions: ["booking.discount.write", "payroll.salary.read", "payroll.salary.write"], correlationId: "test", ...overrides };
}

function renderFormPlatform<TValues extends Record<string, unknown>>(params: { definition: FormDefinition<TValues>; initialValues: TValues; context?: Partial<FormPlatformContext> }) {
  return render(<FormRenderer definition={params.definition} initialValues={params.initialValues} context={testContext(params.context)} draftAdapter={new MemoryDraftAdapter()} />);
}

describe("form platform unit coverage", () => {
  it("detects duplicate field ids", () => {
    const definition: FormDefinition<{ name: string }> = { id: "x", version: 1, title: "X", sections: [{ id: "s", title: "S", fields: [{ id: "name", type: "text", label: "Name" }, { id: "name", type: "text", label: "Name" }] }] };
    expect(validateFormDefinition(definition).some((issue) => issue.code === "duplicate-field-id")).toBe(true);
  });

  it("detects unknown dependencies", () => {
    const definition: FormDefinition<{ city: string }> = { id: "x", version: 1, title: "X", sections: [{ id: "s", title: "S", fields: [{ id: "city", type: "text", label: "City", dependencies: ["province" as never] }] }] };
    expect(validateFormDefinition(definition).some((issue) => issue.code === "unknown-field-reference")).toBe(true);
  });

  it("detects circular dependencies", () => {
    const definition: FormDefinition<{ a: number; b: number }> = {
      id: "x",
      version: 1,
      title: "X",
      sections: [{ id: "s", title: "S", fields: [{ id: "a", type: "number", label: "A", dependencies: ["b"] }, { id: "b", type: "number", label: "B", dependencies: ["a"] }] }]
    };
    expect(validateFormDefinition(definition).some((issue) => issue.code === "circular-dependency")).toBe(true);
  });

  it("creates topological ordering", () => {
    const graph = buildDependencyGraph(shipmentBookingForm);
    expect(topologicalOrder(graph)).toContain("totalCharge");
  });

  it("evaluates conditional rules", () => {
    const result = evaluateRules(shipmentBookingForm, { ...bookingInitialValues, cargoType: "dangerous-goods" });
    expect(result.required.has("unNumber")).toBe(true);
  });

  it("tracks affected fields", () => {
    const graph = buildDependencyGraph(shipmentBookingForm);
    expect(affectedFields(graph, "baseCharge").has("totalCharge")).toBe(true);
  });

  it("calculates fields without eval", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext() });
    engine.setValue("discount", 100);
    expect(engine.state.values.totalCharge).toBe(1316);
  });

  it("validates cross-field notEqual", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, portOfLoading: "CNSHA", portOfDischarge: "CNSHA" }, context: testContext() });
    const errors = await engine.validate();
    expect(errors.some((error) => error.fieldId === "portOfDischarge")).toBe(true);
  });

  it("applies permission read-only state", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext({ permissions: [] }) });
    expect(engine.state.readOnlyFields.has("discount")).toBe(true);
  });

  it("generates tenant-aware draft keys", () => {
    expect(createDraftKey({ tenantId: "tenant-a", userId: "u1" }, "shipment-booking", "new", 3)).toBe("tenant-a:u1:shipment-booking:new:v3");
  });

  it("isolates draft state by tenant", async () => {
    const adapter = new MemoryDraftAdapter();
    await adapter.save("tenant-a:u:form:new:v1", { values: { x: 1 }, formVersion: 1, savedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() });
    expect(await adapter.load("tenant-b:u:form:new:v1")).toBeUndefined();
  });

  it("migrates drafts", () => {
    expect(migrateDraft(shipmentBookingForm, { baseCharge: 1, surcharge: 2, tax: 3, discount: 1 }, 1).totalCharge).toBe(5);
  });

  it("normalizes plugin duplicate registration", () => {
    const registry = new FieldRegistry();
    registry.register({ type: "text" });
    expect(() => registry.register({ type: "text" })).toThrow(/already registered/);
  });

  it("registers attachment plugin field type", () => {
    const registry = createDefaultFieldRegistry();
    attachmentPlugin().setup({ registry, telemetry: { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() }, context: testContext(), platformVersion: "0.1.0", formVersion: 2 });
    expect(registry.has("attachment")).toBe(true);
  });

  it("rejects incompatible plugins", () => {
    expect(() => new FormEngine({
      definition: shipmentBookingForm,
      initialValues: bookingInitialValues,
      context: testContext(),
      plugins: [{ id: "future-only", version: "1.0.0", compatibleFormVersions: [99], setup: () => ({}) }]
    })).toThrow(/not compatible/);
  });
});

describe("form platform integration coverage", () => {
  it("changing one field shows conditional dangerous goods field", async () => {
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" } });
    fireEvent.click(screen.getByText("Cargo"));
    fireEvent.change(await screen.findByLabelText(/Cargo type/i), { target: { value: "dangerous-goods" } });
    expect(await screen.findByLabelText(/UN number/i)).toBeInTheDocument();
  });

  it("blocks next-step navigation until the active step is valid", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext() });
    const moved = await engine.goToStep(1);
    expect(moved).toBe(false);
    expect(engine.state.currentStep).toBe(0);
    expect(engine.getStepStatuses()[0]?.hasError).toBe(true);
  });

  it("marks completed steps after required values are present", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" }, context: testContext() });
    const moved = await engine.goToStep(1);
    expect(moved).toBe(true);
    expect(engine.getStepStatuses()[0]?.completed).toBe(true);
  });

  it("changing a charge updates calculated total", async () => {
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" } });
    fireEvent.click(screen.getByText("Charges"));
    fireEvent.change(await screen.findByLabelText(/Discount/i), { target: { value: "50" } });
    expect(await screen.findByLabelText(/Total charge/i)).toHaveValue("1366");
  });

  it("rejects circular config before render", () => {
    const definition: FormDefinition<{ a: number; b: number }> = { id: "bad", version: 1, title: "Bad", sections: [{ id: "s", title: "S", fields: [{ id: "a", type: "number", label: "A", dependencies: ["b"] }, { id: "b", type: "number", label: "B", dependencies: ["a"] }] }] };
    expect(() => new FormEngine({ definition, initialValues: { a: 1, b: 2 }, context: testContext() })).toThrow(/Circular/);
  });

  it("async validation reports latest result", async () => {
    const engine = new FormEngine({ definition: employeeOnboardingForm, initialValues: { ...employeeInitialValues, nationalId: "1111111111" }, context: testContext() });
    const errors = await engine.validate();
    expect(errors.some((error) => error.fieldId === "nationalId")).toBe(true);
  });

  it("saves and restores draft", async () => {
    const adapter = new MemoryDraftAdapter();
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), draftAdapter: adapter });
    engine.setValue("bookingReference", "BK-1234");
    await engine.saveDraft();
    const restored = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), draftAdapter: adapter });
    await restored.restoreDraft();
    expect(restored.state.values.bookingReference).toBe("BK-1234");
  });

  it("permission prevents field editing", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext({ permissions: [] }) });
    engine.setValue("discount", 900);
    expect(engine.state.values.discount).toBe(0);
  });

  it("version conflict preserves user values", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, bookingReference: "BK-4090", customer: "acme", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" }, context: testContext() });
    await engine.submit();
    expect(engine.state.submission.status).toBe("conflict");
    expect(engine.state.values.bookingReference).toBe("BK-4090");
  });

  it("unknown submission prevents duplicate submission", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, bookingReference: "BK-0000", customer: "acme", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" }, context: testContext() });
    await engine.submit();
    const first = engine.state.submission;
    await engine.submit();
    expect(engine.state.submission).toBe(first);
  });

  it("repeating group preserves item identity", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext() });
    engine.addRepeatingItem("containers", { quantity: 1 });
    const id = engine.state.values.containers[0]!.id;
    engine.moveRepeatingItem("containers", id, 1);
    expect(engine.state.values.containers[0]!.id).toBe(id);
  });

  it("plugins capture audit and analytics", () => {
    const events: Array<{ event: string; timestamp: string }> = [];
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), plugins: [auditTrailPlugin(events), formAnalyticsPlugin(1)] });
    engine.setValue("customer", "acme");
    expect(events.some((event) => event.event === "field_changed")).toBe(true);
  });

  it("keeps large-form field interaction inside the performance budget", () => {
    const fields = Array.from({ length: 150 }, (_, index) => ({ id: `field${index}`, type: "text", label: `Field ${index}` }));
    const rules = Array.from({ length: 50 }, (_, index) => ({
      id: `rule${index}`,
      priority: index,
      when: { field: "field0", operator: "equals", value: `value-${index}` },
      effects: [{ type: "show", target: `field${index + 1}` }]
    }));
    const definition: FormDefinition<Record<string, unknown>> = {
      id: "large-form",
      version: 1,
      title: "Large form",
      sections: Array.from({ length: 20 }, (_, sectionIndex) => ({
        id: `section${sectionIndex}`,
        title: `Section ${sectionIndex}`,
        fields: fields.slice(sectionIndex * 8, sectionIndex * 8 + 8)
      })),
      rules
    };
    const initialValues = Object.fromEntries(fields.map((field) => [field.id, ""]));
    const engine = new FormEngine({ definition, initialValues, context: testContext() });
    const unrelated = vi.fn();
    engine.subscribeField("field149", unrelated);
    const startedAt = performance.now();
    engine.setValue("field0", "value-1");
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeLessThan(100);
    expect(unrelated).not.toHaveBeenCalled();
  });
});
