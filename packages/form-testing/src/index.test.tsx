import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { FormDefinition } from "@admiral/form-platform";
import { renderFormPlatform, testContext } from "./index";

describe("form-testing", () => {
  it("renders a form platform test harness with default context and draft adapter", () => {
    const definition: FormDefinition<{ reference: string }> = {
      id: "testing-harness",
      version: 1,
      title: "Testing harness",
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: "Reference" }] }]
    };

    const view = renderFormPlatform({ definition, initialValues: { reference: "REF-1" }, context: { tenantId: "tenant-test" } });

    expect(testContext().permissions).toContain("booking.discount.write");
    expect(view.draftAdapter).toBeDefined();
    expect(screen.getByLabelText("Reference")).toHaveValue("REF-1");
  });
});
