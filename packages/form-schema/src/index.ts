export type Locale = "en" | "fa";
export type Direction = "ltr" | "rtl";
export type FieldId<TValues> = Extract<keyof TValues, string>;
export type LocalizedText = string | Partial<Record<Locale, string>>;

export type FormPlatformContext = {
  tenantId: string;
  userId: string;
  locale: Locale;
  timezone: string;
  permissions: string[];
  entityId?: string;
  reviewedConflictVersion?: number;
  correlationId: string;
};

export type PrimitiveValue = string | number | boolean | null | undefined;
export type FormValues = Record<string, unknown>;

export type RuleOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan"
  | "contains"
  | "in"
  | "isEmpty"
  | "isNotEmpty";

export type FieldCondition<TValues extends FormValues> = {
  field: FieldId<TValues>;
  operator: RuleOperator;
  value?: PrimitiveValue | PrimitiveValue[];
};

export type ConditionGroup<TValues extends FormValues> =
  | FieldCondition<TValues>
  | { all: ConditionGroup<TValues>[] }
  | { any: ConditionGroup<TValues>[] };

export type RuleEffect<TValues extends FormValues> =
  | { type: "show"; target: FieldId<TValues> }
  | { type: "hide"; target: FieldId<TValues> }
  | { type: "enable"; target: FieldId<TValues> }
  | { type: "disable"; target: FieldId<TValues> }
  | { type: "require"; target: FieldId<TValues> }
  | { type: "optional"; target: FieldId<TValues> }
  | { type: "clear"; target: FieldId<TValues> }
  | { type: "setDefault"; target: FieldId<TValues>; value: unknown }
  | { type: "warning"; target: FieldId<TValues>; message: LocalizedText }
  | { type: "options"; target: FieldId<TValues>; options: SelectOption[] };

export type ConditionalRule<TValues extends FormValues> = {
  id: string;
  priority?: number;
  when: ConditionGroup<TValues>;
  effects: RuleEffect<TValues>[];
};

export type PermissionSpec = {
  view?: string;
  edit?: string;
  action?: string;
};

export type SelectOption = {
  value: string;
  label: LocalizedText;
  disabled?: boolean;
};

export type OptionPage<TOption> = {
  items: TOption[];
  nextCursor?: string;
};

export type FormRequestContext = FormPlatformContext & {
  formId: string;
  formVersion: number;
};

export type OptionDataSource<TOption = SelectOption, TQuery = { query: string; cursor?: string; dependencies?: Record<string, unknown> }> = {
  search(query: TQuery, context: FormRequestContext, signal?: AbortSignal): Promise<OptionPage<TOption>>;
  getById?(id: string, context: FormRequestContext, signal?: AbortSignal): Promise<TOption | undefined>;
};

export type ValidationSeverity = "error" | "warning";
export type BuiltInValidationType =
  | "required"
  | "minLength"
  | "maxLength"
  | "min"
  | "max"
  | "pattern"
  | "notEqual"
  | "after"
  | "custom"
  | "async";

export type ValidationRule<TValues extends FormValues = FormValues> = {
  type: BuiltInValidationType | string;
  message: LocalizedText;
  severity?: ValidationSeverity;
  field?: FieldId<TValues>;
  value?: unknown;
  debounceMs?: number;
  retry?: number;
  validate?: (value: unknown, values: TValues, context: FormPlatformContext, signal?: AbortSignal) => boolean | Promise<boolean>;
};

export type CalculatedConfig<TValues extends FormValues, TValue> = {
  dependencies: FieldId<TValues>[];
  calculate: (values: Readonly<TValues>) => TValue;
  precision?: number;
};

export type BaseField<TValues extends FormValues, TValue = unknown, TConfig = unknown> = {
  id: FieldId<TValues>;
  type: string;
  label: LocalizedText;
  helpText?: LocalizedText;
  defaultValue?: TValue;
  required?: boolean;
  requiredWhen?: ConditionGroup<TValues>;
  visibility?: ConditionGroup<TValues>;
  enabledWhen?: ConditionGroup<TValues>;
  readOnlyWhen?: ConditionGroup<TValues>;
  permission?: PermissionSpec;
  validation?: ValidationRule<TValues>[];
  dependencies?: FieldId<TValues>[];
  dataSource?: { type: "remote"; resource: string; dependsOn?: FieldId<TValues>[] };
  options?: SelectOption[];
  config?: TConfig;
};

export type FieldDefinition<TValues extends FormValues = FormValues> =
  | (BaseField<TValues> & { type: "text" | "textarea" | "date" | "checkbox" | "file" })
  | (BaseField<TValues, number> & { type: "number" | "currency" })
  | (BaseField<TValues, string> & { type: "select" | "radio"; options?: SelectOption[] })
  | (BaseField<TValues, string[]> & { type: "multi-select"; options?: SelectOption[] })
  | (BaseField<TValues, unknown[]> & { type: "repeating-group"; fields: FieldDefinition<Record<string, unknown>>[]; minItems?: number; maxItems?: number })
  | (BaseField<TValues> & { type: "calculated"; calculated: CalculatedConfig<TValues, unknown> })
  | (BaseField<TValues> & { type: string });

export type SectionDefinition<TValues extends FormValues> = {
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  permission?: PermissionSpec;
  fields: FieldDefinition<TValues>[];
};

export type StepDefinition<TValues extends FormValues> = {
  id: string;
  title: LocalizedText;
  sectionIds: string[];
  canNavigateTo?: ConditionGroup<TValues>;
};

export type SubmissionConfig<TValues extends FormValues> = {
  endpoint?: string;
  submit: (values: TValues, context: FormPlatformContext, idempotencyKey: string) => Promise<FormSubmissionResult<TValues>>;
  checkStatus?: (idempotencyKey: string, context: FormPlatformContext) => Promise<FormSubmissionResult<TValues>>;
};

export type FormSubmissionResult<TValues extends FormValues> =
  | { status: "succeeded"; entityId: string; values?: TValues; entityVersion: number }
  | { status: "validation-failed"; errors: FormError[] }
  | { status: "conflict"; currentVersion: number; latestValues: TValues }
  | { status: "unknown"; idempotencyKey: string }
  | { status: "failed"; error: FormPlatformError };

export type FormDefinition<TValues extends FormValues> = {
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

export type FormError = {
  fieldId?: string;
  sectionId?: string;
  message: string;
  severity: ValidationSeverity;
  source: "schema" | "client" | "server" | "business";
};

export type FormPlatformError =
  | { type: "validation"; fields: Record<string, string[]> }
  | { type: "network"; retryable: boolean; message?: string }
  | { type: "authorisation"; message: string }
  | { type: "conflict"; currentVersion: number }
  | { type: "rate-limit"; retryAfterSeconds?: number }
  | { type: "timeout"; statusUnknown: boolean }
  | { type: "unknown"; message: string };

export type SchemaValidationIssue = {
  code: string;
  message: string;
  path?: string;
};

export type FieldDefinitionById<TValues extends FormValues> = Map<FieldId<TValues>, FieldDefinition<TValues>>;

export function text(value: LocalizedText, locale: Locale): string {
  if (typeof value === "string") return value;
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? "";
}
