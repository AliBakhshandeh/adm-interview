import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , command, name, ...flags] = process.argv;

if (command === "generate" && name) {
  generate(name, flags.includes("--template") ? flags[flags.indexOf("--template") + 1] : undefined);
} else if (process.argv[1]?.endsWith("index.ts")) {
  console.log("Usage: admiral-form generate <form-name> [--template multi-step]");
}

export function validateFormName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Form name must be kebab-case and start with a letter.");
}

export function generate(name: string, template = "basic"): void {
  validateFormName(name);
  const dir = join(process.cwd(), "features", name);
  if (existsSync(dir)) throw new Error(`Refusing to overwrite existing directory: ${dir}`);
  mkdirSync(dir, { recursive: true });
  const pascal = name.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  const files: Record<string, string> = {
    [`${name}.schema.ts`]: `export type ${pascal}Value = { reference: string; notes?: string };\n`,
    [`${name}.form.ts`]: `import type { FormDefinition } from "@admiral/form-platform";\nimport type { ${pascal}Value } from "./${name}.schema";\n\nexport const ${camel(name)}Form: FormDefinition<${pascal}Value> = {\n  id: "${name}",\n  version: 1,\n  title: "${pascal}",\n  sections: [{ id: "general", title: "General", fields: [{ id: "reference", type: "text", label: "Reference", required: true }] }],\n  steps: ${template === "multi-step" ? `[{ id: "general", title: "General", sectionIds: ["general"] }]` : "undefined"}\n};\n`,
    [`${name}.rules.ts`]: `export const ${camel(name)}Rules = [];\n`,
    [`${name}.validation.ts`]: `export const ${camel(name)}Validation = [];\n`,
    [`${name}.datasource.ts`]: `export const ${camel(name)}DataSources = {};\n`,
    [`${name}.fixture.ts`]: `import type { ${pascal}Value } from "./${name}.schema";\nexport const ${camel(name)}Fixture: ${pascal}Value = { reference: "REF-001" };\n`,
    [`${name}.migrations.ts`]: `export const migrations = {};\n`,
    [`${name}.test.tsx`]: `import { describe, expect, it } from "vitest";\nimport { ${camel(name)}Form } from "./${name}.form";\n\ndescribe("${name}", () => {\n  it("generates a valid form definition", () => {\n    expect(${camel(name)}Form.id).toBe("${name}");\n  });\n});\n`
  };
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
