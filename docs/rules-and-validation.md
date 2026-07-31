# Rules and Validation

## Rules Engine

Rules are declarative metadata. Product logic belongs in form definitions, not scattered inside JSX.

```ts
{
  id: "dangerous-goods-documents",
  priority: 10,
  when: { field: "cargoType", operator: "equals", value: "dangerous-goods" },
  effects: [
    { type: "require", target: "unNumber" },
    {
      type: "warning",
      target: "unNumber",
      message: {
        en: "Dangerous goods require verified documents before submission.",
        fa: "کالای خطرناک پیش از ارسال به مدارک تاییدشده نیاز دارد."
      }
    }
  ]
}
```

## Deterministic Evaluation

Rules are evaluated by:

1. Lower `priority` first.
2. Stable `id` ordering when priority is equal.
3. Declarative effects applied to an immutable result model.

The result contains visible, enabled, read-only, required, warnings, options, cleared values, defaults, and evaluation history.

## Dependency Graph

The graph is built from:

- explicit field dependencies
- visibility conditions
- enabled and read-only conditions
- conditional required rules
- calculated field dependencies
- remote data-source dependencies
- rule condition references and rule effect targets

The graph is validated before rendering. Direct and indirect cycles are rejected.

## Incremental Updates

When a field changes, the engine asks the graph for affected fields. It then notifies only:

- global subscribers
- the changed field subscriber
- affected field subscribers

This keeps isolated interactions responsive and supports large forms.

## Validation Precedence

Validation precedence:

1. Schema required/type validation.
2. Field-level client validation.
3. Field-level async/server validation.
4. Form-level business validation.
5. Submission/server validation.

Warnings are non-blocking. Errors block step navigation and final submission.

## Field-Level Validation

```ts
{
  id: "bookingReference",
  type: "text",
  label: "Booking reference",
  required: true,
  validation: [
    {
      type: "pattern",
      value: "^BK-[0-9]{4}$",
      message: "Use format BK-1234."
    }
  ]
}
```

## Cross-Field Validation

```ts
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
```

## Async Validation

Async validation supports:

- debouncing
- request cancellation
- latest request wins
- pending field state
- retry
- network error mapping
- tenant/user-aware cache
- stale result prevention through `AbortSignal`

```ts
{
  id: "nationalId",
  type: "text",
  label: "National ID",
  required: true,
  validation: [
    {
      type: "async",
      debounceMs: 300,
      retry: 1,
      message: "National ID is already registered.",
      validate: async (value, values, context, signal) => {
        const response = await fetch(`/api/${context.tenantId}/national-id`, {
          method: "POST",
          body: JSON.stringify({ value }),
          signal
        });
        return response.ok;
      }
    }
  ]
}
```

## Step-Level Validation

Forward step navigation validates only fields belonging to the current step. The engine exposes per-step status for:

- has error
- completed
- can navigate

This lets the UI show completed and error indicators without validating the whole form on every navigation.

## Submission Validation

Server-side validation can return normalized field errors:

```ts
return {
  status: "validation-failed",
  errors: [
    {
      fieldId: "bookingReference",
      message: "Booking reference is already used.",
      severity: "error",
      source: "server"
    }
  ]
};
```

Raw transport errors should be mapped into `FormPlatformError` before the UI renders them.
