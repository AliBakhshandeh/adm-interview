import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import {
  type BuiltInFieldType,
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

  it("keeps permission read-only state after recalculation", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext({ permissions: [] }) });
    engine.setValue("baseCharge", 1500);
    expect(engine.state.readOnlyFields.has("discount")).toBe(true);
    engine.setValue("discount", 100);
    expect(engine.state.values.discount).toBe(0);
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
    const config = { maxSizeMb: 25, acceptedTypes: ["application/pdf"] };
    attachmentPlugin(config).setup({ registry, telemetry: { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() }, context: testContext(), platformVersion: "0.1.0", formVersion: 2 });
    expect(registry.get("file")?.config).toEqual(config);
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
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" } });
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

  it("blocks direct navigation when an intermediate step is invalid", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" }, context: testContext() });
    const moved = await engine.goToStep(3);
    expect(moved).toBe(false);
    expect(engine.state.currentStep).toBe(0);
    expect(engine.state.errors.some((error) => error.fieldId === "portOfLoading")).toBe(true);
  });

  it("marks completed steps after required values are present", async () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" }, context: testContext() });
    const moved = await engine.goToStep(1);
    expect(moved).toBe(true);
    expect(engine.getStepStatuses()[0]?.completed).toBe(true);
  });

  it("changing a charge updates calculated total", async () => {
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" } });
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

  it("keeps only the latest async validation result", async () => {
    const resolvers: Array<(value: boolean) => void> = [];
    const definition: FormDefinition<{ nationalId: string }> = {
      id: "async-race",
      version: 1,
      title: "Async race",
      sections: [{
        id: "main",
        title: "Main",
        fields: [{
          id: "nationalId",
          type: "text",
          label: "National ID",
          validation: [{
            type: "async",
            message: "National ID is already registered.",
            validate: () => new Promise<boolean>((resolve) => resolvers.push(resolve))
          }]
        }]
      }]
    };
    const engine = new FormEngine({ definition, initialValues: { nationalId: "old" }, context: testContext() });
    const first = engine.validate();
    engine.setValue("nationalId", "new");
    const second = engine.validate();
    resolvers[1]?.(true);
    await second;
    resolvers[0]?.(false);
    await first;
    expect(engine.state.errors).toEqual([]);
    expect(engine.state.submission.status).toBe("idle");
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

  it("discovers and migrates drafts saved under older version keys", async () => {
    const adapter = new MemoryDraftAdapter();
    await adapter.save(createDraftKey(testContext(), shipmentBookingForm.id, "new", 1), {
      values: { ...bookingInitialValues, bookingReference: "BK-1001", totalCharge: 0 },
      formVersion: 1,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10000).toISOString()
    });
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), draftAdapter: adapter });
    await engine.restoreDraft();
    expect(engine.state.values.bookingReference).toBe("BK-1001");
    expect(engine.state.values.totalCharge).toBe(1416);
  });

  it("permission prevents field editing", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext({ permissions: [] }) });
    engine.setValue("discount", 900);
    expect(engine.state.values.discount).toBe(0);
  });

  it("applies form-level permissions to every field", () => {
    const definition: FormDefinition<{ reference: string }> = {
      id: "restricted-form",
      version: 1,
      title: "Restricted form",
      permission: { view: "form.view", edit: "form.edit" },
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }]
    };
    const engine = new FormEngine({ definition, initialValues: { reference: "REF-1" }, context: testContext({ permissions: ["form.view"] }) });
    expect(engine.state.visibleFields.has("reference")).toBe(true);
    expect(engine.state.readOnlyFields.has("reference")).toBe(true);
    engine.setValue("reference", "REF-2");
    expect(engine.state.values.reference).toBe("REF-1");
  });

  it("applies section-level permissions to contained fields", () => {
    const definition: FormDefinition<{ publicRef: string; salary: number }> = {
      id: "section-restricted-form",
      version: 1,
      title: "Section restricted form",
      sections: [
        { id: "public", title: "Public", fields: [{ id: "publicRef", type: "text", label: "Public reference" }] },
        { id: "payroll", title: "Payroll", permission: { view: "payroll.view", edit: "payroll.edit" }, fields: [{ id: "salary", type: "currency", label: "Salary" }] }
      ]
    };
    const hidden = new FormEngine({ definition, initialValues: { publicRef: "REF", salary: 1000 }, context: testContext({ permissions: [] }) });
    expect(hidden.state.visibleFields.has("publicRef")).toBe(true);
    expect(hidden.state.visibleFields.has("salary")).toBe(false);
    const readOnly = new FormEngine({ definition, initialValues: { publicRef: "REF", salary: 1000 }, context: testContext({ permissions: ["payroll.view"] }) });
    expect(readOnly.state.visibleFields.has("salary")).toBe(true);
    expect(readOnly.state.readOnlyFields.has("salary")).toBe(true);
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

  it("normalizes thrown submission failures into failed state", async () => {
    const definition: FormDefinition<{ reference: string }> = {
      id: "submit-failure",
      version: 1,
      title: "Submit failure",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }],
      submission: {
        submit: async () => {
          throw new Error("Gateway timeout");
        }
      }
    };
    const telemetry = { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() };
    const engine = new FormEngine({ definition, initialValues: { reference: "REF-1" }, context: testContext(), telemetry });
    const result = await engine.submit();
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.error.message : "").toBe("Gateway timeout");
    expect(telemetry.captureError).toHaveBeenCalled();
  });

  it("repeating group preserves item identity", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext() });
    engine.addRepeatingItem("containers", { quantity: 1 });
    const id = engine.state.values.containers[0]!.id;
    engine.moveRepeatingItem("containers", id, 1);
    expect(engine.state.values.containers[0]!.id).toBe(id);
  });

  it("creates repeating items from nested schema defaults", () => {
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext() });
    engine.addRepeatingItem("containers", {});
    expect(engine.state.values.containers[0]).toMatchObject({ type: "", quantity: 0, weight: 0 });
  });

  it("renders plugin registered custom field renderers", () => {
    const registry = createDefaultFieldRegistry();
    registry.register({
      type: "rating",
      render: ({ value, setValue }) => <button type="button" onClick={() => setValue(5)}>Rating {String(value ?? 0)}</button>
    });
    const definition: FormDefinition<{ score: number }> = {
      id: "custom",
      version: 1,
      title: "Custom",
      sections: [{ id: "main", title: "Main", fields: [{ id: "score", type: "rating", custom: true, label: "Score" }] }]
    };
    render(<FormRenderer definition={definition} initialValues={{ score: 1 }} context={testContext()} registry={registry} draftAdapter={new MemoryDraftAdapter()} />);
    fireEvent.click(screen.getByRole("button", { name: /Rating 1/i }));
    expect(screen.getByRole("button", { name: /Rating 5/i })).toBeInTheDocument();
  });

  it("does not expose debug values unless explicitly enabled", () => {
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: { ...bookingInitialValues, bookingReference: "BK-SECRET" } });
    expect(screen.queryByText("Debug")).not.toBeInTheDocument();
  });

  it("uses registry attachment config for file validation", async () => {
    const registry = createDefaultFieldRegistry();
    registry.configure("file", { config: { maxSizeMb: 1, acceptedTypes: ["application/pdf"] } });
    const definition: FormDefinition<{ attachments: unknown[] }> = {
      id: "file-config",
      version: 1,
      title: "File config",
      sections: [{ id: "main", title: "Main", fields: [{ id: "attachments", type: "file", label: "Attachments" }] }]
    };
    const view = render(<FormRenderer definition={definition} initialValues={{ attachments: [] }} context={testContext()} registry={registry} draftAdapter={new MemoryDraftAdapter()} />);
    const input = view.container.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).toHaveAttribute("accept", "application/pdf");
    fireEvent.change(input!, { target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("Unsupported file type")).toBeInTheDocument();
  });

  it("links validation errors to the invalid input", async () => {
    renderFormPlatform({ definition: shipmentBookingForm, initialValues: bookingInitialValues });
    fireEvent.click(screen.getByText("Next"));
    const input = await screen.findByLabelText(/Booking reference/i);
    expect(input).toHaveAttribute("aria-describedby", expect.stringContaining("bookingReference-error"));
  });

  it("plugins capture audit and analytics", () => {
    const events: Array<{ event: string; timestamp: string }> = [];
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), plugins: [auditTrailPlugin(events), formAnalyticsPlugin(1)] });
    engine.setValue("customer", "acme");
    expect(events.some((event) => event.event === "field_changed")).toBe(true);
  });

  it("plugins receive validation, submission, step, and draft lifecycle events", async () => {
    const events: Array<{ event: string; timestamp: string }> = [];
    const adapter = new MemoryDraftAdapter();
    const engine = new FormEngine({
      definition: shipmentBookingForm,
      initialValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" },
      context: testContext(),
      draftAdapter: adapter,
      plugins: [auditTrailPlugin(events)]
    });
    await engine.validate();
    await engine.goToStep(1);
    await engine.saveDraft();
    await engine.discardDraft();
    await engine.submit();
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining(["validation_started", "validation_succeeded", "step_changed", "draft_saved", "draft_discarded", "submission_attempted", "submission_succeeded"]));
  });

  it("keeps large-form field interaction inside the performance budget", () => {
    const fields = Array.from({ length: 150 }, (_, index) => ({ id: `field${index}`, type: "text" as BuiltInFieldType, label: `Field ${index}` }));
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

  it("records telemetry measurements for rule and field latency", () => {
    const telemetry = { track: vi.fn(), measure: vi.fn(), captureError: vi.fn() };
    const engine = new FormEngine({ definition: shipmentBookingForm, initialValues: bookingInitialValues, context: testContext(), telemetry });
    engine.setValue("baseCharge", 1300);
    expect(telemetry.measure).toHaveBeenCalledWith("rule_evaluation_ms", expect.any(Number), expect.objectContaining({ fieldId: "baseCharge" }));
    expect(telemetry.measure).toHaveBeenCalledWith("field_change_ms", expect.any(Number), expect.objectContaining({ fieldId: "baseCharge" }));
  });

  it("keeps React render commits inside the profiling budget", () => {
    const commits: number[] = [];
    render(
      <Profiler id="shipment-form" onRender={(_id, _phase, actualDuration) => commits.push(actualDuration)}>
        <FormRenderer definition={shipmentBookingForm} initialValues={{ ...bookingInitialValues, customer: "acme", bookingReference: "BK-1234" }} context={testContext()} draftAdapter={new MemoryDraftAdapter()} />
      </Profiler>
    );
    commits.length = 0;
    fireEvent.change(screen.getByLabelText(/Booking reference/i), { target: { value: "BK-9999" } });
    expect(commits.length).toBeGreaterThan(0);
    expect(Math.max(...commits)).toBeLessThan(100);
  });
});
