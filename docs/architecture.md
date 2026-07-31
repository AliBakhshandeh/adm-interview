# Architecture

`@admiral/form-platform` is designed as a reusable frontend platform capability. Product teams define typed metadata; the platform handles engine state, rule evaluation, validation, rendering, drafts, permissions, submission states, telemetry, and plugins.

The architecture deliberately separates the headless engine from presentation and transport concerns. React, Vite, browser storage, and mock APIs are adapters around the core platform rather than public core dependencies.

## System Context

```mermaid
flowchart TB
  ProductSquads[Product squads] --> Schema[Typed form schemas]
  Schema --> Platform["@admiral/form-platform"]
  Platform --> Browser[Accessible React UI]
  Platform --> DraftAPI[Draft API or local adapter]
  Platform --> SubmissionAPI[Submission API]
  Platform --> Telemetry[Telemetry sink]
```

Product squads own product-specific schemas and business rules. Platform maintainers own the engine, public contracts, validation behavior, rendering adapter, UI primitives, generator, and governance.

## Package Dependency Diagram

```mermaid
flowchart LR
  Showcase[apps/showcase] --> Platform["@admiral/form-platform"]
  Platform --> React["@admiral/form-react"]
  Platform --> Core["@admiral/form-core"]
  Platform --> Schema["@admiral/form-schema"]
  React --> UI["@admiral/form-ui"]
  React --> Core
  Core --> Rules["@admiral/form-rules"]
  Core --> Validation["@admiral/form-validation"]
  Core --> Telemetry["@admiral/telemetry"]
  Rules --> Schema
  Validation --> Schema
  Testing["@admiral/form-testing"] --> React
  CLI["@admiral/form-cli"] --> Platform
```

## Rendering Flow

```mermaid
sequenceDiagram
  participant App
  participant Renderer
  participant Engine
  participant Registry
  App->>Renderer: definition + context
  Renderer->>Engine: create headless engine
  Engine->>Registry: validate field types
  Engine->>Engine: validate schema and graph
  Renderer->>Renderer: render active sections
```

The renderer creates one engine instance per form definition, form version, tenant, and user. The engine validates schema and dependency graph before the UI renders the form. Invalid definitions fail fast with actionable errors.

## Rule Evaluation Sequence

```mermaid
sequenceDiagram
  participant Field
  participant Engine
  participant Graph
  participant Rules
  Field->>Engine: setValue(fieldId, value)
  Engine->>Graph: affectedFields(fieldId)
  Engine->>Rules: evaluate deterministic rules by priority
  Rules-->>Engine: visible/enabled/readOnly/required/warnings
  Engine->>Engine: recalculate dependent calculated fields
  Engine-->>Field: notify field and affected subscribers
```

## Dependency Graph Model

```mermaid
flowchart LR
  POL[portOfLoading] --> VOY[voyage options]
  POD[portOfDischarge] --> VOY
  Base[baseCharge] --> Total[totalCharge]
  Surcharge[surcharge] --> Total
  Tax[tax] --> Total
  Discount[discount] --> Total
  Cargo[cargoType] --> UN[unNumber required/visible]
  Cargo --> Temp[targetTemperature required/visible]
```

The engine builds edges from field dependencies, visibility/enabled/read-only/required conditions, calculated dependencies, remote data-source dependencies, and rule conditions. Topological ordering rejects direct and indirect cycles before rendering. Runtime updates use `affectedFields` so isolated field changes avoid full-form subscriber notifications.

## Draft Persistence

```mermaid
sequenceDiagram
  participant User
  participant Engine
  participant Adapter
  User->>Engine: field changed
  Engine->>Engine: debounce save
  Engine->>Adapter: save tenant:user:form:entity:v
  Adapter-->>Engine: saved
```

Draft persistence is adapter-based. The demo uses local and memory adapters; production should provide an authenticated API adapter with encryption, retention, authorization, and compatibility checks.

## Form Migration Flow

```mermaid
flowchart TD
  Load[Load draft record] --> CheckExpiry{Expired?}
  CheckExpiry -->|yes| Expired[Mark draft expired]
  CheckExpiry -->|no| CheckVersion{Draft version < schema version?}
  CheckVersion -->|no| Restore[Restore values]
  CheckVersion -->|yes| Migrate[Run migrations sequentially]
  Migrate --> Success[Restore migrated values]
  Migrate -->|missing migration| Reject[Reject invalid draft with actionable error]
```

## Submission State

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> validating
  validating --> validation_failed
  validating --> submitting
  submitting --> succeeded
  submitting --> conflict
  submitting --> unknown
  submitting --> failed
  unknown --> [*]
```

The explicit `unknown` state is important: if a request times out after being sent, the UI cannot safely assume failure. The engine stores the idempotency key and blocks duplicate submissions until status is checked or a safe retry path is available.

## Plugin Lifecycle

```mermaid
flowchart LR
  Register --> CheckDuplicates --> CheckDependencies --> CheckCompatibility --> Setup --> Contributions --> Events --> Cleanup
```

Plugins declare `id`, `version`, optional dependencies, compatible form versions, and minimum platform version. Duplicate IDs, missing dependencies, and incompatible versions are rejected before setup. Setup failures are captured through telemetry so one plugin cannot crash unrelated contributions.

## Tenant Switch

```mermaid
sequenceDiagram
  participant UI
  participant Engine
  participant Draft
  UI->>Engine: tenant changed
  Engine->>Engine: create new context/correlation
  Engine->>Draft: use tenant-specific key
  Engine-->>UI: no cross-tenant state reuse
```

Tenant switching should create a fresh engine context. Draft keys, remote option cache keys, telemetry attributes, permissions, and data-source requests all include tenant context so tenant data is not reused accidentally.
