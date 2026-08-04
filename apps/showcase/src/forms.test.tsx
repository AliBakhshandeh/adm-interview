import { describe, expect, it } from "vitest";
import { validateFormDefinition } from "@admiral/form-platform";
import { bookingInitialValues, employeeInitialValues, employeeOnboardingForm, shipmentBookingForm } from "./forms";

describe("showcase forms", () => {
  it("keeps both example forms schema-valid and realistic", () => {
    expect(validateFormDefinition(shipmentBookingForm)).toEqual([]);
    expect(validateFormDefinition(employeeOnboardingForm)).toEqual([]);
    expect(shipmentBookingForm.sections.some((section) => section.fields.some((field) => field.type === "repeating-group"))).toBe(true);
    expect(employeeOnboardingForm.sections.some((section) => section.fields.some((field) => field.type === "file"))).toBe(true);
    expect(bookingInitialValues.containers).toEqual([]);
    expect(employeeInitialValues.emergencyContacts).toEqual([]);
  });
});
