import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorSummary, RadioGroup } from "./index";

describe("form-ui", () => {
  it("deduplicates repeated error summary messages", () => {
    render(<ErrorSummary title="Review" errors={[{ fieldId: "name", message: "Required" }, { fieldId: "name", message: "Required" }]} />);
    expect(screen.getAllByText(/Required/)).toHaveLength(1);
  });

  it("uses accessible radio group naming and description", () => {
    const onChange = vi.fn();
    render(<RadioGroup id="contact-channel" name="Contact channel" value="" ariaDescribedBy="channel-error" options={[{ value: "email", label: "Email" }]} onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "Contact channel" });
    expect(group.getAttribute("aria-describedby")).toBe("channel-error");
    fireEvent.click(screen.getByLabelText("Email"));
    expect(onChange).toHaveBeenCalledWith("email");
  });
});
