import { describe, expect, it } from "vitest";
import { createDefaultFieldRegistry, validateFormDefinition, validateValues } from "./index";
import type { FormDefinition, FormPlatformContext } from "@admiral/form-schema";

const context: FormPlatformContext = { tenantId: "tenant-a", userId: "user-1", locale: "en", timezone: "UTC", permissions: [], correlationId: "test" };

describe("form-validation", () => {
  it("validates nested repeating schema contracts", () => {
    const definition: FormDefinition<{ contacts: unknown[] }> = {
      id: "repeating",
      version: 1,
      title: "Repeating",
      sections: [{ id: "main", title: "Main", fields: [{
        id: "contacts",
        type: "repeating-group",
        label: "Contacts",
        fields: [{ id: "name", type: "text", label: "Name" }, { id: "name", type: "text", label: "Duplicate" }]
      }] }]
    };
    expect(validateFormDefinition(definition).map((issue) => issue.code)).toContain("duplicate-repeating-field-id");
  });

  it("supports registry configuration without duplicate registration", () => {
    const registry = createDefaultFieldRegistry();
    registry.configure("file", { config: { maxSizeMb: 2, acceptedTypes: ["application/pdf"] } });
    expect(registry.get("file")?.config).toEqual({ maxSizeMb: 2, acceptedTypes: ["application/pdf"] });
    expect(() => registry.configure("unknown", {})).toThrow(/not registered/);
  });

  it("skips hidden fields while keeping form-level validation active", async () => {
    const definition: FormDefinition<{ reference: string; hidden: string }> = {
      id: "values",
      version: 1,
      title: "Values",
      sections: [{ id: "main", title: "Main", fields: [
        { id: "reference", type: "text", label: "Reference", required: true },
        { id: "hidden", type: "text", label: "Hidden", required: true }
      ] }],
      formValidation: [{ type: "custom", message: "Reference cannot be blocked.", validate: (_value, values) => values.reference !== "BLOCKED" }]
    };
    const errors = await validateValues({ definition, values: { reference: "BLOCKED", hidden: "" }, context, visible: new Set(["reference"]), required: new Set(["reference", "hidden"]) });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe("business");
  });
});
