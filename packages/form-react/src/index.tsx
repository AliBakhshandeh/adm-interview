import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FieldDefinition, FormDefinition, FormPlatformContext, FormValues, LocalizedText, OptionDataSource, SelectOption } from "@admiral/form-schema";
import { text } from "@admiral/form-schema";
import { FormEngine, type DraftAdapter, type FormEngineOptions, type FormPlugin } from "@admiral/form-core";
import { Button, Checkbox, DraftIndicator, ErrorSummary, FieldShell, FileDrop, RadioGroup, Select, Stepper, TextArea, TextInput } from "@admiral/form-ui";
import { flattenFields } from "@admiral/form-rules";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export type FormRendererProps<TValues extends FormValues> = {
  definition: FormDefinition<TValues>;
  initialValues: TValues;
  context: FormPlatformContext;
  registry?: FormEngineOptions<TValues>["registry"];
  draftAdapter?: DraftAdapter;
  plugins?: FormPlugin[];
  dataSources?: Record<string, OptionDataSource<SelectOption>>;
  stateOverrides?: FormEngineOptions<TValues>["stateOverrides"];
};

export type FieldRendererContext<TValues extends FormValues = FormValues> = {
  field: FieldDefinition<TValues>;
  engine: FormEngine<TValues>;
  state: FormEngine<TValues>["state"];
  value: unknown;
  locale: FormPlatformContext["locale"];
  disabled: boolean;
  required: boolean;
  errors: string[];
  warnings: string[];
  describedBy?: string;
  setValue: (value: unknown) => void;
};

export type CustomFieldRenderer<TValues extends FormValues = FormValues> = (context: FieldRendererContext<TValues>) => React.ReactNode;

const FormContext = createContext<FormEngine<FormValues> | null>(null);

export function useFormEngine<TValues extends FormValues>(): FormEngine<TValues> {
  const engine = useContext(FormContext);
  if (!engine) throw new Error("useFormEngine must be used inside FormRenderer.");
  return engine as FormEngine<TValues>;
}

export function useFormSnapshot<TValues extends FormValues>(): FormEngine<TValues>["state"] {
  const engine = useFormEngine<TValues>();
  return useSyncExternalStore(engine.subscribe.bind(engine), () => engine.state, () => engine.state);
}

export function useFieldSnapshot<TValues extends FormValues>(fieldId: keyof TValues & string): FormEngine<TValues>["state"] {
  const engine = useFormEngine<TValues>();
  return useSyncExternalStore((listener) => engine.subscribeField(fieldId, listener), () => engine.state, () => engine.state);
}

export function FormRenderer<TValues extends FormValues>(props: FormRendererProps<TValues>): JSX.Element {
  const engine = useMemo(() => new FormEngine(compactEngineOptions(props)), [props.definition.id, props.definition.version, props.context.tenantId, props.context.userId]);
  return (
    <FormContext.Provider value={engine as FormEngine<FormValues>}>
      <EnterpriseForm definition={props.definition} />
    </FormContext.Provider>
  );
}

function compactEngineOptions<TValues extends FormValues>(props: FormRendererProps<TValues>): FormEngineOptions<TValues> {
  return {
    definition: props.definition,
    initialValues: props.initialValues,
    context: props.context,
    ...(props.registry ? { registry: props.registry } : {}),
    ...(props.draftAdapter ? { draftAdapter: props.draftAdapter } : {}),
    ...(props.plugins ? { plugins: props.plugins } : {}),
    ...(props.dataSources ? { dataSources: props.dataSources } : {}),
    ...(props.stateOverrides ? { stateOverrides: props.stateOverrides } : {})
  };
}

function EnterpriseForm<TValues extends FormValues>({ definition }: { definition: FormDefinition<TValues> }): JSX.Element {
  const engine = useFormEngine<TValues>();
  const state = useFormSnapshot<TValues>();
  const locale = engine["options"].context.locale;
  const copy = uiCopy[locale];
  const dir = locale === "fa" ? "rtl" : "ltr";
  const steps = definition.steps ?? definition.sections.map((section) => ({ id: section.id, title: section.title, sectionIds: [section.id] }));
  const allFields = flattenFields(definition) as FieldDefinition<FormValues>[];
  const activeStep = steps[state.currentStep] ?? steps[0]!;
  const activeSections = definition.sections.filter((section) => activeStep.sectionIds.includes(section.id));
  const stepStatuses = engine.getStepStatuses();
  const stepErrors = stepStatuses.filter((step) => step.hasError).map((step) => step.index);
  const completedSteps = stepStatuses.filter((step) => step.completed).map((step) => step.index);
  const disabledSteps = stepStatuses.filter((step) => !step.canNavigate).map((step) => step.index);
  useEffect(() => {
    void engine.restoreDraft();
  }, [engine]);
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = await engine.submit();
    if (result.status === "validation-failed") {
      const firstFieldId = result.errors.find((error) => error.fieldId)?.fieldId;
      if (firstFieldId) document.getElementById(firstFieldId)?.focus();
    }
  };
  return (
    <form className="af-form" dir={dir} onSubmit={(event) => void handleSubmit(event)}>
      <header className="af-form-header">
        <div>
          <h1>{label(definition.title, locale)}</h1>
          {definition.description ? <p>{label(definition.description, locale)}</p> : null}
        </div>
        <DraftIndicator status={state.draft.status} label={copy.draft} statusLabels={copy.draftStatuses} />
      </header>
      <Stepper steps={steps.map((step) => label(step.title, locale))} current={state.currentStep} errors={stepErrors} completed={completedSteps} disabled={disabledSteps} onSelect={(index) => void engine.goToStep(index)} dir={dir} ariaLabel={copy.formSteps} />
      <ErrorSummary errors={state.errors.filter((error) => error.severity === "error")} title={copy.reviewRequired} onFocusField={(fieldId) => document.getElementById(fieldId)?.focus()} />
      <div className="af-sections">
        {activeSections.map((section) => (
          <section className="af-section" key={section.id}>
            <div className="af-section-heading">
              <h2>{label(section.title, locale)}</h2>
              {section.description ? <p>{label(section.description, locale)}</p> : null}
            </div>
            <div className="af-grid">
              {section.fields.map((field) => <FieldRenderer key={field.id} field={field} />)}
            </div>
          </section>
        ))}
      </div>
      <footer className="af-actions">
        <Button type="button" disabled={state.currentStep === 0} onClick={() => void engine.goToStep(state.currentStep - 1)}>{copy.back}</Button>
        <Button type="button" onClick={() => void engine.saveDraft()}>{copy.saveDraft}</Button>
        {state.currentStep < steps.length - 1 ? <Button type="button" tone="primary" onClick={() => void engine.goToStep(state.currentStep + 1)}>{copy.next}</Button> : <Button type="submit" tone="primary">{copy.submit}</Button>}
      </footer>
      <SubmissionPanel fields={allFields} />
      <DebugPanel fields={allFields} />
    </form>
  );
}

function FieldRenderer<TValues extends FormValues>({ field }: { field: FieldDefinition<TValues> }): JSX.Element | null {
  const engine = useFormEngine<TValues>();
  const state = useFieldSnapshot<TValues>(field.id);
  const locale = engine["options"].context.locale;
  const copy = uiCopy[locale];
  const value = state.values[field.id];
  const remoteOptions = useRemoteOptions(field, state.values);
  if (!state.visibleFields.has(field.id)) return null;
  const errors = state.errors.filter((error) => error.fieldId === field.id && error.severity === "error").map((error) => error.message);
  const warnings = [...(state.warnings.get(field.id) ?? []), ...state.errors.filter((error) => error.fieldId === field.id && error.severity === "warning").map((error) => error.message)];
  const disabled = !state.enabledFields.has(field.id) || state.readOnlyFields.has(field.id);
  const required = state.requiredFields.has(field.id) || Boolean(field.required);
  const describedBy = describedByFor(field, state.pendingAsyncValidations.has(field.id), errors.length > 0);
  const common = { id: field.id, disabled, "aria-invalid": errors.length > 0, ...(describedBy ? { "aria-describedby": describedBy } : {}) };
  const customRenderer = engine.registry.get(field.type)?.render as CustomFieldRenderer<TValues> | undefined;
  const customField = customRenderer?.({
    field,
    engine,
    state,
    value,
    locale,
    disabled,
    required,
    errors,
    warnings,
    ...(describedBy ? { describedBy } : {}),
    setValue: (next) => engine.setValue(field.id, next as TValues[typeof field.id])
  });
  return (
    <FieldShell id={field.id} label={label(field.label, locale)} {...(field.helpText ? { helpText: label(field.helpText, locale) } : {})} required={required} requiredLabel={copy.required} pending={state.pendingAsyncValidations.has(field.id)} pendingLabel={copy.validatingField} errors={errors} warnings={warnings}>
      {customField ? (
        customField
      ) : field.type === "textarea" ? (
        <TextArea {...common} value={String(value ?? "")} onChange={(event) => engine.setValue(field.id, event.currentTarget.value as TValues[typeof field.id])} />
      ) : field.type === "number" || field.type === "currency" ? (
        <>
          <TextInput {...common} type="number" value={String(value ?? "")} onChange={(event) => engine.setValue(field.id, Number(event.currentTarget.value) as TValues[typeof field.id])} />
          <output className="af-format-preview" htmlFor={field.id}>{formatFieldValue(field.type, value, locale, copy.currencyCode)}</output>
        </>
      ) : field.type === "date" ? (
        <>
          <TextInput {...common} type="date" value={String(value ?? "")} onChange={(event) => engine.setValue(field.id, event.currentTarget.value as TValues[typeof field.id])} />
          <output className="af-format-preview" htmlFor={field.id}>{formatFieldValue(field.type, value, locale, copy.currencyCode)}</output>
        </>
      ) : field.type === "checkbox" ? (
        <Checkbox {...common} checked={Boolean(value)} onChange={(event) => engine.setValue(field.id, event.currentTarget.checked as TValues[typeof field.id])} />
      ) : field.type === "radio" ? (
        <RadioGroup id={field.id} name={field.id} disabled={disabled} invalid={errors.length > 0} {...(describedBy ? { ariaDescribedBy: describedBy } : {})} value={String(value ?? "")} options={optionView(remoteOptions.options, locale)} onChange={(next) => engine.setValue(field.id, next as TValues[typeof field.id])} />
      ) : field.type === "select" ? (
        field.dataSource ? <RemoteSelectField field={field} common={common} value={String(value ?? "")} remoteOptions={remoteOptions} /> : <Select {...common} placeholder={remoteOptions.placeholder ?? copy.selectPlaceholder} value={String(value ?? "")} options={optionView(remoteOptions.options, locale)} onChange={(event) => engine.setValue(field.id, event.currentTarget.value as TValues[typeof field.id])} />
      ) : field.type === "multi-select" ? (
        <Select {...common} placeholder={remoteOptions.placeholder ?? copy.selectPlaceholder} multiple value={Array.isArray(value) ? value.map(String) : []} options={optionView(remoteOptions.options, locale)} onChange={(event) => engine.setValue(field.id, Array.from(event.currentTarget.selectedOptions).map((option) => option.value) as TValues[typeof field.id])} />
      ) : field.type === "file" ? (
        <FileDrop
          id={field.id}
          disabled={disabled}
          label={copy.uploadDocuments}
          files={Array.isArray(value) ? value as FormAttachment[] : []}
          actionLabels={copy.fileActions}
          statusLabels={copy.fileStatuses}
          onFiles={(files) => attachFiles(engine, field.id, files)}
          onRemove={(fileId) => removeAttachment(engine, field.id, fileId)}
          onRetry={(fileId) => retryAttachment(engine, field.id, fileId)}
          onCancel={(fileId) => cancelAttachment(engine, field.id, fileId)}
        />
      ) : field.type === "repeating-group" ? (
        <RepeatingField field={field} />
      ) : field.type === "calculated" ? (
        <>
          <TextInput {...common} readOnly value={String(value ?? "")} />
          <output className="af-format-preview" htmlFor={field.id}>{formatFieldValue("currency", value, locale, copy.currencyCode)}</output>
        </>
      ) : (
        <TextInput {...common} value={String(value ?? "")} onChange={(event) => engine.setValue(field.id, event.currentTarget.value as TValues[typeof field.id])} />
      )}
    </FieldShell>
  );
}

function RemoteSelectField<TValues extends FormValues>({ field, common, value, remoteOptions }: { field: FieldDefinition<TValues>; common: { id: string; disabled: boolean; "aria-invalid": boolean }; value: string; remoteOptions: { options: SelectOption[]; placeholder?: string; nextCursor?: string } }): JSX.Element {
  const engine = useFormEngine<TValues>();
  const locale = engine.options.context.locale;
  const copy = uiCopy[locale];
  const [query, setQuery] = useState("");
  return (
    <div className="af-remote-select">
      <TextInput aria-label={copy.searchOptions} disabled={common.disabled} value={query} placeholder={copy.searchOptions} onChange={(event) => setQuery(event.currentTarget.value)} />
      <div className="af-remote-select-row">
        <Select {...common} placeholder={remoteOptions.placeholder ?? copy.selectPlaceholder} value={value} options={optionView(remoteOptions.options, locale)} onChange={(event) => engine.setValue(field.id, event.currentTarget.value as TValues[typeof field.id])} />
        <Button type="button" disabled={common.disabled} onClick={() => void engine.loadRemoteOptions(field, query)}>{copy.search}</Button>
        {remoteOptions.nextCursor ? <Button type="button" disabled={common.disabled} onClick={() => void engine.loadRemoteOptions(field, query, remoteOptions.nextCursor)}>{copy.loadMore}</Button> : null}
      </div>
    </div>
  );
}

function useRemoteOptions<TValues extends FormValues>(field: FieldDefinition<TValues>, values: TValues): { options: SelectOption[]; placeholder?: string; nextCursor?: string } {
  const engine = useFormEngine<TValues>();
  const state = useFieldSnapshot<TValues>(field.id);
  const locale = engine.options.context.locale;
  const copy = uiCopy[locale];
  const dependencyKey = JSON.stringify((field.dataSource?.dependsOn ?? []).map((dependency) => values[dependency]));

  useEffect(() => {
    if (!field.dataSource || (field.type !== "select" && field.type !== "multi-select" && field.type !== "radio")) return;
    void engine.loadRemoteOptions(field);
  }, [engine, field.id, dependencyKey]);

  if (!field.dataSource) return { options: field.options ?? [] };
  const remote = state.remoteOptions.get(field.id);
  const options = remote?.options.length ? remote.options : field.options ?? [];
  if (!remote || remote.status === "idle") return { options, placeholder: copy.selectPlaceholder };
  if (remote.status === "loading") return { options, placeholder: copy.loadingOptions };
  if (remote.status === "empty") return { options: [], placeholder: copy.emptyOptions };
  if (remote.status === "failed") return { options, placeholder: copy.failedOptions };
  const nextCursor = "nextCursor" in remote ? remote.nextCursor : undefined;
  return { options, ...(nextCursor ? { nextCursor } : {}) };
}

function RepeatingField<TValues extends FormValues>({ field }: { field: FieldDefinition<TValues> }): JSX.Element {
  const engine = useFormEngine<TValues>();
  const state = useFieldSnapshot<TValues>(field.id);
  const locale = engine["options"].context.locale;
  const copy = uiCopy[locale];
  const items = Array.isArray(state.values[field.id]) ? (state.values[field.id] as Array<Record<string, unknown>>) : [];
  const childFields = repeatingChildFields(field);
  const labels: Record<string, string> = copy.repeatingFieldLabels;
  const updateItem = (itemId: string, child: FieldDefinition<FormValues>, rawValue: string | boolean): void => {
    const nextValue = (child.type === "number" || child.type === "currency") && rawValue !== "" ? Number(rawValue) : rawValue;
    const next = items.map((item) => item.id === itemId ? { ...item, [child.id]: nextValue } : item);
    engine.setValue(field.id, next as TValues[typeof field.id]);
  };
  return (
    <div className="af-repeat">
      {items.map((item) => (
        <div className="af-repeat-item" key={String(item.id)}>
          <div className="af-repeat-fields">
            {childFields.map((child) => (
              <label className="af-repeat-field" key={child.id}>
                <span>{label(child.label, locale) || labels[child.id] || child.id}</span>
                {child.type === "checkbox" ? (
                  <input
                    className="af-checkbox"
                    type="checkbox"
                    checked={Boolean(item[child.id])}
                    onChange={(event) => updateItem(String(item.id), child, event.currentTarget.checked)}
                  />
                ) : (
                  <input
                    className="af-input af-repeat-input"
                    type={child.type === "number" || child.type === "currency" ? "number" : "text"}
                    value={String(item[child.id] ?? "")}
                    onChange={(event) => updateItem(String(item.id), child, event.currentTarget.value)}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="af-repeat-actions">
            <Button type="button" className="af-repeat-action" aria-label={copy.up} onClick={() => engine.moveRepeatingItem(field.id, String(item.id), -1)}><ArrowUp size={15} />{copy.up}</Button>
            <Button type="button" className="af-repeat-action" aria-label={copy.down} onClick={() => engine.moveRepeatingItem(field.id, String(item.id), 1)}><ArrowDown size={15} />{copy.down}</Button>
            <Button type="button" className="af-repeat-action" tone="danger" aria-label={copy.remove} onClick={() => engine.removeRepeatingItem(field.id, String(item.id))}><Trash2 size={15} />{copy.remove}</Button>
          </div>
        </div>
      ))}
      <Button className="af-repeat-add" type="button" onClick={() => engine.addRepeatingItem(field.id, defaultRepeatingItem(childFields))}><Plus size={16} />{copy.addItem}</Button>
    </div>
  );
}

function describedByFor<TValues extends FormValues>(field: FieldDefinition<TValues>, pending: boolean, hasError: boolean): string | undefined {
  const ids = [field.helpText ? `${field.id}-help` : undefined, pending ? `${field.id}-pending` : undefined, hasError ? `${field.id}-error` : undefined].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function SubmissionPanel({ fields }: { fields: FieldDefinition<FormValues>[] }): JSX.Element | null {
  const state = useFormSnapshot<FormValues>();
  const engine = useFormEngine<FormValues>();
  const locale = engine.options.context.locale;
  const copy = uiCopy[locale];
  if (state.submission.status === "idle" || state.submission.status === "validating") return null;
  if (state.submission.status === "conflict") {
    const labels = new Map(fields.map((field) => [field.id, label(field.label, locale)]));
    return (
      <aside className="af-submission af-submission-conflict" role="status" aria-live="polite">
        <div className="af-submission-heading">
          <strong>{copy.conflictTitle}</strong>
          <span>{copy.conflictDescription}</span>
        </div>
        <ul className="af-conflict-list">
          {state.submission.changedFields.map((fieldId) => (
            <li key={fieldId}>
              <strong>{labels.get(fieldId) ?? fieldId}</strong>
              <span>{copy.yourValue}: {String(state.values[fieldId] ?? "")}</span>
              <span>{copy.serverValue}: {String(state.submission.status === "conflict" ? state.submission.latestValues[fieldId] ?? "" : "")}</span>
            </li>
          ))}
        </ul>
        <Button type="button" tone="primary" onClick={() => { engine.reviewConflict(); void engine.submit(); }}>{copy.reviewAndResubmit}</Button>
      </aside>
    );
  }
  if (state.submission.status === "unknown") {
    return (
      <aside className="af-submission af-submission-unknown" role="status" aria-live="polite">
        <strong>{copy.unknownTitle}</strong>
        <span>{copy.unknownDescription}</span>
        <code>{state.submission.idempotencyKey}</code>
        <Button type="button" tone="primary" disabled={state.submission.checking} onClick={() => void engine.checkUnknownSubmission()}>{state.submission.checking ? copy.checkingStatus : copy.checkStatus}</Button>
      </aside>
    );
  }
  return <aside className={`af-submission af-submission-${state.submission.status}`} role="status" aria-live="polite">{copy.submission}: {copy.submissionStatuses[state.submission.status] ?? state.submission.status}</aside>;
}

function DebugPanel({ fields }: { fields: FieldDefinition<FormValues>[] }): JSX.Element {
  const state = useFormSnapshot<FormValues>();
  const engine = useFormEngine<FormValues>();
  const copy = uiCopy[engine.options.context.locale];
  return (
    <details className="af-debug">
      <summary>{copy.debug}</summary>
      <pre>{JSON.stringify({ values: state.values, dirtyFields: [...state.dirtyFields], visibleFields: [...state.visibleFields], ruleHistory: state.ruleHistory, fields: fields.map((field) => field.id) }, null, 2)}</pre>
    </details>
  );
}

function label(value: LocalizedText, locale: "en" | "fa"): string {
  return text(value, locale);
}

function optionView(options: SelectOption[], locale: "en" | "fa"): Array<{ value: string; label: string; disabled?: boolean }> {
  return options.map((option) => ({
    value: option.value,
    label: label(option.label, locale),
    ...(option.disabled ? { disabled: option.disabled } : {})
  }));
}

function formatFieldValue(type: "number" | "currency" | "date", value: unknown, locale: "en" | "fa", currency: string): string {
  if (value === undefined || value === null || value === "") return "";
  const intlLocale = locale === "fa" ? "fa-IR" : "en-US";
  if (type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(date);
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "";
  return new Intl.NumberFormat(intlLocale, type === "currency" ? { style: "currency", currency, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }).format(numeric);
}

function repeatingChildFields<TValues extends FormValues>(field: FieldDefinition<TValues>): FieldDefinition<FormValues>[] {
  if (field.type === "repeating-group" && "fields" in field) return field.fields as FieldDefinition<FormValues>[];
  return [];
}

function defaultRepeatingItem(fields: FieldDefinition<FormValues>[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? defaultValueForField(field)]));
}

function defaultValueForField(field: FieldDefinition<FormValues>): unknown {
  if (field.type === "number" || field.type === "currency") return 0;
  if (field.type === "checkbox") return false;
  if (field.type === "multi-select" || field.type === "file" || field.type === "repeating-group") return [];
  return "";
}

type FormAttachment = { id: string; name: string; size: number; type?: string; status: "idle" | "uploading" | "uploaded" | "failed" | "removing" | "removed"; error?: string };

const acceptedAttachmentTypes = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);
const maxAttachmentSize = 10 * 1024 * 1024;

function currentAttachments<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string): FormAttachment[] {
  const value = engine.state.values[fieldId];
  return Array.isArray(value) ? value as FormAttachment[] : [];
}

function attachFiles<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, files: File[]): void {
  const existing = currentAttachments(engine, fieldId);
  const records = files.map((file) => {
    const duplicate = existing.some((item) => item.name === file.name && item.size === file.size && item.status !== "removed");
    const invalidType = file.type && !acceptedAttachmentTypes.has(file.type);
    const tooLarge = file.size > maxAttachmentSize;
    const failed = duplicate || invalidType || tooLarge;
    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: failed ? "failed" : "uploading",
      ...(failed ? { error: duplicate ? "Duplicate file" : invalidType ? "Unsupported file type" : "File is larger than 10 MB" } : {})
    } satisfies FormAttachment;
  });
  engine.setValue(fieldId, [...existing, ...records] as TValues[typeof fieldId]);
  for (const record of records.filter((item) => item.status === "uploading")) finishAttachmentUpload(engine, fieldId, record.id);
}

function finishAttachmentUpload<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, fileId: string): void {
  window.setTimeout(() => {
    const next = currentAttachments(engine, fieldId).map((file) => file.id === fileId && file.status === "uploading" ? { ...file, status: "uploaded" as const } : file);
    engine.setValue(fieldId, next as TValues[typeof fieldId]);
  }, 450);
}

function removeAttachment<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, fileId: string): void {
  const removing = currentAttachments(engine, fieldId).map((file) => file.id === fileId ? { ...file, status: "removing" as const } : file);
  engine.setValue(fieldId, removing as TValues[typeof fieldId]);
  window.setTimeout(() => {
    engine.setValue(fieldId, currentAttachments(engine, fieldId).filter((file) => file.id !== fileId) as TValues[typeof fieldId]);
  }, 250);
}

function retryAttachment<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, fileId: string): void {
  const next = currentAttachments(engine, fieldId).map((file) => file.id === fileId ? { ...file, status: "uploading" as const, error: undefined } : file);
  engine.setValue(fieldId, next as TValues[typeof fieldId]);
  finishAttachmentUpload(engine, fieldId, fileId);
}

function cancelAttachment<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, fileId: string): void {
  engine.setValue(fieldId, currentAttachments(engine, fieldId).filter((file) => file.id !== fileId) as TValues[typeof fieldId]);
}

const uiCopy = {
  en: {
    back: "Back",
    next: "Next",
    submit: "Submit",
    saveDraft: "Save draft",
    draft: "Draft",
    formSteps: "Form steps",
    reviewRequired: "Review required",
    required: "required",
    validatingField: "Validating...",
    currencyCode: "USD",
    selectPlaceholder: "Select...",
    loadingOptions: "Loading options...",
    emptyOptions: "No options found",
    failedOptions: "Could not load options",
    searchOptions: "Search options",
    search: "Search",
    loadMore: "Load more",
    uploadDocuments: "Upload documents",
    item: "Item",
    up: "Up",
    down: "Down",
    remove: "Remove",
    addItem: "Add item",
    submission: "Submission",
    conflictTitle: "Server changes need review",
    conflictDescription: "Your values are preserved. Review the latest server changes before resubmitting.",
    yourValue: "Your value",
    serverValue: "Server value",
    reviewAndResubmit: "Review and resubmit",
    unknownTitle: "Submission status is unknown",
    unknownDescription: "The request may have reached the server. Keep this idempotency key before checking status.",
    checkStatus: "Check status",
    checkingStatus: "Checking...",
    debug: "Debug",
    fileActions: {
      remove: "Remove",
      retry: "Retry",
      cancel: "Cancel"
    },
    fileStatuses: {
      idle: "idle",
      uploading: "uploading",
      uploaded: "uploaded",
      failed: "failed",
      removing: "removing",
      removed: "removed"
    },
    repeatingFieldLabels: {
      type: "Type",
      quantity: "Quantity",
      weight: "Weight",
      name: "Name",
      phone: "Phone",
      relation: "Relation"
    },
    draftStatuses: {
      idle: "idle",
      saving: "saving",
      saved: "saved",
      failed: "failed",
      restored: "restored",
      expired: "expired"
    },
    submissionStatuses: {
      submitting: "submitting",
      succeeded: "succeeded",
      "validation-failed": "validation failed",
      conflict: "conflict",
      unknown: "unknown",
      failed: "failed"
    }
  },
  fa: {
    back: "قبلی",
    next: "بعدی",
    submit: "ارسال",
    saveDraft: "ذخیره پیش‌نویس",
    draft: "پیش‌نویس",
    formSteps: "مراحل فرم",
    reviewRequired: "نیاز به بازبینی",
    required: "الزامی",
    validatingField: "در حال اعتبارسنجی...",
    currencyCode: "USD",
    selectPlaceholder: "انتخاب کنید...",
    loadingOptions: "در حال بارگذاری گزینه‌ها...",
    emptyOptions: "گزینه‌ای پیدا نشد",
    failedOptions: "بارگذاری گزینه‌ها ناموفق بود",
    searchOptions: "جستجوی گزینه‌ها",
    search: "جستجو",
    loadMore: "بیشتر",
    uploadDocuments: "بارگذاری مدارک",
    item: "آیتم",
    up: "بالا",
    down: "پایین",
    remove: "حذف",
    addItem: "افزودن آیتم",
    submission: "ارسال",
    conflictTitle: "تغییرات سرور نیاز به بازبینی دارد",
    conflictDescription: "مقادیر واردشده شما حفظ شده‌اند. پیش از ارسال دوباره، تغییرات جدید سرور را بازبینی کنید.",
    yourValue: "مقدار شما",
    serverValue: "مقدار سرور",
    reviewAndResubmit: "بازبینی و ارسال دوباره",
    unknownTitle: "وضعیت ارسال نامشخص است",
    unknownDescription: "ممکن است درخواست به سرور رسیده باشد. قبل از بررسی وضعیت، این کلید idempotency را نگه دارید.",
    checkStatus: "بررسی وضعیت",
    checkingStatus: "در حال بررسی...",
    debug: "اشکال‌زدایی",
    fileActions: {
      remove: "حذف",
      retry: "تلاش مجدد",
      cancel: "لغو"
    },
    fileStatuses: {
      idle: "آماده",
      uploading: "در حال بارگذاری",
      uploaded: "بارگذاری شد",
      failed: "ناموفق",
      removing: "در حال حذف",
      removed: "حذف شد"
    },
    repeatingFieldLabels: {
      type: "نوع",
      quantity: "تعداد",
      weight: "وزن",
      name: "نام",
      phone: "تلفن",
      relation: "نسبت"
    },
    draftStatuses: {
      idle: "آماده",
      saving: "در حال ذخیره",
      saved: "ذخیره شد",
      failed: "ناموفق",
      restored: "بازیابی شد",
      expired: "منقضی شد"
    },
    submissionStatuses: {
      submitting: "در حال ارسال",
      succeeded: "موفق",
      "validation-failed": "اعتبارسنجی ناموفق",
      conflict: "تداخل نسخه",
      unknown: "نامشخص",
      failed: "ناموفق"
    }
  }
} as const;
