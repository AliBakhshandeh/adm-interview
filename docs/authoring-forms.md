# Authoring Forms

Product teams author forms by creating typed metadata. The platform owns the repetitive platform behavior: rendering, state, validation, rules, drafts, permissions, remote option loading, telemetry, submission, and plugins.

## Minimal Form

```ts
import type { FormDefinition } from "@admiral/form-platform";

export type InvoiceRequestValue = {
  reference: string;
  amount: number;
  notes?: string;
};

export const invoiceRequestForm: FormDefinition<InvoiceRequestValue> = {
  id: "invoice-request",
  version: 1,
  title: "Invoice Request",
  sections: [
    {
      id: "general",
      title: "General",
      fields: [
        { id: "reference", type: "text", label: "Reference", required: true },
        { id: "amount", type: "currency", label: "Amount", required: true },
        { id: "notes", type: "textarea", label: "Notes" }
      ]
    }
  ],
  steps: [{ id: "general", title: "General", sectionIds: ["general"] }]
};
```

## Typed Field IDs

`FormDefinition<TValues>` ties field IDs to the value shape. This gives product squads autocomplete and compile-time feedback for field IDs in validation, conditions, dependencies, calculated fields, and data sources.

```ts
type BookingValue = {
  portOfLoading: string;
  portOfDischarge: string;
};

const routeSection = {
  id: "route",
  title: "Route",
  fields: [
    { id: "portOfLoading", type: "select", label: "Port of loading" },
    {
      id: "portOfDischarge",
      type: "select",
      label: "Port of discharge",
      validation: [
        {
          type: "notEqual",
          field: "portOfLoading",
          message: "Port of discharge must differ from loading port."
        }
      ]
    }
  ]
} satisfies FormDefinition<BookingValue>["sections"][number];
```

## Multi-Step Workflow

Steps reference sections by ID. The engine validates the current step before forward navigation and exposes per-step status for completed and error indicators.

```ts
steps: [
  { id: "general", title: "General", sectionIds: ["general"] },
  { id: "route", title: "Route", sectionIds: ["route"] },
  { id: "review", title: "Review", sectionIds: ["general", "route"] }
]
```

## Conditional Fields

Use metadata conditions rather than JSX conditionals.

```ts
{
  id: "unNumber",
  type: "text",
  label: "UN number",
  visibility: { field: "cargoType", operator: "equals", value: "dangerous-goods" },
  requiredWhen: { field: "cargoType", operator: "equals", value: "dangerous-goods" }
}
```

## Calculated Fields

Calculated fields define explicit dependencies and use a typed function. The platform does not use `eval` or `new Function`.

```ts
{
  id: "totalCharge",
  type: "calculated",
  label: "Total charge",
  calculated: {
    dependencies: ["baseCharge", "surcharge", "tax", "discount"],
    precision: 2,
    calculate: (values) =>
      Number(values.baseCharge ?? 0) +
      Number(values.surcharge ?? 0) +
      Number(values.tax ?? 0) -
      Number(values.discount ?? 0)
  }
}
```

## Remote Options

Remote data sources are transport-independent. The form declares the resource and dependency fields; the application provides the adapter.

```ts
{
  id: "voyage",
  type: "select",
  label: "Voyage",
  dataSource: {
    type: "remote",
    resource: "voyages",
    dependsOn: ["portOfLoading", "portOfDischarge"]
  }
}
```

```ts
const dataSources = {
  voyages: {
    async search(query, context, signal) {
      const response = await fetch("/api/voyages", {
        method: "POST",
        body: JSON.stringify({ query, tenantId: context.tenantId }),
        signal
      });
      return response.json();
    }
  }
};
```

## Permissions

Permissions belong in schema metadata, not scattered through JSX.

```ts
{
  id: "discount",
  type: "currency",
  label: "Discount",
  permission: { edit: "booking.discount.write" }
}
```

Frontend permissions only improve UX. Backend authorization is still mandatory.

## Repeating Groups

Repeating values must include stable item IDs to avoid index-based identity bugs.

```ts
export type ContainerItem = {
  id: string;
  type: string;
  quantity: number;
  weight: number;
};
```

The engine supports add, remove, and reorder operations while preserving item identity.

## Form Versioning

Increase `version` when a form shape changes. Add migrations for draft compatibility.

```ts
migrations: {
  1: (oldValue) => ({
    ...oldValue,
    totalCharge:
      Number(oldValue.baseCharge ?? 0) +
      Number(oldValue.surcharge ?? 0) +
      Number(oldValue.tax ?? 0) -
      Number(oldValue.discount ?? 0)
  })
}
```
