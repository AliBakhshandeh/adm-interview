# Technical Review Script

This guide can be used during the final technical review session.

## 15-Minute Architecture Presentation

1. Start with the problem: many squads repeatedly implement complex form behavior.
2. Show `@admiral/form-platform` as the public facade.
3. Explain package boundaries:
   - schema
   - rules
   - validation
   - core
   - react
   - ui
   - cli
   - testing
   - telemetry
4. Explain the headless engine and why it is not coupled to React Hook Form, Formik, Axios, Next.js routing, or a design-system vendor.
5. Show the dependency graph and incremental update model.
6. Show plugins and governance.

## Demo Checklist

### Run Showcase

```bash
pnpm dev
```

Open the local Vite URL and show:

- Shipment Booking Form
- Employee Onboarding Form
- language toggle
- dark mode
- draft status
- debug panel

### Conditional Rules

1. Open Shipment Booking.
2. Go to Cargo.
3. Select `Dangerous goods`.
4. Show that `UN number` appears and becomes required.
5. Show warning message for dangerous goods documents.

### Dependency-Based Remote Options

1. Open Route step.
2. Select port of loading and discharge.
3. Show voyage field using remote data-source behavior.
4. Use search/load more where available.

### Calculated Field

1. Go to Charges.
2. Change discount.
3. Show total charge recalculating.
4. Explain no `eval` is used.

### Repeating Group

1. Go to Cargo.
2. Add container.
3. Edit type, quantity, and weight.
4. Reorder or remove the item.
5. Explain stable item IDs.

### Draft Restoration

1. Fill booking reference.
2. Save draft.
3. Reload.
4. Show restored value.
5. Explain draft key shape.

### Conflict

1. Use booking reference `BK-4090`.
2. Submit.
3. Show conflict state.
4. Show preserved user values and server changed fields.
5. Click review and resubmit.

### Unknown Submission

1. Use booking reference `BK-0000`.
2. Submit.
3. Show unknown status and idempotency key.
4. Click status check.

### Tenant Switching

1. Explain `FormPlatformContext`.
2. Show draft key includes tenant and user.
3. Run or point to tenant isolation test.

### Isolated Field Updates

1. Show `subscribeField` in core.
2. Show performance test with 150 fields and 50 rules.

## Tests To Run Live

```bash
pnpm test
pnpm e2e
```

Optional:

```bash
pnpm typecheck
CI=1 pnpm --filter @admiral/showcase build-storybook
```

## Live Extension Preparation

### Option A - Port Selector Field

Use plugin architecture:

- register field type `port-selector`
- add remote data source
- render through React field branch or custom registry renderer in future extension
- keep core engine unchanged

### Option B - Refrigerated Special Equipment Rule

Add rule metadata:

```ts
{
  id: "refrigerated-below-zero-approval",
  when: {
    all: [
      { field: "cargoType", operator: "equals", value: "refrigerated" },
      { field: "targetTemperature", operator: "lessThan", value: 0 }
    ]
  },
  effects: [
    { type: "require", target: "specialEquipmentApproval" }
  ]
}
```

No business logic is added to the engine.

### Option C - Schema Migration

Add a migration:

```ts
1: (oldValue) => ({
  ...oldValue,
  customerId: lookupCustomerId(oldValue.customerName),
  customerDisplayName: oldValue.customerName
})
```

Discuss failure handling, compatibility, rollback, and user notification.

## Questions To Expect

- Why not React Hook Form?
- How are rules deterministic?
- How are circular dependencies detected?
- How does async validation avoid stale results?
- What prevents tenant leakage?
- What is enforced in frontend versus backend?
- How would this be governed across ten squads?
- What is intentionally out of scope?
