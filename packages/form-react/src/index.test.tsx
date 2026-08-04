import { describe, expect, it, vi } from "vitest";
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

  it("refreshes same-tenant permission context on grant and revoke", () => {
    const definition: FormDefinition<{ discount: number }> = {
      id: "permissions",
      version: 1,
      title: "Permissions",
      sections: [{ id: "main", title: "Main", fields: [{ id: "discount", type: "number", label: "Discount", permission: { edit: "discount.edit" } }] }]
    };
    const view = render(<FormRenderer definition={definition} initialValues={{ discount: 0 }} context={context} draftAdapter={new MemoryDraftAdapter()} />);
    expect(screen.getByLabelText("Discount")).toBeDisabled();
    view.rerender(<FormRenderer definition={definition} initialValues={{ discount: 0 }} context={{ ...context, permissions: ["discount.edit"] }} draftAdapter={new MemoryDraftAdapter()} />);
    expect(screen.getByLabelText("Discount")).toBeEnabled();
    view.rerender(<FormRenderer definition={definition} initialValues={{ discount: 0 }} context={context} draftAdapter={new MemoryDraftAdapter()} />);
    expect(screen.getByLabelText("Discount")).toBeDisabled();
  });

  it("keeps unrelated custom field renderers isolated", () => {
    const registry = createDefaultFieldRegistry();
    const renderA = vi.fn(({ setValue }) => <button type="button" onClick={() => setValue("changed")}>Change A</button>);
    const renderB = vi.fn(() => <span>Stable B</span>);
    registry.register({ type: "custom-a", render: renderA });
    registry.register({ type: "custom-b", render: renderB });
    const definition = {
      id: "isolation",
      version: 1,
      title: "Isolation",
      sections: [{ id: "main", title: "Main", fields: [
        { id: "a", type: "custom-a", custom: true, label: "A" },
        { id: "b", type: "custom-b", custom: true, label: "B" }
      ] }]
    } as unknown as FormDefinition<{ a: string; b: string }>;
    render(<FormRenderer definition={definition} initialValues={{ a: "", b: "" }} context={context} registry={registry} draftAdapter={new MemoryDraftAdapter()} />);
    expect(renderA).toHaveBeenCalledTimes(1);
    expect(renderB).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Change A" }));
    expect(renderA).toHaveBeenCalledTimes(2);
    expect(renderB).toHaveBeenCalledTimes(1);
  });
});
