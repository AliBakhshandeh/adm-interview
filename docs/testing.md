# Testing

The repository includes unit, integration, E2E, and Storybook build coverage.

## Commands

```bash
pnpm test
pnpm e2e
CI=1 pnpm --filter @admiral/showcase build-storybook
```

## Unit Coverage

The platform tests cover:

- duplicate field ID detection
- unknown dependency detection
- circular dependency detection
- topological ordering
- conditional rule evaluation
- affected field discovery
- calculated fields without `eval`
- cross-field validation
- permission read-only state
- tenant-aware draft keys
- tenant draft isolation
- migrations
- duplicate registry behavior
- attachment field plugin registration
- incompatible plugin rejection

## Integration Coverage

The integration tests cover:

- conditional fields becoming visible
- calculated charge updates
- circular configuration rejection before rendering
- async validation
- draft save and restore
- step-level navigation blocking
- completed-step status
- permission preventing field edits
- version conflict preserving user values
- unknown submission preventing duplicate submit
- repeating group identity preservation
- plugin audit and analytics events
- large-form interaction performance budget

## E2E Coverage

### Journey A - Shipment Booking

```text
Open Booking Form
→ Select customer
→ Fill booking reference
→ Select route ports
→ Select voyage
→ Select dangerous goods
→ Complete conditional UN number
→ Add container
→ Save draft
→ Reload
→ Restore draft
→ Submit
→ Verify success
```

### Journey B - Conflict

```text
Open Booking Form
→ Fill existing booking values
→ Submit
→ Receive conflict
→ Preserve user values
→ Review differences
→ Resubmit
→ Verify success
```

The Playwright suite does not rely on fixed sleeps such as `waitForTimeout(3000)`.

## Storybook Coverage

Stories exist for:

- text field
- select field
- async select
- currency field
- file field
- repeating group
- conditional field
- warning state
- validation error state
- multi-step form
- RTL form
- dark theme
- read-only form
- permission-restricted field
- conflict state
- draft restored state
- unknown submission state

## Product Team Testing Utility

The `@admiral/form-testing` package exposes a `renderFormPlatform` helper for product squads.

```tsx
import { renderFormPlatform } from "@admiral/form-testing";

renderFormPlatform({
  definition,
  initialValues,
  context: {
    tenantId: "tenant-a",
    userId: "user-1",
    locale: "en",
    timezone: "UTC",
    permissions: [],
    correlationId: "test"
  }
});
```

Recommended future additions:

- mock data-source factory
- deterministic async validation helper
- draft adapter fixture
- permission matrix fixture
- plugin fixture builder
- submission simulator
