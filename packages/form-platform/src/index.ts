export * from "@admiral/form-schema";
export * from "@admiral/form-rules";
export * from "@admiral/form-validation";
export * from "@admiral/form-core";
export * from "@admiral/form-react";
export * from "@admiral/telemetry";

import type { FormPlugin } from "@admiral/form-core";

export function attachmentPlugin(config: { maxSizeMb: number; acceptedTypes: string[] } = { maxSizeMb: 10, acceptedTypes: ["application/pdf", "image/png", "image/jpeg"] }): FormPlugin {
  return {
    id: "attachment",
    version: "0.1.0",
    setup({ registry }) {
      if (registry.has("file")) registry.configure("file", { config });
      else registry.register({ type: "file", config });
      if (!registry.has("attachment")) registry.register({ type: "attachment", config });
      return {
        onEvent: () => undefined
      };
    }
  };
}

export function auditTrailPlugin(events: Array<{ event: string; fieldId?: string; timestamp: string; metadata?: Record<string, unknown> }> = []): FormPlugin {
  return {
    id: "audit-trail",
    version: "0.1.0",
    setup() {
      return {
        auditEvents: events,
        onEvent(event) {
          events.push({ ...event, ...(event.metadata ? { metadata: { ...event.metadata, value: "[excluded]" } } : {}) });
        }
      };
    }
  };
}

export function formAnalyticsPlugin(sampleRate = 1): FormPlugin {
  return {
    id: "form-analytics",
    version: "0.1.0",
    setup({ telemetry }) {
      return {
        onEvent(event) {
          if (Math.random() <= sampleRate) telemetry.track(event.event, { fieldId: event.fieldId, sampled: sampleRate < 1 });
        }
      };
    }
  };
}
