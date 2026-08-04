# Plugins

Plugins extend platform behavior without requiring product teams to modify the core engine.

## Plugin Contract

```ts
type FormPlugin = {
  id: string;
  version: string;
  dependsOn?: string[];
  compatibleFormVersions?: number[];
  minPlatformVersion?: string;
  setup(context: FormPluginContext): FormPluginContribution;
};
```

## Plugin Context

```ts
type FormPluginContext = {
  registry: FieldRegistry;
  telemetry: FormPlatformTelemetry;
  context: FormPlatformContext;
  platformVersion: string;
  formVersion: number;
};
```

## Contributions

```ts
type FormPluginContribution = {
  draftAdapter?: DraftAdapter;
  auditEvents?: FormAuditEvent[];
  onEvent?: (event: FormAuditEvent) => void;
  cleanup?: () => void;
};
```

Plugins can contribute:

- field types
- draft adapters
- telemetry enrichment
- audit handlers
- event listeners
- cleanup hooks

The public challenge also discusses submission hooks, schema validators, import/export, and value transformers as natural extension points. The current compact implementation demonstrates the plugin lifecycle and field/event contributions.

## Registration Guarantees

The registry handles:

- duplicate plugin IDs
- missing plugin dependencies
- incompatible form versions
- minimum platform version checks
- setup failure isolation
- cleanup hooks

Setup failures are reported to telemetry through `plugin_failed` and `captureError`.

## Attachment Plugin

The attachment plugin configures the built-in `file` field type and also registers an `attachment` alias for compatibility. The React file UI consumes the registry config for accepted MIME types and maximum size, then demonstrates these lifecycle states:

- idle
- uploading
- uploaded
- failed
- removing
- removed
- multiple files
- duplicate detection
- size validation
- type validation
- retry
- cancellation
- temporary upload ID

Production storage integration is intentionally out of scope. In production the plugin should use a signed upload URL or upload API, backend association with the submitted entity, antivirus scanning, file retention policies, and access-controlled downloads.

## Audit Trail Plugin

The audit plugin records meaningful form events:

- `form_opened`
- `field_changed`
- `draft_restored`
- `draft_saved`
- `validation_failed`
- `submission_attempted`
- `submission_conflict`
- `submission_succeeded`

Audit events intentionally exclude raw field values. Metadata can include form ID, form version, tenant ID, user ID, and correlation ID.

## Analytics Plugin

The analytics plugin forwards sampled events into telemetry.

Tracked event examples:

- `form_opened`
- `field_changed`
- `draft_saved`
- `draft_restored`
- `submission_started`
- `submission_failed`
- `submission_succeeded`

Privacy requirements:

- never log sensitive field values
- use correlation IDs rather than raw identifiers where possible
- keep event schemas governed and versioned
- support sampling
- avoid accidental tenant data mixing

## Example Plugin

```ts
import type { FormPlugin } from "@admiral/form-platform";

export function portSelectorPlugin(): FormPlugin {
  return {
    id: "port-selector",
    version: "1.0.0",
    minPlatformVersion: "0.1.0",
    setup({ registry }) {
      if (!registry.has("port-selector")) {
        registry.register({
          type: "port-selector",
          config: { searchable: true }
        });
      }

      return {
        onEvent(event) {
          if (event.event === "field_changed") {
            // Do not store raw field values.
          }
        }
      };
    }
  };
}
```

## Plugin Governance

Recommended production governance:

- plugin certification before use by squads
- owner and support channel for each plugin
- compatibility tests
- versioned plugin manifests
- security review for custom renderers
- schema allowlisting
- dependency allowlisting
- deprecation policy
- migration guide for breaking plugin changes
