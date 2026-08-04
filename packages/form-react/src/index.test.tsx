import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createDefaultFieldRegistry } from "@admiral/form-validation";
import { MemoryDraftAdapter } from "@admiral/form-core";
import type { FormDefinition, FormPlatformContext } from "@admiral/form-schema";
import { FormRenderer } from "./index";

const context: FormPlatformContext = { tenantId: "tenant-a", userId: "user-1", locale: "en", timezone: "UTC", permissions: [], correlationId: "react-test" };

describe("form-react", () => {
  it("keeps debug state out of the DOM unless requested", () => {
    const definition: FormDefinition<{ secret: string }> = { id: "debug", version: 1, title: "Debug form", sections: [{ id: "main", title: "Main", fields: [{ id: "secret", type: "text", label: "Secret" }] }] };
    const view = render(<FormRenderer definition={definition} initialValues={{ secret: "sensitive" }} context={context} draftAdapter={new MemoryDraftAdapter()} />);
    expect(view.container.querySelector(".af-debug")).not.toBeInTheDocument();
    expect(screen.queryByText("sensitive")).not.toBeInTheDocument();
    view.rerender(<FormRenderer definition={definition} initialValues={{ secret: "sensitive" }} context={context} draftAdapter={new MemoryDraftAdapter()} showDebug />);
    const debugPanel = view.container.querySelector(".af-debug");
    expect(debugPanel).toBeInTheDocument();
    expect(debugPanel).toHaveTextContent("sensitive");
  });

  it("uses plugin-configured attachment constraints", async () => {
    const registry = createDefaultFieldRegistry();
    registry.configure("file", { config: { maxSizeMb: 1, acceptedTypes: ["application/pdf"] } });
    const definition: FormDefinition<{ attachments: unknown[] }> = { id: "attachments", version: 1, title: "Attachments", sections: [{ id: "main", title: "Main", fields: [{ id: "attachments", type: "file", label: "Attachments" }] }] };
    const view = render(<FormRenderer definition={definition} initialValues={{ attachments: [] }} context={context} registry={registry} draftAdapter={new MemoryDraftAdapter()} />);
    const input = view.container.querySelector<HTMLInputElement>("input[type='file']")!;
    expect(input).toHaveAttribute("accept", "application/pdf");
    fireEvent.change(input, { target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("Unsupported file type")).toBeInTheDocument();
  });
});
