# Persistence and Submission

## Draft Persistence

Draft persistence is adapter-based. The engine does not depend on a specific backend.

```ts
interface DraftAdapter {
  load<TValues>(key: string): Promise<DraftRecord<TValues> | undefined>;
  save<TValues>(key: string, record: DraftRecord<TValues>): Promise<void>;
  discard(key: string): Promise<void>;
}
```

## Draft Key

Draft keys include tenant, user, form, entity or draft ID, and form version.

```text
tenant-a:user-42:shipment-booking:new:v2
```

This prevents state reuse across tenants and prevents incompatible versions from silently loading into a new schema.

## Draft Record

```ts
type DraftRecord<TValues> = {
  values: TValues;
  formVersion: number;
  savedAt: string;
  expiresAt: string;
};
```

## Draft Behaviors

Implemented:

- automatic debounced save
- explicit save
- restore
- discard
- saved indicator
- save failure state
- expiration handling
- tenant isolation
- versioned migration

Production API recommendations:

- authenticate every request
- encrypt sensitive drafts
- apply tenant authorization on the server
- enforce retention policies
- support draft locks or edit sessions if needed
- return compatibility errors explicitly
- avoid storing secrets and highly sensitive fields when possible

## Version Migration

When a draft version is older than the form definition version, migrations run sequentially.

```ts
migrations: {
  1: migrateV1ToV2,
  2: migrateV2ToV3
}
```

If a migration is missing, the draft is rejected rather than silently corrupting data.

## Submission Contract

```ts
type SubmissionConfig<TValues> = {
  endpoint?: string;
  submit: (
    values: TValues,
    context: FormPlatformContext,
    idempotencyKey: string
  ) => Promise<FormSubmissionResult<TValues>>;
  checkStatus?: (
    idempotencyKey: string,
    context: FormPlatformContext
  ) => Promise<FormSubmissionResult<TValues>>;
};
```

The engine generates an idempotency key for each submission attempt.

## Submission States

```ts
type FormSubmissionState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "submitting" }
  | { status: "succeeded"; entityId: string }
  | { status: "validation-failed"; errors: FormError[] }
  | { status: "conflict"; currentVersion: number; latestValues: FormValues; changedFields: string[] }
  | { status: "unknown"; idempotencyKey: string; checking: boolean }
  | { status: "failed"; error: FormPlatformError };
```

## Optimistic Concurrency

Conflict behavior:

1. User submits the form.
2. Server returns conflict with latest values and current version.
3. Engine preserves user-entered values.
4. UI displays changed server fields.
5. User reviews the conflict.
6. Engine updates base values and reviewed version.
7. User resubmits safely.

The platform never silently overwrites newer server data.

## Unknown Submission

Timeout after sending a request is not treated as a definite failure.

Unknown behavior:

- preserve the form
- store idempotency key
- prevent duplicate submit
- allow status checking when `checkStatus` exists
- retry only when safe
- show a clear explanation

## Error Model

Raw transport errors should be mapped into `FormPlatformError`.

```ts
type FormPlatformError =
  | { type: "validation"; fields: Record<string, string[]> }
  | { type: "network"; retryable: boolean; message?: string }
  | { type: "authorisation"; message: string }
  | { type: "conflict"; currentVersion: number }
  | { type: "rate-limit"; retryAfterSeconds?: number }
  | { type: "timeout"; statusUnknown: boolean }
  | { type: "unknown"; message: string };
```

## Production Submission Recommendations

- use idempotency keys server-side
- use optimistic concurrency versions
- require backend authorization
- apply CSRF protections when cookies are used
- normalize API errors before rendering
- redact PII in logs
- track correlation IDs end to end
