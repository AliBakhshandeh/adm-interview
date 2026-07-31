# Getting Started

## Prerequisites

- Node.js compatible with the workspace lockfile.
- `pnpm` 9.x.
- A browser for the Vite showcase and Playwright tests.

## Install

```bash
pnpm install
```

## Run The Showcase

```bash
pnpm dev
```

The app starts the showcase package. It renders both example forms through the shared `@admiral/form-platform` facade.

## Run Quality Checks

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm e2e
pnpm storybook:build
pnpm verify
```

## Generate A New Form

```bash
pnpm generate:multi-step invoice-request
```

The generator creates:

```text
features/invoice-request/
├── invoice-request.form.ts
├── invoice-request.schema.ts
├── invoice-request.rules.ts
├── invoice-request.validation.ts
├── invoice-request.datasource.ts
├── invoice-request.fixture.ts
├── invoice-request.migrations.ts
└── invoice-request.test.tsx
```

## Render A Form

```tsx
import { FormRenderer } from "@admiral/form-platform";
import { invoiceRequestForm } from "./features/invoice-request/invoice-request.form";
import { invoiceRequestFixture } from "./features/invoice-request/invoice-request.fixture";

export function InvoiceRequestPage(): JSX.Element {
  return (
    <FormRenderer
      definition={invoiceRequestForm}
      initialValues={invoiceRequestFixture}
      context={{
        tenantId: "tenant-a",
        userId: "user-42",
        locale: "en",
        timezone: "UTC",
        permissions: [],
        correlationId: crypto.randomUUID()
      }}
    />
  );
}
```

## Developer Workflow

1. Define the form value type.
2. Create a `FormDefinition<TValues>`.
3. Add sections, fields, and steps.
4. Add conditional rules and calculated fields.
5. Add validation and remote data sources.
6. Add migrations when versions change.
7. Render the definition through `FormRenderer`.
8. Add tests with `FormEngine` or React Testing Library.
9. Add Storybook coverage for important states.
