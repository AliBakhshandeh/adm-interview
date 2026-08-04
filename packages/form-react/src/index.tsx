import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FieldDefinition, FormDefinition, FormPlatformContext, FormValues, LocalizedText, OptionDataSource, SelectOption } from "@admiral/form-schema";
import { text } from "@admiral/form-schema";
import { canEdit, canView, FormEngine, type DraftAdapter, type FormEngineOptions, type FormPlugin } from "@admiral/form-core";
import { Button, Checkbox, DraftIndicator, ErrorSummary, FieldShell, FileDrop, RadioGroup, Select, Stepper, TextArea, TextInput } from "@admiral/form-ui";
import { evaluateCondition, flattenFields } from "@admiral/form-rules";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export type FormRendererProps<TValues extends FormValues> = {
  definition: FormDefinition<TValues>;
  initialValues: TValues;
  context: FormPlatformContext;
  registry?: FormEngineOptions<TValues>["registry"];
  draftAdapter?: DraftAdapter;
  telemetry?: FormEngineOptions<TValues>["telemetry"];
  plugins?: FormPlugin[];
  dataSources?: Record<string, OptionDataSource<SelectOption>>;
  stateOverrides?: FormEngineOptions<TValues>["stateOverrides"];
  showDebug?: boolean;
};

type FieldValue<TValues extends FormValues, TField extends FieldDefinition<TValues>> = TField["id"] extends keyof TValues ? TValues[TField["id"]] : unknown;

export type FieldRendererContext<TValues extends FormValues = FormValues, TField extends FieldDefinition<TValues> = FieldDefinition<TValues>> = {
  field: TField;
  engine: FormEngine<TValues>;
  state: FormEngine<TValues>["state"];
  value: FieldValue<TValues, TField>;
  locale: FormPlatformContext["locale"];
  disabled: boolean;
  required: boolean;
  errors: string[];
  warnings: string[];
  describedBy?: string;
  setValue: (value: FieldValue<TValues, TField>) => void;
};

export type CustomFieldRenderer<TValues extends FormValues = FormValues, TField extends FieldDefinition<TValues> = FieldDefinition<TValues>> = (context: FieldRendererContext<TValues, TField>) => React.ReactNode;

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

function useFormMetaSnapshot<TValues extends FormValues>(): FormEngine<TValues>["state"] {
  const engine = useFormEngine<TValues>();
  return useSyncExternalStore(engine.subscribeForm.bind(engine), () => engine.state, () => engine.state);
}

export function useFieldSnapshot<TValues extends FormValues>(fieldId: keyof TValues & string): FormEngine<TValues>["state"] {
  const engine = useFormEngine<TValues>();
  return useSyncExternalStore((listener) => engine.subscribeField(fieldId, listener), () => engine.state, () => engine.state);
}

export function FormRenderer<TValues extends FormValues>(props: FormRendererProps<TValues>): JSX.Element {
  const contextSignature = contextIdentity(props.context);
  const initialValuesSignature = JSON.stringify(props.initialValues);
  const engine = useMemo(() => new FormEngine(compactEngineOptions(props)), [props.definition, props.registry, props.draftAdapter, props.telemetry, props.plugins, props.dataSources, props.stateOverrides, contextSignature, initialValuesSignature]);
  useEffect(() => () => engine.destroy(), [engine]);
  return (
    <FormContext.Provider value={engine as FormEngine<FormValues>}>
      <EnterpriseForm definition={props.definition} showDebug={Boolean(props.showDebug)} />
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
    ...(props.telemetry ? { telemetry: props.telemetry } : {}),
    ...(props.plugins ? { plugins: props.plugins } : {}),
    ...(props.dataSources ? { dataSources: props.dataSources } : {}),
    ...(props.stateOverrides ? { stateOverrides: props.stateOverrides } : {})
  };
}

function contextIdentity(context: FormPlatformContext): string {
  return JSON.stringify({
    tenantId: context.tenantId,
    userId: context.userId,
    locale: context.locale,
    timezone: context.timezone,
    entityId: context.entityId,
    correlationId: context.correlationId,
    permissions: [...context.permissions].sort()
  });
}

function EnterpriseForm<TValues extends FormValues>({ definition, showDebug }: { definition: FormDefinition<TValues>; showDebug: boolean }): JSX.Element {
  const renderStartedAt = performance.now();
  const engine = useFormEngine<TValues>();
  const state = useFormMetaSnapshot<TValues>();
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
  useEffect(() => {
    engine.telemetry.measure("form_render_measured", performance.now() - renderStartedAt, { formId: definition.id, formVersion: definition.version, tenantId: engine.options.context.tenantId });
  });
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
              {section.fields.map((field) => <MemoFieldRenderer key={field.id} field={field} />)}
            </div>
          </section>
        ))}
      </div>
      <footer className="af-actions">
        <Button type="button" disabled={state.currentStep === 0} onClick={() => void engine.goToStep(state.currentStep - 1)}>{copy.back}</Button>
        <Button type="button" onClick={() => void engine.saveDraft()}>{copy.saveDraft}</Button>
        <Button type="button" tone="danger" disabled={state.draft.status === "idle"} onClick={() => void engine.discardDraft()}>{copy.discardDraft}</Button>
        {state.currentStep < steps.length - 1 ? <Button type="button" tone="primary" onClick={() => void engine.goToStep(state.currentStep + 1)}>{copy.next}</Button> : <Button type="submit" tone="primary">{copy.submit}</Button>}
      </footer>
      <SubmissionPanel fields={allFields} />
      {showDebug ? <DebugPanel fields={allFields} /> : null}
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
  const customRenderer = engine.registry.get(field.type)?.render as CustomFieldRenderer<TValues, typeof field> | undefined;
  const attachmentConfig = field.type === "file" ? attachmentConfigFor(engine, field) : defaultAttachmentConfig;
  const customField = customRenderer?.({
    field,
    engine,
    state,
    value: value as FieldValue<TValues, typeof field>,
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
        <RadioGroup id={field.id} name={field.id} label={label(field.label, locale)} disabled={disabled} invalid={errors.length > 0} {...(describedBy ? { ariaDescribedBy: describedBy } : {})} value={String(value ?? "")} options={optionView(remoteOptions.options, locale)} onChange={(next) => engine.setValue(field.id, next as TValues[typeof field.id])} />
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
          accept={attachmentConfig.acceptedTypes.join(",")}
          actionLabels={copy.fileActions}
          statusLabels={copy.fileStatuses}
          onFiles={(files) => attachFiles(engine, field.id, files, attachmentConfig)}
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

const MemoFieldRenderer = React.memo(FieldRenderer) as typeof FieldRenderer;

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
  const updateItem = (itemId: string, child: FieldDefinition<FormValues>, rawValue: unknown): void => {
    const nextValue = (child.type === "number" || child.type === "currency") && rawValue !== "" ? Number(rawValue) : rawValue;
    const next = items.map((item) => item.id === itemId ? { ...item, [child.id]: nextValue } : item);
    engine.setValue(field.id, next as TValues[typeof field.id]);
  };
  return (
    <div className="af-repeat" role="group" aria-labelledby={`${field.id}-repeat-label`}>
      <span id={`${field.id}-repeat-label`} className="af-sr-only">{label(field.label, locale)}</span>
      {items.map((item, index) => (
        <fieldset className="af-repeat-item" key={String(item.id)} aria-labelledby={`${field.id}-${item.id}-legend`}>
          <legend id={`${field.id}-${item.id}-legend`} className="af-sr-only">{copy.item} {index + 1}</legend>
          <div className="af-repeat-fields">
            {childFields.map((child) => {
              const path = repeatingPath(field.id, index, child.id);
              const errors = state.errors.filter((error) => error.fieldId === path && error.severity === "error").map((error) => error.message);
              const runtime = repeatingChildRuntime(child, item, engine.options.context);
              if (!runtime.visible) return null;
              const childLabel = label(child.label, locale) || labels[child.id] || child.id;
              return (
                <div className="af-repeat-field" key={child.id}>
                  <label htmlFor={path}>{childLabel}{runtime.required ? <span aria-hidden="true"> *</span> : null}</label>
                  <RepeatingControl parentFieldId={field.id} child={child} item={item} itemId={String(item.id)} path={path} errors={errors} locale={locale} disabled={runtime.disabled} required={runtime.required} updateItem={updateItem} />
                  {errors.length ? <em id={`${path}-error`} className="af-message af-message-error" role="alert">{errors[0]}</em> : null}
                </div>
              );
            })}
          </div>
          <div className="af-repeat-actions">
            <Button type="button" className="af-repeat-action" aria-label={copy.up} onClick={() => engine.moveRepeatingItem(field.id, String(item.id), -1)}><ArrowUp size={15} />{copy.up}</Button>
            <Button type="button" className="af-repeat-action" aria-label={copy.down} onClick={() => engine.moveRepeatingItem(field.id, String(item.id), 1)}><ArrowDown size={15} />{copy.down}</Button>
            <Button type="button" className="af-repeat-action" tone="danger" aria-label={copy.remove} onClick={() => engine.removeRepeatingItem(field.id, String(item.id))}><Trash2 size={15} />{copy.remove}</Button>
          </div>
        </fieldset>
      ))}
      <Button className="af-repeat-add" type="button" onClick={() => engine.addRepeatingItem(field.id, defaultRepeatingItem(childFields))}><Plus size={16} />{copy.addItem}</Button>
    </div>
  );
}

function RepeatingControl<TValues extends FormValues>({ parentFieldId, child, item, itemId, path, errors, locale, disabled, required, updateItem }: {
  parentFieldId: keyof TValues & string;
  child: FieldDefinition<FormValues>;
  item: Record<string, unknown>;
  itemId: string;
  path: string;
  errors: string[];
  locale: FormPlatformContext["locale"];
  disabled: boolean;
  required: boolean;
  updateItem: (itemId: string, child: FieldDefinition<FormValues>, rawValue: unknown) => void;
}): JSX.Element {
  const engine = useFormEngine<TValues>();
  const remoteOptions = useRepeatingRemoteOptions(parentFieldId, child, item, path);
  const value = item[child.id];
  const describedBy = errors.length ? `${path}-error` : undefined;
  const common = { id: path, disabled, "aria-invalid": errors.length > 0, ...(describedBy ? { "aria-describedby": describedBy } : {}) };
  const selectPlaceholder = remoteOptions.placeholder ? { placeholder: remoteOptions.placeholder } : {};
  const customRenderer = engine.registry.get(child.type)?.render as CustomFieldRenderer<FormValues, typeof child> | undefined;
  if (customRenderer) {
    return <>
      {customRenderer({
      field: child,
      engine: engine as unknown as FormEngine<FormValues>,
      state: engine.state as FormEngine<FormValues>["state"],
      value,
      locale,
      disabled,
      required,
      errors,
      warnings: [],
      ...(describedBy ? { describedBy } : {}),
      setValue: (next) => updateItem(itemId, child, next)
      })}
    </>;
  }
  if (child.type === "textarea") return <TextArea {...common} value={String(value ?? "")} onChange={(event) => updateItem(itemId, child, event.currentTarget.value)} />;
  if (child.type === "checkbox") return <Checkbox {...common} checked={Boolean(value)} onChange={(event) => updateItem(itemId, child, event.currentTarget.checked)} />;
  if (child.type === "select") return <Select {...common} {...selectPlaceholder} value={String(value ?? "")} options={optionView(remoteOptions.options, locale)} onChange={(event) => updateItem(itemId, child, event.currentTarget.value)} />;
  if (child.type === "multi-select") return <Select {...common} {...selectPlaceholder} multiple value={Array.isArray(value) ? value.map(String) : []} options={optionView(remoteOptions.options, locale)} onChange={(event) => updateItem(itemId, child, Array.from(event.currentTarget.selectedOptions).map((option) => option.value))} />;
  if (child.type === "radio") return <RadioGroup id={path} name={label(child.label, locale)} inputName={path} value={String(value ?? "")} disabled={disabled} invalid={errors.length > 0} {...(describedBy ? { ariaDescribedBy: describedBy } : {})} options={optionView(remoteOptions.options, locale)} onChange={(next) => updateItem(itemId, child, next)} />;
  return <TextInput {...common} type={child.type === "number" || child.type === "currency" ? "number" : child.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(event) => updateItem(itemId, child, event.currentTarget.value)} />;
}

function useRepeatingRemoteOptions<TValues extends FormValues>(parentFieldId: keyof TValues & string, child: FieldDefinition<FormValues>, item: Record<string, unknown>, path: string): { options: SelectOption[]; placeholder?: string; nextCursor?: string } {
  const engine = useFormEngine<TValues>();
  const state = useFieldSnapshot<TValues>(parentFieldId);
  const locale = engine.options.context.locale;
  const copy = uiCopy[locale];
  const dependencyValues = Object.fromEntries((child.dataSource?.dependsOn ?? []).map((dependency) => [dependency, item[dependency]]));
  const dependencyKey = JSON.stringify(dependencyValues);

  useEffect(() => {
    if (!child.dataSource || (child.type !== "select" && child.type !== "multi-select" && child.type !== "radio")) return;
    void engine.loadRemoteOptions(child as FieldDefinition<TValues>, "", undefined, { dependencyValues, storeKey: path, notifyFieldId: parentFieldId });
  }, [engine, parentFieldId, child.id, path, dependencyKey]);

  if (!child.dataSource) return { options: child.options ?? [] };
  const remote = state.remoteOptions.get(path);
  const options = remote?.options.length ? remote.options : child.options ?? [];
  if (!remote || remote.status === "idle") return { options, placeholder: copy.selectPlaceholder };
  if (remote.status === "loading") return { options, placeholder: copy.loadingOptions };
  if (remote.status === "empty") return { options: [], placeholder: copy.emptyOptions };
  if (remote.status === "failed") return { options, placeholder: copy.failedOptions };
  const nextCursor = "nextCursor" in remote ? remote.nextCursor : undefined;
  return { options, ...(nextCursor ? { nextCursor } : {}) };
}

function repeatingChildRuntime(child: FieldDefinition<FormValues>, item: Record<string, unknown>, context: FormPlatformContext): { visible: boolean; disabled: boolean; required: boolean } {
  const itemValues = item as FormValues;
  const visible = canView(child.permission?.view, context) && (!child.visibility || evaluateCondition(child.visibility, itemValues));
  const disabled = !canEdit(child, context) || Boolean(child.enabledWhen && !evaluateCondition(child.enabledWhen, itemValues)) || Boolean(child.readOnlyWhen && evaluateCondition(child.readOnlyWhen, itemValues));
  const required = Boolean(child.required || (child.requiredWhen && evaluateCondition(child.requiredWhen, itemValues)));
  return { visible, disabled, required };
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

function repeatingPath(fieldId: string, itemIndex: number, childId: string): string {
  return `${fieldId}[${itemIndex}].${childId}`;
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
type AttachmentConfig = { maxSizeMb: number; acceptedTypes: string[] };

const defaultAttachmentConfig: AttachmentConfig = { maxSizeMb: 10, acceptedTypes: ["application/pdf", "image/png", "image/jpeg", "text/plain"] };

function currentAttachments<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string): FormAttachment[] {
  const value = engine.state.values[fieldId];
  return Array.isArray(value) ? value as FormAttachment[] : [];
}

function attachFiles<TValues extends FormValues>(engine: FormEngine<TValues>, fieldId: keyof TValues & string, files: File[], config: AttachmentConfig): void {
  const existing = currentAttachments(engine, fieldId);
  const acceptedTypes = new Set(config.acceptedTypes);
  const maxSize = config.maxSizeMb * 1024 * 1024;
  const records = files.map((file) => {
    const duplicate = existing.some((item) => item.name === file.name && item.size === file.size && item.status !== "removed");
    const invalidType = file.type && !acceptedTypes.has(file.type);
    const tooLarge = file.size > maxSize;
    const failed = duplicate || invalidType || tooLarge;
    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: failed ? "failed" : "uploading",
      ...(failed ? { error: duplicate ? "Duplicate file" : invalidType ? "Unsupported file type" : `File is larger than ${config.maxSizeMb} MB` } : {})
    } satisfies FormAttachment;
  });
  engine.setValue(fieldId, [...existing, ...records] as TValues[typeof fieldId]);
  for (const record of records.filter((item) => item.status === "uploading")) finishAttachmentUpload(engine, fieldId, record.id);
}

function attachmentConfigFor<TValues extends FormValues>(engine: FormEngine<TValues>, field: FieldDefinition<TValues>): AttachmentConfig {
  const config = engine.registry.get(field.type)?.config;
  if (!isAttachmentConfig(config)) return defaultAttachmentConfig;
  return config;
}

function isAttachmentConfig(config: unknown): config is AttachmentConfig {
  if (typeof config !== "object" || config === null) return false;
  const candidate = config as Partial<AttachmentConfig>;
  return typeof candidate.maxSizeMb === "number" && Array.isArray(candidate.acceptedTypes) && candidate.acceptedTypes.every((type) => typeof type === "string");
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
    discardDraft: "Discard draft",
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
    discardDraft: "حذف پیش‌نویس",
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
