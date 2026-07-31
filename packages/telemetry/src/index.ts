export interface FormPlatformTelemetry {
  track(event: string, attributes?: Record<string, unknown>): void;
  measure(metric: string, value: number, attributes?: Record<string, unknown>): void;
  captureError(error: unknown, context?: Record<string, unknown>): void;
}

export class MemoryTelemetry implements FormPlatformTelemetry {
  readonly events: Array<{ kind: "track" | "measure" | "error"; name: string; attributes?: Record<string, unknown> | undefined; value?: number }> = [];

  track(event: string, attributes?: Record<string, unknown>): void {
    this.events.push({ kind: "track", name: event, attributes: redact(attributes) });
  }

  measure(metric: string, value: number, attributes?: Record<string, unknown>): void {
    this.events.push({ kind: "measure", name: metric, value, attributes: redact(attributes) });
  }

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.events.push({ kind: "error", name: error instanceof Error ? error.message : "unknown", attributes: redact(context) });
  }
}

export const noopTelemetry: FormPlatformTelemetry = {
  track: () => undefined,
  measure: () => undefined,
  captureError: () => undefined
};

export function redact(attributes?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!attributes) return undefined;
  const blocked = /password|token|secret|salary|national|bank|value/i;
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, blocked.test(key) ? "[redacted]" : value]));
}
