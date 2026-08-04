import { describe, expect, it } from "vitest";
import type { FormDefinition, FormPlatformContext } from "./index";
import { text } from "./index";

describe("form-schema", () => {
  it("models localized field metadata and platform context", () => {
    const context: FormPlatformContext = {
      tenantId: "tenant-a",
      userId: "user-1",
      locale: "fa",
      timezone: "Asia/Tehran",
      permissions: ["form.edit"],
      correlationId: "schema-test"
    };
    const definition: FormDefinition<{ reference: string }> = {
      id: "schema-contract",
      version: 1,
      title: { en: "Schema contract", fa: "Schema contract" },
      sections: [{ id: "main", title: "Main", fields: [{ id: "reference", type: "text", label: { en: "Reference", fa: "Reference" }, required: true }] }]
    };

    expect(text(definition.title, context.locale)).toBe("Schema contract");
    expect(definition.sections[0]?.fields[0]?.id).toBe("reference");
  });
});
