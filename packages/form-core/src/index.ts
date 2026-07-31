import type { FieldDefinition, FormDefinition, FormError, FormPlatformContext, FormPlatformError, FormSubmissionResult, FormValues, OptionDataSource, SelectOption } from "@admiral/form-schema";
import type { FormPlatformTelemetry } from "@admiral/telemetry";
import { noopTelemetry } from "@admiral/telemetry";
import { affectedFields, buildDependencyGraph, evaluateCondition, evaluateRules, flattenFields, type DependencyGraph, type RuleEvaluationHistory } from "@admiral/form-rules";
import { createDefaultFieldRegistry, FieldRegistry, validateFormDefinition, validateValues } from "@admiral/form-validation";

export type FormSubmissionState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "submitting" }
  | { status: "succeeded"; entityId: string }
  | { status: "validation-failed"; errors: FormError[] }
  | { status: "conflict"; currentVersion: number; latestValues: FormValues; changedFields: string[] }
  | { status: "unknown"; idempotencyKey: string; checking: boolean }
  | { status: "failed"; error: FormPlatformError };

export type DraftState =
  | { status: "idle"; key: string }
  | { status: "saving"; key: string }
  | { status: "saved"; key: string; savedAt: string }
  | { status: "failed"; key: string; error: string }
  | { status: "restored"; key: string; restoredAt: string }
  | { status: "expired"; key: string };

export type FormState<TValues extends FormValues> = {
  values: TValues;
  initialValues: TValues;
  baseValues: TValues;
  dirtyFields: Set<string>;
  touchedFields: Set<string>;
  errors: FormError[];
  warnings: Map<string, string[]>;
  pendingAsyncValidations: Set<string>;
  visibleFields: Set<string>;
  enabledFields: Set<string>;
  readOnlyFields: Set<string>;
  requiredFields: Set<string>;
  submission: FormSubmissionState;
  draft: DraftState;
  currentStep: number;
  formVersion: number;
  ruleHistory: RuleEvaluationHistory[];
  remoteOptions: Map<string, RemoteOptionsState>;
};

export type RemoteOptionsState =
  | { status: "idle"; options: SelectOption[] }
  | { status: "loading"; options: SelectOption[] }
  | { status: "loaded"; options: SelectOption[]; nextCursor?: string }
  | { status: "empty"; options: [] }
  | { status: "failed"; options: SelectOption[]; error: string };

export type DraftRecord<TValues extends FormValues> = {
  values: TValues;
  formVersion: number;
  savedAt: string;
  expiresAt: string;
};

export interface DraftAdapter {
  load<TValues extends FormValues>(key: string): Promise<DraftRecord<TValues> | undefined>;
  save<TValues extends FormValues>(key: string, record: DraftRecord<TValues>): Promise<void>;
  discard(key: string): Promise<void>;
}

export class LocalStorageDraftAdapter implements DraftAdapter {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = globalThis.localStorage) {}

  async load<TValues extends FormValues>(key: string): Promise<DraftRecord<TValues> | undefined> {
    const raw = this.storage.getItem(key);
    return raw ? (JSON.parse(raw) as DraftRecord<TValues>) : undefined;
  }

  async save<TValues extends FormValues>(key: string, record: DraftRecord<TValues>): Promise<void> {
    this.storage.setItem(key, JSON.stringify(record));
  }

  async discard(key: string): Promise<void> {
    this.storage.removeItem(key);
  }
}

export class MemoryDraftAdapter implements DraftAdapter {
  private records = new Map<string, DraftRecord<FormValues>>();
  async load<TValues extends FormValues>(key: string): Promise<DraftRecord<TValues> | undefined> {
    return this.records.get(key) as DraftRecord<TValues> | undefined;
  }
  async save<TValues extends FormValues>(key: string, record: DraftRecord<TValues>): Promise<void> {
    this.records.set(key, record);
  }
  async discard(key: string): Promise<void> {
    this.records.delete(key);
  }
}

export type FormAuditEvent = {
  event: string;
  fieldId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type FormPluginContext = {
  registry: FieldRegistry;
  telemetry: FormPlatformTelemetry;
  context: FormPlatformContext;
  platformVersion: string;
  formVersion: number;
};

export type FormPluginContribution = {
  draftAdapter?: DraftAdapter;
  auditEvents?: FormAuditEvent[];
  onEvent?: (event: FormAuditEvent) => void;
  cleanup?: () => void;
};

export type FormPlugin = {
  id: string;
  version: string;
  dependsOn?: string[];
  compatibleFormVersions?: number[];
  minPlatformVersion?: string;
  setup(context: FormPluginContext): FormPluginContribution;
};

const PLATFORM_VERSION = "0.1.0";

export class PluginRegistry {
  private contributions: FormPluginContribution[] = [];
  private ids = new Set<string>();

  register(plugin: FormPlugin, context: FormPluginContext): void {
    if (this.ids.has(plugin.id)) throw new Error(`Plugin "${plugin.id}" is already registered.`);
    for (const dependency of plugin.dependsOn ?? []) {
      if (!this.ids.has(dependency)) throw new Error(`Plugin "${plugin.id}" requires missing dependency "${dependency}".`);
    }
    if (plugin.compatibleFormVersions && !plugin.compatibleFormVersions.includes(context.formVersion)) {
      throw new Error(`Plugin "${plugin.id}" is not compatible with form version ${context.formVersion}.`);
    }
    if (plugin.minPlatformVersion && compareVersions(context.platformVersion, plugin.minPlatformVersion) < 0) {
      throw new Error(`Plugin "${plugin.id}" requires platform version ${plugin.minPlatformVersion} or newer.`);
    }
    try {
      this.contributions.push(plugin.setup(context));
      this.ids.add(plugin.id);
    } catch (error) {
      context.telemetry.track("plugin_failed", { pluginId: plugin.id });
      context.telemetry.captureError(error, { pluginId: plugin.id });
    }
  }

  emit(event: FormAuditEvent): void {
    for (const contribution of this.contributions) contribution.onEvent?.(event);
  }

  cleanup(): void {
    for (const contribution of this.contributions) contribution.cleanup?.();
  }
}

export type FormEngineOptions<TValues extends FormValues> = {
  definition: FormDefinition<TValues>;
  initialValues: TValues;
  baseValues?: TValues;
  context: FormPlatformContext;
  registry?: FieldRegistry;
  draftAdapter?: DraftAdapter;
  telemetry?: FormPlatformTelemetry;
  plugins?: FormPlugin[];
  dataSources?: Record<string, OptionDataSource<SelectOption>>;
  draftTtlDays?: number;
  stateOverrides?: Partial<FormState<TValues>>;
};

export class FormEngine<TValues extends FormValues> {
  readonly registry: FieldRegistry;
  readonly graph: DependencyGraph;
  readonly plugins = new PluginRegistry();
  private readonly listeners = new Set<() => void>();
  private readonly fieldListeners = new Map<string, Set<() => void>>();
  private readonly optionControllers = new Map<string, AbortController>();
  private readonly optionCache = new Map<string, { options: SelectOption[]; nextCursor?: string }>();
  private readonly validationCache = new Map<string, boolean>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private validationController: AbortController | undefined;
  private reviewedConflictVersion: number | undefined;
  state: FormState<TValues>;

  constructor(public readonly options: FormEngineOptions<TValues>) {
    this.registry = options.registry ?? createDefaultFieldRegistry();
    const issues = validateFormDefinition(options.definition, this.registry);
    if (issues.length > 0) {
      options.telemetry?.track("form_schema_invalid", { formId: options.definition.id, issueCount: issues.length });
      throw new Error(issues.map((issue) => issue.message).join("\n"));
    }
    this.graph = buildDependencyGraph(options.definition);
    const rules = evaluateRules(options.definition, options.initialValues, undefined, options.context.locale);
    for (const field of flattenFields(options.definition)) {
      if (!canView(field.permission?.view, options.context)) rules.visible.delete(field.id);
      if (!canEdit(field, options.context)) rules.readOnly.add(field.id);
    }
    const key = createDraftKey(options.context, options.definition.id, options.context.entityId ?? "new", options.definition.version);
    this.state = {
      values: { ...options.initialValues },
      initialValues: { ...options.initialValues },
      baseValues: { ...(options.baseValues ?? options.initialValues) },
      dirtyFields: new Set(),
      touchedFields: new Set(),
      errors: [],
      warnings: rules.warnings,
      pendingAsyncValidations: new Set(),
      visibleFields: rules.visible,
      enabledFields: rules.enabled,
      readOnlyFields: rules.readOnly,
      requiredFields: rules.required,
      submission: { status: "idle" },
      draft: { status: "idle", key },
      currentStep: 0,
      formVersion: options.definition.version,
      ruleHistory: rules.history,
      remoteOptions: new Map()
    };
    if (options.stateOverrides) this.state = { ...this.state, ...options.stateOverrides };
    for (const plugin of options.plugins ?? []) {
      this.plugins.register(plugin, { registry: this.registry, telemetry: this.telemetry, context: options.context, platformVersion: PLATFORM_VERSION, formVersion: options.definition.version });
    }
    this.telemetry.track("form_opened", this.eventAttributes());
    this.emitPluginEvent("form_opened");
  }

  get telemetry(): FormPlatformTelemetry {
    return this.options.telemetry ?? noopTelemetry;
  }

  get draftAdapter(): DraftAdapter {
    return this.options.draftAdapter ?? new MemoryDraftAdapter();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeField(fieldId: string, listener: () => void): () => void {
    const listeners = this.fieldListeners.get(fieldId) ?? new Set();
    listeners.add(listener);
    this.fieldListeners.set(fieldId, listeners);
    return () => listeners.delete(listener);
  }

  setValue(fieldId: keyof TValues & string, value: TValues[typeof fieldId]): void {
    if (!this.state.enabledFields.has(fieldId) || this.state.readOnlyFields.has(fieldId)) return;
    this.state.values = { ...this.state.values, [fieldId]: value };
    this.state.dirtyFields.add(fieldId);
    this.state.touchedFields.add(fieldId);
    this.applyCalculatedFields(fieldId);
    this.recalculate(fieldId);
    this.telemetry.track("field_changed", { ...this.eventAttributes(), fieldId });
    this.emitPluginEvent("field_changed", fieldId);
    this.scheduleDraftSave();
    this.notify(fieldId);
  }

  addRepeatingItem(fieldId: keyof TValues & string, item: Record<string, unknown>): void {
    const current = Array.isArray(this.state.values[fieldId]) ? (this.state.values[fieldId] as unknown[]) : [];
    this.setValue(fieldId, [...current, { id: crypto.randomUUID(), ...item }] as TValues[typeof fieldId]);
  }

  removeRepeatingItem(fieldId: keyof TValues & string, itemId: string): void {
    const current = Array.isArray(this.state.values[fieldId]) ? (this.state.values[fieldId] as Array<Record<string, unknown>>) : [];
    this.setValue(fieldId, current.filter((item) => item.id !== itemId) as TValues[typeof fieldId]);
  }

  moveRepeatingItem(fieldId: keyof TValues & string, itemId: string, direction: -1 | 1): void {
    const current = Array.isArray(this.state.values[fieldId]) ? [...(this.state.values[fieldId] as Array<Record<string, unknown>>)] : [];
    const index = current.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const [item] = current.splice(index, 1);
    current.splice(target, 0, item!);
    this.setValue(fieldId, current as TValues[typeof fieldId]);
  }

  async loadRemoteOptions(field: FieldDefinition<TValues>, query = "", cursor?: string): Promise<RemoteOptionsState> {
    if (!field.dataSource) return { status: "loaded", options: field.options ?? [] };
    const dataSource = this.options.dataSources?.[field.dataSource.resource];
    if (!dataSource) {
      const failed: RemoteOptionsState = { status: "failed", options: field.options ?? [], error: `Missing data source "${field.dataSource.resource}".` };
      this.state.remoteOptions = new Map(this.state.remoteOptions).set(field.id, failed);
      this.notify(field.id);
      return failed;
    }

    const dependencyValues = Object.fromEntries((field.dataSource.dependsOn ?? []).map((dependency) => [dependency, this.state.values[dependency]]));
    const cacheKey = JSON.stringify({ tenantId: this.options.context.tenantId, resource: field.dataSource.resource, query, cursor, dependencyValues });
    const cached = this.optionCache.get(cacheKey);
    if (cached) {
      const loaded: RemoteOptionsState = cached.options.length ? remoteLoaded(cached.options, cached.nextCursor) : { status: "empty", options: [] };
      this.state.remoteOptions = new Map(this.state.remoteOptions).set(field.id, loaded);
      this.notify(field.id);
      return loaded;
    }

    this.optionControllers.get(field.id)?.abort();
    const controller = new AbortController();
    this.optionControllers.set(field.id, controller);
    const previous = this.state.remoteOptions.get(field.id)?.options ?? field.options ?? [];
    this.state.remoteOptions = new Map(this.state.remoteOptions).set(field.id, { status: "loading", options: previous });
    this.notify(field.id);

    try {
      const optionQuery = { query, ...(cursor ? { cursor } : {}), dependencies: dependencyValues };
      const page = await dataSource.search(optionQuery, {
        ...this.options.context,
        formId: this.options.definition.id,
        formVersion: this.options.definition.version
      }, controller.signal);
      if (controller.signal.aborted) return this.state.remoteOptions.get(field.id) ?? { status: "idle", options: [] };
      const combined = cursor ? [...previous, ...page.items] : page.items;
      this.optionCache.set(cacheKey, { options: combined, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) });
      const loaded: RemoteOptionsState = combined.length ? remoteLoaded(combined, page.nextCursor) : { status: "empty", options: [] };
      this.state.remoteOptions = new Map(this.state.remoteOptions).set(field.id, loaded);
      this.notify(field.id);
      return loaded;
    } catch (error) {
      if (controller.signal.aborted) return this.state.remoteOptions.get(field.id) ?? { status: "idle", options: [] };
      const failed: RemoteOptionsState = { status: "failed", options: previous, error: error instanceof Error ? error.message : "Failed to load options." };
      this.state.remoteOptions = new Map(this.state.remoteOptions).set(field.id, failed);
      this.telemetry.captureError(error, { ...this.eventAttributes(), fieldId: field.id, resource: field.dataSource.resource });
      this.notify(field.id);
      return failed;
    }
  }

  async validate(): Promise<FormError[]> {
    return this.validateFields();
  }

  async validateStep(step = this.state.currentStep): Promise<FormError[]> {
    return this.validateFields(this.fieldIdsForStep(step));
  }

  getStepStatuses(): Array<{ index: number; id: string; hasError: boolean; completed: boolean; canNavigate: boolean }> {
    const steps = this.steps();
    return steps.map((step, index) => {
      const fieldIds = this.fieldIdsForStep(index);
      const visibleFieldIds = [...fieldIds].filter((fieldId) => this.state.visibleFields.has(fieldId));
      const hasError = this.state.errors.some((error) => error.fieldId && fieldIds.has(error.fieldId) && error.severity === "error");
      const completed = visibleFieldIds.length > 0 && visibleFieldIds.every((fieldId) => {
        if (!this.state.requiredFields.has(fieldId)) return this.state.touchedFields.has(fieldId) || this.state.dirtyFields.has(fieldId) || !isEmptyValue(this.state.values[fieldId]);
        return !isEmptyValue(this.state.values[fieldId]) && !hasError;
      });
      const canNavigate = index <= this.state.currentStep || !step.canNavigateTo || evaluateCondition(step.canNavigateTo, this.state.values);
      return { index, id: step.id, hasError, completed, canNavigate };
    });
  }

  private async validateFields(fieldIds?: Set<string>): Promise<FormError[]> {
    this.validationController?.abort();
    this.validationController = new AbortController();
    this.state.submission = { status: "validating" };
    this.state.pendingAsyncValidations = new Set(flattenFields(this.options.definition).filter((field) => (!fieldIds || fieldIds.has(field.id)) && this.state.visibleFields.has(field.id) && field.validation?.some((rule) => rule.type === "async" || rule.validate)).map((field) => field.id));
    this.telemetry.track("validation_started", this.eventAttributes());
    this.notify();
    const errors = await validateValues({
      definition: this.options.definition,
      values: this.state.values,
      context: this.options.context,
      visible: this.state.visibleFields,
      required: this.state.requiredFields,
      ...(fieldIds ? { fieldIds } : {}),
      cache: this.validationCache,
      signal: this.validationController.signal
    });
    this.state.pendingAsyncValidations = new Set();
    this.state.errors = fieldIds ? [...this.state.errors.filter((error) => !error.fieldId || !fieldIds.has(error.fieldId)), ...errors] : errors;
    if (errors.some((error) => error.severity === "error")) this.telemetry.track("validation_failed", { ...this.eventAttributes(), count: errors.length });
    this.state.submission = this.state.errors.some((error) => error.severity === "error") ? { status: "validation-failed", errors: this.state.errors } : { status: "idle" };
    this.notify();
    return errors;
  }

  async submit(): Promise<FormSubmissionState> {
    if (this.state.submission.status === "unknown" || this.state.submission.status === "submitting") return this.state.submission;
    const errors = await this.validate();
    if (errors.some((error) => error.severity === "error")) return this.state.submission;
    if (!this.options.definition.submission) {
      this.state.submission = { status: "succeeded", entityId: this.options.context.entityId ?? "demo-entity" };
      this.notify();
      return this.state.submission;
    }
    const idempotencyKey = crypto.randomUUID();
    this.state.submission = { status: "submitting" };
    this.telemetry.track("submission_started", this.eventAttributes());
    this.emitPluginEvent("submission_attempted");
    this.notify();
    const result = await this.options.definition.submission.submit(this.state.values, this.submissionContext(), idempotencyKey);
    this.applySubmissionResult(result, idempotencyKey);
    this.notify();
    return this.state.submission;
  }

  async restoreDraft(): Promise<boolean> {
    const draft = await this.draftAdapter.load<TValues>(this.state.draft.key);
    if (!draft) return false;
    if (new Date(draft.expiresAt).getTime() < Date.now()) {
      this.state.draft = { status: "expired", key: this.state.draft.key };
      return false;
    }
    const migrated = migrateDraft(this.options.definition, draft.values, draft.formVersion);
    this.state.values = migrated as TValues;
    this.recalculate();
    this.state.draft = { status: "restored", key: this.state.draft.key, restoredAt: new Date().toISOString() };
    this.telemetry.track("draft_restored", this.eventAttributes());
    this.emitPluginEvent("draft_restored");
    this.notify();
    return true;
  }

  async saveDraft(): Promise<void> {
    const key = this.state.draft.key;
    this.state.draft = { status: "saving", key };
    this.notify();
    try {
      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + (this.options.draftTtlDays ?? 14));
      await this.draftAdapter.save(key, { values: this.state.values, formVersion: this.options.definition.version, savedAt: now.toISOString(), expiresAt: expires.toISOString() });
      this.state.draft = { status: "saved", key, savedAt: now.toISOString() };
      this.telemetry.track("draft_saved", this.eventAttributes());
      this.emitPluginEvent("draft_saved");
    } catch (error) {
      this.state.draft = { status: "failed", key, error: error instanceof Error ? error.message : "Draft save failed" };
      this.telemetry.track("draft_save_failed", this.eventAttributes());
    }
    this.notify();
  }

  async discardDraft(): Promise<void> {
    await this.draftAdapter.discard(this.state.draft.key);
    this.state.draft = { status: "idle", key: this.state.draft.key };
    this.notify();
  }

  reviewConflict(): void {
    if (this.state.submission.status !== "conflict") return;
    this.reviewedConflictVersion = this.state.submission.currentVersion;
    this.state.baseValues = this.state.submission.latestValues as TValues;
    this.state.submission = { status: "idle" };
    this.telemetry.track("submission_conflict_reviewed", { ...this.eventAttributes(), reviewedConflictVersion: this.reviewedConflictVersion });
    this.notify();
  }

  async checkUnknownSubmission(): Promise<FormSubmissionState> {
    if (this.state.submission.status !== "unknown" || this.state.submission.checking) return this.state.submission;
    const idempotencyKey = this.state.submission.idempotencyKey;
    if (!this.options.definition.submission?.checkStatus) return this.state.submission;
    this.state.submission = { status: "unknown", idempotencyKey, checking: true };
    this.notify();
    try {
      const result = await this.options.definition.submission.checkStatus(idempotencyKey, this.submissionContext());
      this.applySubmissionResult(result, idempotencyKey);
    } catch (error) {
      this.state.submission = { status: "unknown", idempotencyKey, checking: false };
      this.telemetry.captureError(error, { ...this.eventAttributes(), idempotencyKey });
    }
    this.notify();
    return this.state.submission;
  }

  async goToStep(step: number): Promise<boolean> {
    const bounded = Math.max(0, Math.min(step, (this.options.definition.steps?.length ?? 1) - 1));
    if (bounded > this.state.currentStep) {
      const errors = await this.validateStep(this.state.currentStep);
      if (errors.some((error) => error.severity === "error")) return false;
    }
    const target = this.steps()[bounded];
    if (target?.canNavigateTo && !evaluateCondition(target.canNavigateTo, this.state.values)) return false;
    this.state.currentStep = bounded;
    this.notify();
    this.emitPluginEvent("step_completed");
    return true;
  }

  private steps(): Array<{ id: string; sectionIds: string[]; canNavigateTo?: FieldDefinition<TValues>["visibility"] }> {
    return this.options.definition.steps ?? this.options.definition.sections.map((section) => ({ id: section.id, sectionIds: [section.id] }));
  }

  private fieldIdsForStep(stepIndex: number): Set<string> {
    const step = this.steps()[stepIndex] ?? this.steps()[0];
    const sectionIds = new Set(step?.sectionIds ?? []);
    return new Set(this.options.definition.sections.filter((section) => sectionIds.has(section.id)).flatMap((section) => section.fields.map((field) => field.id)));
  }

  private applySubmissionResult(result: FormSubmissionResult<TValues>, idempotencyKey: string): void {
    switch (result.status) {
      case "succeeded":
        this.state.submission = { status: "succeeded", entityId: result.entityId };
        this.telemetry.track("submission_succeeded", this.eventAttributes());
        break;
      case "validation-failed":
        this.state.errors = result.errors;
        this.state.submission = { status: "validation-failed", errors: result.errors };
        break;
      case "conflict": {
        const changedFields = Object.keys(result.latestValues).filter((key) => this.state.baseValues[key] !== result.latestValues[key]);
        this.state.submission = { status: "conflict", currentVersion: result.currentVersion, latestValues: result.latestValues, changedFields };
        this.telemetry.track("submission_conflict", { ...this.eventAttributes(), changedFields: changedFields.length });
        break;
      }
      case "unknown":
        this.state.submission = { status: "unknown", idempotencyKey: result.idempotencyKey || idempotencyKey, checking: false };
        this.telemetry.track("submission_unknown", this.eventAttributes());
        break;
      case "failed":
        this.state.submission = { status: "failed", error: result.error };
        this.telemetry.track("submission_failed", this.eventAttributes());
        break;
    }
  }

  private applyCalculatedFields(changedFieldId: string): void {
    const affected = affectedFields(this.graph, changedFieldId);
    for (const field of flattenFields(this.options.definition)) {
      if (field.type !== "calculated" || !("calculated" in field)) continue;
      if (!affected.has(field.id) && !(field.calculated.dependencies as readonly string[]).includes(changedFieldId)) continue;
      const raw = field.calculated.calculate(this.state.values);
      const value = typeof raw === "number" && typeof field.calculated.precision === "number" ? Number(raw.toFixed(field.calculated.precision)) : raw;
      this.state.values = { ...this.state.values, [field.id]: value };
    }
  }

  private recalculate(changedFieldId?: string): void {
    const rules = evaluateRules(this.options.definition, this.state.values, undefined, this.options.context.locale);
    this.state.visibleFields = rules.visible;
    this.state.enabledFields = rules.enabled;
    this.state.readOnlyFields = rules.readOnly;
    this.state.requiredFields = rules.required;
    this.state.warnings = rules.warnings;
    this.state.ruleHistory = rules.history;
    for (const cleared of rules.cleared) this.state.values = { ...this.state.values, [cleared]: undefined };
    for (const [target, value] of rules.defaults) {
      if (this.state.values[target] === undefined) this.state.values = { ...this.state.values, [target]: value };
    }
    if (changedFieldId) this.telemetry.track("rule_evaluated", { ...this.eventAttributes(), fieldId: changedFieldId, affectedCount: affectedFields(this.graph, changedFieldId).size });
  }

  private scheduleDraftSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveDraft(), 450);
  }

  private notify(fieldId?: string): void {
    this.state = { ...this.state };
    for (const listener of this.listeners) listener();
    if (fieldId) {
      for (const listener of this.fieldListeners.get(fieldId) ?? []) listener();
      for (const affected of affectedFields(this.graph, fieldId)) {
        for (const listener of this.fieldListeners.get(affected) ?? []) listener();
      }
    }
  }

  private emitPluginEvent(event: string, fieldId?: string): void {
    this.plugins.emit({ event, ...(fieldId ? { fieldId } : {}), timestamp: new Date().toISOString(), metadata: this.eventAttributes() });
  }

  private eventAttributes(): Record<string, unknown> {
    return { formId: this.options.definition.id, formVersion: this.options.definition.version, tenantId: this.options.context.tenantId, userId: this.options.context.userId, correlationId: this.options.context.correlationId };
  }

  private submissionContext(): FormPlatformContext {
    return { ...this.options.context, ...(this.reviewedConflictVersion ? { reviewedConflictVersion: this.reviewedConflictVersion } : {}) };
  }
}

export function createDraftKey(context: Pick<FormPlatformContext, "tenantId" | "userId">, formId: string, entityOrDraftId: string, version: number): string {
  return `${context.tenantId}:${context.userId}:${formId}:${entityOrDraftId}:v${version}`;
}

export function migrateDraft<TValues extends FormValues>(definition: FormDefinition<TValues>, values: FormValues, fromVersion: number): FormValues {
  let next = values;
  for (let version = fromVersion; version < definition.version; version += 1) {
    const migration = definition.migrations?.[version];
    if (!migration) throw new Error(`No draft migration from v${version} to v${version + 1}.`);
    next = migration(next);
  }
  return next;
}

export function canView(permission: string | undefined, context: FormPlatformContext): boolean {
  return !permission || context.permissions.includes(permission);
}

export function canEdit<TValues extends FormValues>(field: FieldDefinition<TValues>, context: FormPlatformContext): boolean {
  return canView(field.permission?.edit, context);
}

function remoteLoaded(options: SelectOption[], nextCursor?: string): RemoteOptionsState {
  return { status: "loaded", options, ...(nextCursor ? { nextCursor } : {}) };
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function compareVersions(actual: string, required: string): number {
  const actualParts = actual.split(".").map(Number);
  const requiredParts = required.split(".").map(Number);
  for (let index = 0; index < Math.max(actualParts.length, requiredParts.length); index += 1) {
    const diff = (actualParts[index] ?? 0) - (requiredParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
