# Schema Reference

This document describes the public metadata contracts used by product teams.

## FormDefinition

```ts
type FormDefinition<TValues> = {
  id: string;
  version: number;
  title: LocalizedText;
  description?: LocalizedText;
  sections: SectionDefinition<TValues>[];
  steps?: StepDefinition<TValues>[];
  rules?: ConditionalRule<TValues>[];
  formValidation?: ValidationRule<TValues>[];
  permission?: PermissionSpec;
  submission?: SubmissionConfig<TValues>;
  migrations?: Record<number, (value: FormValues) => FormValues>;
};
```

### Required Fields

- `id`: stable form identifier.
- `version`: positive integer schema version.
- `title`: localized or plain title.
- `sections`: field groups rendered by the React adapter.

### Optional Fields

- `steps`: wizard workflow definition.
- `rules`: declarative rule set.
- `formValidation`: business-level validation.
- `permission`: form-level permission.
- `submission`: submission adapter and status checker.
- `migrations`: draft migration functions by source version.

## LocalizedText

```ts
type LocalizedText = string | Partial<Record<"en" | "fa", string>>;
```

Use localized text for labels, help text, validation messages, section titles, and form titles.

## FieldDefinition

Supported built-in types:

- `text`
- `textarea`
- `number`
- `currency`
- `date`
- `select`
- `multi-select`
- `checkbox`
- `radio`
- `file`
- `repeating-group`
- `calculated`

Common field properties:

```ts
type BaseField<TValues> = {
  id: keyof TValues & string;
  type: string;
  label: LocalizedText;
  helpText?: LocalizedText;
  defaultValue?: unknown;
  required?: boolean;
  requiredWhen?: ConditionGroup<TValues>;
  visibility?: ConditionGroup<TValues>;
  enabledWhen?: ConditionGroup<TValues>;
  readOnlyWhen?: ConditionGroup<TValues>;
  permission?: PermissionSpec;
  validation?: ValidationRule<TValues>[];
  dependencies?: (keyof TValues & string)[];
  dataSource?: {
    type: "remote";
    resource: string;
    dependsOn?: (keyof TValues & string)[];
  };
  options?: SelectOption[];
  config?: unknown;
};
```

## Conditions

Supported operators:

- `equals`
- `notEquals`
- `greaterThan`
- `lessThan`
- `contains`
- `in`
- `isEmpty`
- `isNotEmpty`

Conditions can be single-field checks or nested groups:

```ts
{
  all: [
    { field: "cargoType", operator: "equals", value: "refrigerated" },
    { field: "targetTemperature", operator: "lessThan", value: 0 }
  ]
}
```

## Rule Effects

Supported effects:

- `show`
- `hide`
- `enable`
- `disable`
- `require`
- `optional`
- `clear`
- `setDefault`
- `warning`
- `options`

Rules are sorted by `priority`, then by `id`, which makes evaluation deterministic.

## ValidationRule

```ts
type ValidationRule<TValues> = {
  type: string;
  message: LocalizedText;
  severity?: "error" | "warning";
  field?: keyof TValues & string;
  value?: unknown;
  debounceMs?: number;
  retry?: number;
  validate?: (
    value: unknown,
    values: TValues,
    context: FormPlatformContext,
    signal?: AbortSignal
  ) => boolean | Promise<boolean>;
};
```

Built-in validation types:

- `required`
- `minLength`
- `maxLength`
- `min`
- `max`
- `pattern`
- `notEqual`
- `after`
- `custom`
- `async`

## FormPlatformContext

```ts
type FormPlatformContext = {
  tenantId: string;
  userId: string;
  locale: "en" | "fa";
  timezone: string;
  permissions: string[];
  entityId?: string;
  reviewedConflictVersion?: number;
  correlationId: string;
};
```

The context is passed to validation, data sources, telemetry, submission, draft keys, and permissions.

## Schema Validation

The platform rejects invalid definitions before rendering. It detects:

- invalid form ID
- invalid version
- duplicate section IDs
- duplicate field IDs
- unsupported field types
- unknown step sections
- unknown field references
- unknown rule references
- unknown rule effect targets
- direct or indirect circular dependencies
- statically required fields with conditional visibility risk
