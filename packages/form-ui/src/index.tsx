import React from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react";
import { clsx } from "clsx";

export type FieldShellProps = {
  id: string;
  label: string;
  helpText?: string;
  required?: boolean;
  requiredLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  errors?: string[];
  warnings?: string[];
  children: React.ReactNode;
};

export function FieldShell({ id, label, helpText, required, requiredLabel = "required", pending, pendingLabel = "Validating...", errors = [], warnings = [], children }: FieldShellProps): JSX.Element {
  const describedBy = [helpText ? `${id}-help` : undefined, pending ? `${id}-pending` : undefined, errors.length ? `${id}-error` : undefined].filter(Boolean).join(" ");
  return (
    <div className="af-field" data-field={id}>
      <label className="af-label" htmlFor={id}>
        {label}
        {required ? <span aria-label={requiredLabel} className="af-required">*</span> : null}
      </label>
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {helpText ? <p id={`${id}-help`} className="af-help">{helpText}</p> : null}
      {pending ? <p id={`${id}-pending`} className="af-message af-message-pending" aria-live="polite"><Loader2 size={16} />{pendingLabel}</p> : null}
      {errors.length ? <p id={`${id}-error`} className="af-message af-message-error" role="alert"><AlertCircle size={16} />{errors[0]}</p> : null}
      {warnings.map((warning) => <p className="af-message af-message-warning" key={warning}><AlertCircle size={16} />{warning}</p>)}
    </div>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export function TextInput(props: InputProps): JSX.Element {
  return <input {...props} className={clsx("af-input", props.invalid && "af-input-invalid", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }): JSX.Element {
  return <textarea {...props} className={clsx("af-input af-textarea", props.invalid && "af-input-invalid", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; placeholder?: string; options: Array<{ value: string; label: string; disabled?: boolean }> }): JSX.Element {
  const { options, invalid, placeholder = "Select...", ...rest } = props;
  return (
    <select {...rest} className={clsx("af-input", invalid && "af-input-invalid", props.className)}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  );
}

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} type="checkbox" className={clsx("af-checkbox", props.className)} />;
}

export function RadioGroup(props: { id: string; name: string; value: string; disabled?: boolean; invalid?: boolean; ariaDescribedBy?: string; options: Array<{ value: string; label: string; disabled?: boolean }>; onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="af-radio-group" role="radiogroup" aria-labelledby={`${props.id}-legend`} aria-describedby={props.ariaDescribedBy} aria-invalid={props.invalid || undefined}>
      <span id={`${props.id}-legend`} className="af-sr-only">{props.name}</span>
      {props.options.map((option) => (
        <label className="af-radio-option" key={option.value}>
          <input type="radio" name={props.name} value={option.value} checked={props.value === option.value} disabled={props.disabled || option.disabled} onChange={(event) => props.onChange(event.currentTarget.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Button({ tone = "neutral", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "neutral" | "danger" }): JSX.Element {
  return <button {...props} className={clsx("af-button", `af-button-${tone}`, props.className)} />;
}

export function Stepper(props: { steps: string[]; current: number; errors?: number[]; completed?: number[]; disabled?: number[]; onSelect: (index: number) => void; dir?: "ltr" | "rtl"; ariaLabel?: string }): JSX.Element {
  const BackIcon = props.dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <nav className="af-stepper" aria-label={props.ariaLabel ?? "Form steps"}>
      {props.steps.map((step, index) => (
        <button key={step} type="button" disabled={props.disabled?.includes(index)} aria-current={index === props.current ? "step" : undefined} className={clsx("af-step", index === props.current && "af-step-active", props.errors?.includes(index) && "af-step-error", props.completed?.includes(index) && "af-step-completed")} onClick={() => props.onSelect(index)}>
          {props.errors?.includes(index) ? <AlertCircle size={16} /> : props.completed?.includes(index) || index < props.current ? <CheckCircle2 size={16} /> : index === props.current ? <BackIcon size={16} /> : <span className="af-step-dot" />}
          <span>{step}</span>
        </button>
      ))}
    </nav>
  );
}

export function ErrorSummary({ errors, onFocusField, title = "Review required" }: { errors: Array<{ fieldId?: string; message: string }>; onFocusField?: (fieldId: string) => void; title?: string }): JSX.Element | null {
  if (!errors.length) return null;
  return (
    <section className="af-error-summary" role="alert" aria-labelledby="error-summary-title">
      <h3 id="error-summary-title">{title}</h3>
      {errors.map((error, index) => (
        <button key={`${error.fieldId}-${index}`} type="button" onClick={() => error.fieldId && onFocusField?.(error.fieldId)}>
          <AlertCircle size={16} /> {error.message}
        </button>
      ))}
    </section>
  );
}

export function DraftIndicator({ status, label = "Draft", statusLabels }: { status: string; label?: string; statusLabels?: Record<string, string> }): JSX.Element {
  return <span className={clsx("af-status", status === "failed" && "af-status-danger")}><Loader2 size={14} /> {label} {statusLabels?.[status] ?? status}</span>;
}

export type AttachedFilePreview = {
  id?: string;
  name: string;
  size?: number;
  status?: string;
  error?: string;
};

export function FileDrop({ id, onFiles, onRemove, onRetry, onCancel, disabled, label = "Upload documents", files = [], actionLabels, statusLabels }: { id?: string; disabled?: boolean; label?: string; files?: AttachedFilePreview[]; actionLabels?: { remove: string; retry: string; cancel: string }; statusLabels?: Record<string, string>; onFiles: (files: File[]) => void; onRemove?: (fileId: string) => void; onRetry?: (fileId: string) => void; onCancel?: (fileId: string) => void }): JSX.Element {
  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (disabled) return;
    onFiles(Array.from(event.dataTransfer.files ?? []));
  };
  return (
    <div className={clsx("af-file", disabled && "af-file-disabled")} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <label className="af-file-prompt" htmlFor={id}>
        <Upload size={20} />
        <span>{label}</span>
      </label>
      <input id={id} type="file" multiple disabled={disabled} onChange={(event) => onFiles(Array.from(event.currentTarget.files ?? []))} />
      {files.length ? (
        <ul className="af-file-list" aria-live="polite">
          {files.map((file, index) => (
            <li key={file.id ?? `${file.name}-${index}`}>
              <span>
                <strong>{file.name}</strong>
                {file.error ? <em>{file.error}</em> : null}
              </span>
              <small>{[typeof file.size === "number" ? formatFileSize(file.size) : undefined, file.status ? statusLabels?.[file.status] ?? file.status : undefined].filter(Boolean).join(" / ")}</small>
              <span className="af-file-actions">
                {file.status === "failed" && file.id ? <Button type="button" onClick={() => onRetry?.(file.id!)}>{actionLabels?.retry ?? "Retry"}</Button> : null}
                {file.status === "uploading" && file.id ? <Button type="button" onClick={() => onCancel?.(file.id!)}>{actionLabels?.cancel ?? "Cancel"}</Button> : null}
                {file.id ? <Button type="button" tone="danger" onClick={() => onRemove?.(file.id!)}>{actionLabels?.remove ?? "Remove"}</Button> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ConfirmationDialog(props: { open: boolean; title: string; children: React.ReactNode; onConfirm: () => void; onCancel: () => void; cancelLabel?: string; confirmLabel?: string; closeLabel?: string }): JSX.Element | null {
  if (!props.open) return null;
  return (
    <div className="af-dialog-backdrop" role="presentation">
      <div className="af-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="af-icon-button" onClick={props.onCancel} aria-label={props.closeLabel ?? "Close"}><X size={18} /></button>
        <h2 id="dialog-title">{props.title}</h2>
        <div>{props.children}</div>
        <div className="af-dialog-actions">
          <Button onClick={props.onCancel}>{props.cancelLabel ?? "Cancel"}</Button>
          <Button tone="danger" onClick={props.onConfirm}>{props.confirmLabel ?? "Confirm"}</Button>
        </div>
      </div>
    </div>
  );
}
