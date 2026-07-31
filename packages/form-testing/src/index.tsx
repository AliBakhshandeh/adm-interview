import React from "react";
import { render } from "@testing-library/react";
import { FormRenderer, MemoryDraftAdapter, type FormDefinition, type FormPlatformContext, type FormValues } from "@admiral/form-platform";

export function testContext(overrides: Partial<FormPlatformContext> = {}): FormPlatformContext {
  return {
    tenantId: "tenant-a",
    userId: "user-42",
    locale: "en",
    timezone: "UTC",
    permissions: ["booking.discount.write", "payroll.salary.read", "payroll.salary.write"],
    correlationId: "test-correlation",
    ...overrides
  };
}

export function renderFormPlatform<TValues extends FormValues>(params: {
  definition: FormDefinition<TValues>;
  initialValues: TValues;
  context?: Partial<FormPlatformContext>;
}) {
  const draftAdapter = new MemoryDraftAdapter();
  return {
    draftAdapter,
    ...render(<FormRenderer definition={params.definition} initialValues={params.initialValues} context={testContext(params.context)} draftAdapter={draftAdapter} />)
  };
}
