import type { FieldDefinition, FormDefinition, FormError, FormPlatformContext, FormValues, SchemaValidationIssue, ValidationRule } from "@admiral/form-schema";
import { text } from "@admiral/form-schema";
import { flattenFields, validateDependencyGraph } from "@admiral/form-rules";

export type FieldRegistryEntry<TValue = unknown, TConfig = unknown> = {
  type: string;
  parse?: (input: unknown) => TValue;
  format?: (value: TValue) => unknown;
  validate?: ValidationRule[];
  render?: unknown;
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
  issues.push(...permissionIssues(definition.permission, "permission"));
  for (const section of definition.sections) {
    if (sectionIds.has(section.id)) issues.push({ code: "duplicate-section-id", message: `Duplicate section id "${section.id}".`, path: section.id });
    sectionIds.add(section.id);
    issues.push(...permissionIssues(section.permission, `${section.id}.permission`));
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) issues.push({ code: "duplicate-field-id", message: `Duplicate field id "${field.id}".`, path: field.id });
      fieldIds.add(field.id);
      if (!registry.has(field.type)) issues.push({ code: "unsupported-field-type", message: `Field "${field.id}" uses unsupported field type "${field.type}".`, path: field.id });
      if (field.required && field.visibility) issues.push({ code: "required-hidden-risk", message: `Field "${field.id}" is statically required and conditionally visible; prefer requiredWhen.`, path: field.id });
      issues.push(...permissionIssues(field.permission, `${field.id}.permission`));
      if ((field.type === "select" || field.type === "multi-select" || field.type === "radio") && !field.options?.length && !field.dataSource) {
        issues.push({ code: "missing-options", message: `Choice field "${field.id}" must define static options or a data source.`, path: field.id });
      }
      if (field.type === "repeating-group" && "fields" in field) {
        if (field.fields.length === 0) issues.push({ code: "empty-repeating-group", message: `Repeating group "${field.id}" must define nested fields.`, path: field.id });
        if (field.minItems !== undefined && field.minItems < 0) issues.push({ code: "invalid-repeating-min", message: `Repeating group "${field.id}" minItems cannot be negative.`, path: field.id });
        if (field.maxItems !== undefined && field.maxItems < 1) issues.push({ code: "invalid-repeating-max", message: `Repeating group "${field.id}" maxItems must be at least 1.`, path: field.id });
        if (field.minItems !== undefined && field.maxItems !== undefined && field.minItems > field.maxItems) issues.push({ code: "invalid-repeating-range", message: `Repeating group "${field.id}" minItems cannot exceed maxItems.`, path: field.id });
        const childIds = new Set<string>();
        for (const child of field.fields) {
          if (childIds.has(child.id)) issues.push({ code: "duplicate-repeating-field-id", message: `Repeating group "${field.id}" has duplicate child field "${child.id}".`, path: `${field.id}.${child.id}` });
          childIds.add(child.id);
          if (!registry.has(child.type)) issues.push({ code: "unsupported-repeating-field-type", message: `Repeating group "${field.id}" child "${child.id}" uses unsupported field type "${child.type}".`, path: `${field.id}.${child.id}` });
          issues.push(...permissionIssues(child.permission, `${field.id}.${child.id}.permission`));
        }
      }
    }
  }
  for (const step of definition.steps ?? []) {
    for (const sectionId of step.sectionIds) {
      if (!sectionIds.has(sectionId)) issues.push({ code: "unknown-step-section", message: `Step "${step.id}" references unknown section "${sectionId}".`, path: step.id });
    }
  }
  return [...issues, ...validateDependencyGraph(definition)];
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
  const fields = flattenFields(params.definition);
  for (const field of fields) {
    if (params.fieldIds && !params.fieldIds.has(field.id)) continue;
    if (!params.visible.has(field.id)) continue;
    const value = params.values[field.id];
    const required = field.required || params.required.has(field.id);
    if (isEmpty(value)) {
      if (required) errors.push(fieldError(field, text({ en: "This field is required.", fa: "این فیلد الزامی است." }, params.context.locale), "error", "schema"));
      continue;
    }
    for (const rule of field.validation ?? []) {
      try {
        const passed = await evaluateValidationRule(rule, value, params.values, params.context, params.signal, params.cache);
        if (!passed) errors.push(fieldError(field, text(rule.message, params.context.locale), rule.severity ?? "error", rule.type === "async" ? "server" : "client"));
      } catch (error) {
        if (params.signal?.aborted) return errors;
        errors.push(fieldError(field, error instanceof Error ? error.message : text(rule.message, params.context.locale), "error", "server"));
      }
    }
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
