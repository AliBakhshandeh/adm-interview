import type { Meta, StoryObj } from "@storybook/react";
import { FormRenderer, MemoryDraftAdapter, type FormDefinition, type FormEngineOptions, type FormPlatformContext, type FormValues, type OptionDataSource, type SelectOption } from "@admiral/form-platform";
import { bookingInitialValues, employeeInitialValues, employeeOnboardingForm, shipmentBookingForm } from "./forms";

const context: FormPlatformContext = {
  tenantId: "tenant-a",
  userId: "storybook-user",
  locale: "en",
  timezone: "UTC",
  permissions: ["booking.discount.write", "payroll.salary.read", "payroll.salary.write"],
  correlationId: "storybook"
};

const dataSources: Record<string, OptionDataSource<SelectOption>> = {
  asyncPorts: {
    async search() {
      return { items: [{ value: "IRBND", label: "Bandar Abbas" }, { value: "NLRTM", label: "Rotterdam" }] };
    }
  }
};

const meta: Meta = {
  title: "Form Platform",
  component: FormRenderer
};

export default meta;
type Story = StoryObj;

function renderForm<TValues extends FormValues>(definition: FormDefinition<TValues>, initialValues: TValues, overrides: Partial<FormPlatformContext> = {}, stateOverrides?: FormEngineOptions<TValues>["stateOverrides"]): JSX.Element {
  return <FormRenderer definition={definition} initialValues={initialValues} context={{ ...context, ...overrides }} draftAdapter={new MemoryDraftAdapter()} dataSources={dataSources} stateOverrides={stateOverrides} />;
}

function singleField(type: string, extra: Record<string, unknown> = {}): FormDefinition<FormValues> {
  return {
    id: `story-${type}`,
    version: 1,
    title: `${type} field`,
    sections: [{ id: "main", title: "Main", fields: [{ id: "value", type, label: "Value", ...extra }] }]
  };
}

export const TextField: Story = {
  render: () => renderForm(singleField("text"), { value: "" })
};

export const SelectField: Story = {
  render: () => renderForm(singleField("select", { options: [{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }] }), { value: "" })
};

export const AsyncSelect: Story = {
  render: () => renderForm(singleField("select", { dataSource: { type: "remote", resource: "asyncPorts" } }), { value: "" })
};

export const CurrencyField: Story = {
  render: () => renderForm(singleField("currency"), { value: 1200 })
};

export const FileField: Story = {
  render: () => renderForm(singleField("file"), { value: [] })
};

export const RepeatingGroup: Story = {
  render: () => renderForm(singleField("repeating-group", { fields: [] }), { value: [] })
};

export const ConditionalField: Story = {
  render: () => renderForm({
    id: "story-conditional",
    version: 1,
    title: "Conditional field",
    sections: [{ id: "main", title: "Main", fields: [
      { id: "cargoType", type: "select", label: "Cargo type", options: [{ value: "general", label: "General" }, { value: "dangerous-goods", label: "Dangerous goods" }] },
      { id: "unNumber", type: "text", label: "UN number", visibility: { field: "cargoType", operator: "equals", value: "dangerous-goods" } }
    ] }]
  }, { cargoType: "general", unNumber: "" })
};

export const FieldWithWarning: Story = {
  render: () => renderForm(shipmentBookingForm, { ...bookingInitialValues, cargoType: "dangerous-goods" })
};

export const FieldWithValidationError: Story = {
  render: () => renderForm(singleField("text", { required: true }), { value: "" })
};

export const MultiStepForm: Story = {
  render: () => renderForm(shipmentBookingForm, bookingInitialValues)
};

export const RtlForm: Story = {
  render: () => renderForm(shipmentBookingForm, bookingInitialValues, { locale: "fa" })
};

export const DarkTheme: Story = {
  render: () => <div className="app app-dark" style={{ padding: 24 }}>{renderForm(shipmentBookingForm, bookingInitialValues)}</div>
};

export const ReadOnlyForm: Story = {
  render: () => renderForm(employeeOnboardingForm, employeeInitialValues, { permissions: ["payroll.salary.read"] })
};

export const PermissionRestrictedField: Story = {
  render: () => renderForm(shipmentBookingForm, bookingInitialValues, { permissions: [] })
};

export const ConflictState: Story = {
  render: () => renderForm(
    shipmentBookingForm,
    { ...bookingInitialValues, customer: "acme", bookingReference: "BK-4090", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" },
    {},
    { submission: { status: "conflict", currentVersion: 8, latestValues: { ...bookingInitialValues, customer: "acme", bookingReference: "BK-4090", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881", surcharge: 170 }, changedFields: ["surcharge"] } }
  )
};

export const DraftRestoredState: Story = {
  render: () => renderForm(
    shipmentBookingForm,
    { ...bookingInitialValues, customer: "acme", bookingReference: "BK-2222" },
    {},
    { draft: { status: "restored", key: "tenant-a:storybook-user:shipment-booking:new:v2", restoredAt: new Date("2026-07-31T10:00:00.000Z").toISOString() } }
  )
};

export const UnknownSubmissionState: Story = {
  render: () => renderForm(
    shipmentBookingForm,
    { ...bookingInitialValues, customer: "acme", bookingReference: "BK-0000", portOfLoading: "CNSHA", portOfDischarge: "IRBND", voyage: "VOY-881" },
    {},
    { submission: { status: "unknown", idempotencyKey: "idem-storybook-0000", checking: false } }
  )
};
