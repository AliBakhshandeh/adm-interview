# Performance, Security, and Governance

## Performance Budget

Target budget:

- initial showcase render below 500 ms
- single isolated field interaction below 100 ms
- typical rule evaluation below 16 ms
- debounced draft save must not block typing
- no unnecessary full-form field subscriber notification

## Implemented Performance Strategies

- field-level subscriptions
- affected-field discovery through dependency graph
- deterministic rule evaluation
- calculated dependency recalculation
- debounced draft persistence
- debounced async validation
- request cancellation
- remote option caching
- memoized engine creation
- telemetry measurement points

The test suite includes a large-form scenario with 150 fields, 20 sections, and 50 conditional rules.

## Complexity Notes

Schema validation and graph construction run when the engine is created. Runtime field changes use graph edges to discover affected fields. This keeps interactions proportional to affected dependencies rather than total form size where possible.

## Security Considerations

Implemented:

- no `eval`
- no `new Function`
- typed calculated functions
- normalized error model
- tenant-aware draft keys
- tenant-aware remote option cache keys
- sensitive values excluded from audit events
- permission metadata centralized in schema

Production hardening required:

- backend authorization for all form actions
- schema allowlisting
- plugin allowlisting
- Content Security Policy
- CSRF protection for cookie-based sessions
- encrypted draft storage
- draft retention policies
- PII minimization
- file scanning
- signed upload/download URLs
- server-side validation of file type and size
- rate limiting
- audit trail immutability where required

## Permission Model

Permissions are declared in metadata:

```ts
permission: {
  view: "payroll.salary.read",
  edit: "payroll.salary.write"
}
```

Frontend permissions improve user experience. They must never be treated as a security boundary.

## Multi-Tenancy

Tenant isolation is represented through `FormPlatformContext`.

Tenant-aware areas:

- draft keys
- telemetry attributes
- remote option cache keys
- data source context
- permission context
- engine construction

Safe tenant switching should create a new context and engine instance. State must not be reused across tenants.

## Public API Governance

Recommended package governance:

- product teams import from `@admiral/form-platform`
- no deep imports from internal packages in product code
- semantic versioning
- changelog for every release
- migration guide for breaking changes
- deprecation policy
- compatibility tests
- canary rollout with one or two squads
- ownership model for the platform
- support channel and SLA expectations
- architecture decision records
- schema review process
- plugin certification

## Versioning Scenario

If v1 has:

```ts
{ field: "customerName" }
```

and v2 introduces:

```ts
{ id: "customerName", accessor: values => values.customerName }
```

This is a breaking change if existing schemas cannot compile or run unchanged. It should be released as a major version unless a compatibility layer preserves the old shape.

Recommended strategy:

1. Add compatibility layer in a minor version if possible.
2. Emit deprecation warnings.
3. Track adoption telemetry.
4. Publish migration guide.
5. Provide codemod for common cases.
6. Run compatibility tests against known product schemas.
7. Roll out through canary consumers.
8. Keep rollback path documented.

## Known Trade-Offs

This submission favors a compact, inspectable implementation over full commercial form-builder depth.

Intentionally omitted:

- visual drag-and-drop designer
- real backend draft API
- real cloud file upload
- antivirus scanning
- full automatic merge engine
- complete enterprise design system
- working codemod
- microfrontend runtime

These omissions are aligned with the challenge out-of-scope section.
