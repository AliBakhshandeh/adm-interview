import type { FieldDefinition, FormDefinition, FormError, FormPlatformContext, FormValues, SchemaValidationIssue, ValidationRule } from "@admiral/form-schema";
import { text } from "@admiral/form-schema";
import { collectConditionReferences, evaluateCondition, flattenFields, validateDependencyGraph } from "@admiral/form-rules";

export type FieldRegistryEntry<TValue = unknown, TConfig = unknown, TRenderer = unknown> = {
  type: string;
  parse?: (input: unknown) => TValue;
  format?: (value: TValue) => unknown;
  validate?: ValidationRule[];
  render?: TRenderer;
  config?: TConfig;
};

export class FieldRegistry {
  private entries = new Map<string, FieldRegistryEntry>();

  register(entry: FieldRegistryEntry): void {
    if (this.entries.has(entry.type)) throw new Error(`Field type "${entry.type}" is already registered.`);
    this.entries.set(entry.type, entry);
  }

  configure(type: string, patch: Partial<Omit<FieldRegistryEntry, "type">>): void {
    const current = this.entries.get(type);
    if (!current) throw new Error(`Field type "${type}" is not registered.`);
    this.entries.set(type, { ...current, ...patch, type });
  }

  has(type: string): boolean {
    return this.entries.has(type);
  }

  get(type: string): FieldRegistryEntry | undefined {
    return this.entries.get(type);
  }

  list(): string[] {
    return [...this.entries.keys()].sort();
  }
}

export function createDefaultFieldRegistry(): FieldRegistry {
  const registry = new FieldRegistry();
  for (const type of ["text", "textarea", "number", "currency", "date", "select", "multi-select", "checkbox", "radio", "file", "repeating-group", "calculated"]) {
    registry.register({ type });
  }
  return registry;
}

export function validateFormDefinition<TValues extends FormValues>(
  definition: FormDefinition<TValues>,
  registry = createDefaultFieldRegistry()
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (!definition.id.trim()) issues.push({ code: "invalid-form-id", message: "Form id is required.", path: "id" });
  if (!Number.isInteger(definition.version) || definition.version < 1) issues.push({ code: "invalid-version", message: "Form version must be a positive integer.", path: "version" });

  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();
  const topLevelFieldIds = new Set(definition.sections.flatMap((section) => section.fields.map((field) => field.id)));
  issues.push(...permissionIssues(definition.permission, "permission"));
  for (const section of definition.sections) {
    if (sectionIds.has(section.id)) issues.push({ code: "duplicate-section-id", message: `Duplicate section id "${section.id}".`, path: section.id });
    sectionIds.add(section.id);
    issues.push(...permissionIssues(section.permission, `${section.id}.permission`));
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) issues.push({ code: "duplicate-field-id", message: `Duplicate field id "${field.id}".`, path: field.id });
      fieldIds.add(field.id);
      issues.push(...fieldDefinitionIssues(field, field.id, registry, topLevelFieldIds));
      if (field.type === "repeating-group" && "fields" in field) {
        if (field.fields.length === 0) issues.push({ code: "empty-repeating-group", message: `Repeating group "${field.id}" must define nested fields.`, path: field.id });
        if (field.minItems !== undefined && field.minItems < 0) issues.push({ code: "invalid-repeating-min", message: `Repeating group "${field.id}" minItems cannot be negative.`, path: field.id });
        if (field.maxItems !== undefined && field.maxItems < 1) issues.push({ code: "invalid-repeating-max", message: `Repeating group "${field.id}" maxItems must be at least 1.`, path: field.id });
        if (field.minItems !== undefined && field.maxItems !== undefined && field.minItems > field.maxItems) issues.push({ code: "invalid-repeating-range", message: `Repeating group "${field.id}" minItems cannot exceed maxItems.`, path: field.id });
        const childIds = new Set<string>();
        const childFieldIds = new Set(field.fields.map((child) => child.id));
        for (const child of field.fields) {
          if (childIds.has(child.id)) issues.push({ code: "duplicate-repeating-field-id", message: `Repeating group "${field.id}" has duplicate child field "${child.id}".`, path: `${field.id}.${child.id}` });
          childIds.add(child.id);
          issues.push(...fieldDefinitionIssues(child, `${field.id}.${child.id}`, registry, childFieldIds, true));
        }
      }
    }
  }
  for (const [index, rule] of (definition.formValidation ?? []).entries()) {
    issues.push(...validationRuleIssues(rule, `formValidation[${index}]`, topLevelFieldIds));
  }
  for (const step of definition.steps ?? []) {
    for (const sectionId of step.sectionIds) {
      if (!sectionIds.has(sectionId)) issues.push({ code: "unknown-step-section", message: `Step "${step.id}" references unknown section "${sectionId}".`, path: step.id });
    }
  }
  return [...issues, ...validateDependencyGraph(definition)];
}

function fieldDefinitionIssues<TValues extends FormValues>(field: FieldDefinition<TValues>, path: string, registry: FieldRegistry, knownFieldIds: Set<string>, repeatingChild = false): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (!registry.has(field.type)) issues.push({ code: repeatingChild ? "unsupported-repeating-field-type" : "unsupported-field-type", message: `Field "${field.id}" uses unsupported field type "${field.type}".`, path });
  if (field.required && field.visibility) issues.push({ code: "required-hidden-risk", message: `Field "${field.id}" is statically required and conditionally visible; prefer requiredWhen.`, path });
  issues.push(...permissionIssues(field.permission, `${path}.permission`));
  if ((field.type === "select" || field.type === "multi-select" || field.type === "radio") && !field.options?.length && !field.dataSource) {
    issues.push({ code: "missing-options", message: `Choice field "${field.id}" must define static options or a data source.`, path });
  }
  for (const ref of [
    ...collectConditionReferences(field.visibility),
    ...collectConditionReferences(field.enabledWhen),
    ...collectConditionReferences(field.readOnlyWhen),
    ...collectConditionReferences(field.requiredWhen),
    ...(field.dataSource?.dependsOn ?? [])
  ]) {
    if (!knownFieldIds.has(ref)) issues.push({ code: repeatingChild ? "unknown-repeating-field-reference" : "unknown-field-reference", message: `Field "${field.id}" references unknown field "${ref}".`, path });
  }
  for (const [index, rule] of (field.validation ?? []).entries()) {
    issues.push(...validationRuleIssues(rule, `${path}.validation[${index}]`, knownFieldIds));
  }
  return issues;
}

function validationRuleIssues<TValues extends FormValues>(rule: ValidationRule<TValues>, path: string, knownFieldIds: Set<string>): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (rule.debounceMs !== undefined && (!Number.isFinite(rule.debounceMs) || rule.debounceMs < 0)) issues.push({ code: "invalid-validation-debounce", message: "Validation debounceMs must be a non-negative number.", path });
  if (rule.retry !== undefined && (!Number.isInteger(rule.retry) || rule.retry < 0)) issues.push({ code: "invalid-validation-retry", message: "Validation retry must be a non-negative integer.", path });
  switch (rule.type) {
    case "required":
      break;
    case "minLength":
    case "maxLength":
      if (!Number.isInteger(rule.value) || Number(rule.value) < 0) issues.push({ code: "invalid-validation-value", message: `Validation "${rule.type}" requires a non-negative integer value.`, path });
      break;
    case "min":
    case "max":
      if (typeof rule.value !== "number" || !Number.isFinite(rule.value)) issues.push({ code: "invalid-validation-value", message: `Validation "${rule.type}" requires a finite numeric value.`, path });
      break;
    case "pattern":
      if (typeof rule.value !== "string") {
        issues.push({ code: "invalid-validation-value", message: "Pattern validation requires a string pattern.", path });
      } else {
        try {
          new RegExp(rule.value);
        } catch {
          issues.push({ code: "invalid-validation-pattern", message: "Pattern validation contains an invalid regular expression.", path });
        }
      }
      break;
    case "notEqual":
    case "after":
      if (!rule.field || !knownFieldIds.has(String(rule.field))) issues.push({ code: "invalid-validation-field", message: `Validation "${rule.type}" requires an existing comparison field.`, path });
      break;
    case "custom":
    case "async":
      if (!rule.validate) issues.push({ code: "missing-validation-function", message: `Validation "${rule.type}" requires a validate function.`, path });
      break;
    default:
      if (!rule.validate) issues.push({ code: "unknown-validation-type", message: `Validation "${rule.type}" must provide a validate function.`, path });
      break;
  }
  return issues;
}

export async function validateValues<TValues extends FormValues>(params: {
  definition: FormDefinition<TValues>;
  values: TValues;
  context: FormPlatformContext;
  visible: Set<string>;
  required: Set<string>;
  fieldIds?: Set<string>;
  cache?: Map<string, boolean>;
  signal?: AbortSignal;
}): Promise<FormError[]> {
  const errors: FormError[] = [];
  for (const field of topLevelFields(params.definition)) {
    if (params.fieldIds && !params.fieldIds.has(field.id)) continue;
    if (!params.visible.has(field.id)) continue;
    const value = params.values[field.id];
    if (field.type === "repeating-group" && "fields" in field) {
      errors.push(...await validateRepeatingField(field as FieldDefinition<FormValues>, value, params));
      continue;
    }
    errors.push(...await validateFieldValue(field, value, params.values, params.context, field.required || params.required.has(field.id), params.signal, params.cache));
  }
  for (const rule of params.definition.formValidation ?? []) {
    try {
      const passed = await evaluateValidationRule(rule, undefined, params.values, params.context, params.signal, params.cache);
      if (!passed) errors.push({ message: text(rule.message, params.context.locale), severity: rule.severity ?? "error", source: "business" });
    } catch (error) {
      if (params.signal?.aborted) return errors;
      errors.push({ message: error instanceof Error ? error.message : text(rule.message, params.context.locale), severity: "error", source: "business" });
    }
  }
  return errors;
}

function topLevelFields<TValues extends FormValues>(definition: FormDefinition<TValues>): FieldDefinition<TValues>[] {
  return definition.sections.flatMap((section) => section.fields);
}

async function validateRepeatingField(field: FieldDefinition<FormValues>, value: unknown, params: {
  values: FormValues;
  context: FormPlatformContext;
  required: Set<string>;
  cache?: Map<string, boolean>;
  signal?: AbortSignal;
}): Promise<FormError[]> {
  if (field.type !== "repeating-group" || !("fields" in field)) return [];
  const errors: FormError[] = [];
  const items = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  if ((field.required || params.required.has(field.id) || (field.minItems ?? 0) > 0) && items.length === 0) {
    errors.push(fieldError(field, text({ en: "At least one item is required.", fa: "حداقل یک مورد الزامی است." }, params.context.locale), "error", "schema"));
  }
  if (field.minItems !== undefined && items.length < field.minItems) {
    errors.push(fieldError(field, text({ en: `Add at least ${field.minItems} items.`, fa: `حداقل ${field.minItems} مورد اضافه کنید.` }, params.context.locale), "error", "schema"));
  }
  if (field.maxItems !== undefined && items.length > field.maxItems) {
    errors.push(fieldError(field, text({ en: `Remove items until only ${field.maxItems} remain.`, fa: `تعداد موارد را به ${field.maxItems} کاهش دهید.` }, params.context.locale), "error", "schema"));
  }
  for (const [index, item] of items.entries()) {
    const itemValues = item as FormValues;
    for (const child of field.fields) {
      if (child.visibility && !evaluateCondition(child.visibility, itemValues)) continue;
      const required = Boolean(child.required || (child.requiredWhen && evaluateCondition(child.requiredWhen, itemValues)));
      if (child.type === "repeating-group" && "fields" in child) {
        const childErrors = await validateRepeatingField(child, item[child.id], params);
        errors.push(...childErrors.map((error) => ({ ...error, fieldId: repeatingPath(field.id, index, error.fieldId ?? child.id) })));
        continue;
      }
      const childErrors = await validateFieldValue(child, item[child.id], itemValues, params.context, required, params.signal, params.cache);
      errors.push(...childErrors.map((error) => ({ ...error, fieldId: repeatingPath(field.id, index, child.id) })));
    }
  }
  return errors;
}

async function validateFieldValue<TValues extends FormValues>(
  field: FieldDefinition<TValues>,
  value: unknown,
  values: TValues,
  context: FormPlatformContext,
  required: boolean,
  signal?: AbortSignal,
  cache?: Map<string, boolean>
): Promise<FormError[]> {
  const errors: FormError[] = [];
  if (isEmpty(value)) {
    if (required) errors.push(fieldError(field, text({ en: "This field is required.", fa: "این فیلد الزامی است." }, context.locale), "error", "schema"));
    return errors;
  }
  for (const rule of field.validation ?? []) {
    try {
      const passed = await evaluateValidationRule(rule, value, values, context, signal, cache);
      if (!passed) errors.push(fieldError(field, text(rule.message, context.locale), rule.severity ?? "error", rule.type === "async" ? "server" : "client"));
    } catch (error) {
      if (signal?.aborted) return errors;
      errors.push(fieldError(field, error instanceof Error ? error.message : text(rule.message, context.locale), "error", "server"));
    }
  }
  return errors;
}

function repeatingPath(fieldId: string, itemIndex: number, childId: string): string {
  return `${fieldId}[${itemIndex}].${childId}`;
}

function permissionIssues(permission: unknown, path: string): SchemaValidationIssue[] {
  if (permission === undefined) return [];
  if (typeof permission !== "object" || permission === null) return [{ code: "invalid-permission", message: "Permission must be an object.", path }];
  const issues: SchemaValidationIssue[] = [];
  for (const key of ["view", "edit", "action"] as const) {
    const value = (permission as Record<string, unknown>)[key];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) issues.push({ code: "invalid-permission-value", message: `Permission "${key}" must be a non-empty string.`, path: `${path}.${key}` });
  }
  return issues;
}

function fieldError<TValues extends FormValues>(field: FieldDefinition<TValues>, message: string, severity: "error" | "warning", source: FormError["source"]): FormError {
  return { fieldId: field.id, message, severity, source };
}

async function evaluateValidationRule<TValues extends FormValues>(
  rule: ValidationRule<TValues>,
  value: unknown,
  values: TValues,
  context: FormPlatformContext,
  signal?: AbortSignal,
  cache?: Map<string, boolean>
): Promise<boolean> {
  if (rule.validate) {
    const cacheKey = JSON.stringify({ type: rule.type, field: rule.field, value, tenantId: context.tenantId, userId: context.userId });
    const cached = cache?.get(cacheKey);
    if (cached !== undefined) return cached;
    if (rule.debounceMs) await delay(rule.debounceMs, signal);
    const attempts = Math.max(1, (rule.retry ?? 0) + 1);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await rule.validate(value, values, context, signal);
        cache?.set(cacheKey, result);
        return result;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
      }
    }
    throw lastError;
  }
  switch (rule.type) {
    case "minLength":
      return String(value ?? "").length >= Number(rule.value);
    case "maxLength":
      return String(value ?? "").length <= Number(rule.value);
    case "min":
      return Number(value) >= Number(rule.value);
    case "max":
      return Number(value) <= Number(rule.value);
    case "pattern":
      return new RegExp(String(rule.value)).test(String(value ?? ""));
    case "notEqual":
      return value !== values[String(rule.field)];
    case "after":
      return new Date(String(value)).getTime() > new Date(String(values[String(rule.field)])).getTime();
    default:
      return true;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Validation aborted", "AbortError"));
    }, { once: true });
  });
}

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function debouncePromise<TArgs extends unknown[], TResult>(
  fn: (...args: [...TArgs, AbortSignal?]) => Promise<TResult>,
  delayMs: number
): (...args: TArgs) => { promise: Promise<TResult>; cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  return (...args: TArgs) => {
    if (timeout) clearTimeout(timeout);
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const promise = new Promise<TResult>((resolve, reject) => {
      timeout = setTimeout(() => {
        fn(...args, activeController.signal).then(resolve, reject);
      }, delayMs);
    });
    return {
      promise,
      cancel: () => {
        activeController.abort();
        if (timeout) clearTimeout(timeout);
      }
    };
  };
}
