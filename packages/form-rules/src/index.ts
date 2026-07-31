import type {
  ConditionGroup,
  ConditionalRule,
  FieldCondition,
  FieldDefinition,
  FormDefinition,
  FormValues,
  Locale,
  RuleEffect,
  SchemaValidationIssue
} from "@admiral/form-schema";
import { text } from "@admiral/form-schema";

export type DependencyGraph = Map<string, Set<string>>;

export type RuleEvaluationResult = {
  visible: Set<string>;
  enabled: Set<string>;
  readOnly: Set<string>;
  required: Set<string>;
  warnings: Map<string, string[]>;
  options: Map<string, unknown[]>;
  cleared: Set<string>;
  defaults: Map<string, unknown>;
  history: RuleEvaluationHistory[];
};

export type RuleEvaluationHistory = {
  ruleId: string;
  matched: boolean;
  effects: RuleEffect<FormValues>[];
};

export function evaluateCondition<TValues extends FormValues>(condition: ConditionGroup<TValues>, values: TValues): boolean {
  if ("all" in condition) return condition.all.every((child) => evaluateCondition(child, values));
  if ("any" in condition) return condition.any.some((child) => evaluateCondition(child, values));
  return evaluateFieldCondition(condition, values);
}

export function evaluateFieldCondition<TValues extends FormValues>(condition: FieldCondition<TValues>, values: TValues): boolean {
  const actual = values[condition.field];
  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "notEquals":
      return actual !== condition.value;
    case "greaterThan":
      return Number(actual) > Number(condition.value);
    case "lessThan":
      return Number(actual) < Number(condition.value);
    case "contains":
      return Array.isArray(actual) ? actual.includes(condition.value) : String(actual ?? "").includes(String(condition.value ?? ""));
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual as never);
    case "isEmpty":
      return actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0);
    case "isNotEmpty":
      return !(actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0));
  }
}

export function evaluateRules<TValues extends FormValues>(
  definition: FormDefinition<TValues>,
  values: TValues,
  base?: Pick<RuleEvaluationResult, "visible" | "enabled" | "readOnly" | "required">,
  locale: Locale = "en"
): RuleEvaluationResult {
  const fields = flattenFields(definition);
  const result: RuleEvaluationResult = {
    visible: new Set(base?.visible ?? fields.map((field) => field.id)),
    enabled: new Set(base?.enabled ?? fields.map((field) => field.id)),
    readOnly: new Set(base?.readOnly ?? []),
    required: new Set(base?.required ?? fields.filter((field) => field.required).map((field) => field.id)),
    warnings: new Map(),
    options: new Map(),
    cleared: new Set(),
    defaults: new Map(),
    history: []
  };

  for (const field of fields) {
    if (field.visibility && !evaluateCondition(field.visibility, values)) result.visible.delete(field.id);
    if (field.enabledWhen && !evaluateCondition(field.enabledWhen, values)) result.enabled.delete(field.id);
    if (field.readOnlyWhen && evaluateCondition(field.readOnlyWhen, values)) result.readOnly.add(field.id);
    if (field.requiredWhen && evaluateCondition(field.requiredWhen, values)) result.required.add(field.id);
  }

  const rules = [...(definition.rules ?? [])].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id));
  for (const rule of rules) {
    const matched = evaluateCondition(rule.when, values);
    result.history.push({ ruleId: rule.id, matched, effects: rule.effects as RuleEffect<FormValues>[] });
    if (!matched) continue;
    for (const effect of rule.effects) applyEffect(result, effect, locale);
  }

  return result;
}

function applyEffect(result: RuleEvaluationResult, effect: RuleEffect<FormValues>, locale: Locale): void {
  switch (effect.type) {
    case "show":
      result.visible.add(effect.target);
      break;
    case "hide":
      result.visible.delete(effect.target);
      break;
    case "enable":
      result.enabled.add(effect.target);
      break;
    case "disable":
      result.enabled.delete(effect.target);
      break;
    case "require":
      result.required.add(effect.target);
      break;
    case "optional":
      result.required.delete(effect.target);
      break;
    case "clear":
      result.cleared.add(effect.target);
      break;
    case "setDefault":
      result.defaults.set(effect.target, effect.value);
      break;
    case "warning": {
      const messages = result.warnings.get(effect.target) ?? [];
      messages.push(text(effect.message, locale));
      result.warnings.set(effect.target, messages);
      break;
    }
    case "options":
      result.options.set(effect.target, effect.options);
      break;
  }
}

export function flattenFields<TValues extends FormValues>(definition: FormDefinition<TValues>): FieldDefinition<TValues>[] {
  return definition.sections.flatMap((section) => section.fields);
}

export function collectConditionReferences<TValues extends FormValues>(condition: ConditionGroup<TValues> | undefined): string[] {
  if (!condition) return [];
  if ("all" in condition) return condition.all.flatMap(collectConditionReferences);
  if ("any" in condition) return condition.any.flatMap(collectConditionReferences);
  return [condition.field];
}

export function buildDependencyGraph<TValues extends FormValues>(definition: FormDefinition<TValues>): DependencyGraph {
  const graph: DependencyGraph = new Map();
  for (const field of flattenFields(definition)) graph.set(field.id, new Set());
  for (const field of flattenFields(definition)) {
    const deps = new Set<string>([
      ...(field.dependencies ?? []),
      ...collectConditionReferences(field.visibility),
      ...collectConditionReferences(field.enabledWhen),
      ...collectConditionReferences(field.readOnlyWhen),
      ...collectConditionReferences(field.requiredWhen),
      ...(field.type === "calculated" && "calculated" in field ? field.calculated.dependencies : []),
      ...(field.dataSource?.dependsOn ?? [])
    ]);
    for (const dep of deps) {
      if (!graph.has(dep)) graph.set(dep, new Set());
      graph.get(dep)?.add(field.id);
    }
  }
  for (const rule of definition.rules ?? []) {
    const refs = collectConditionReferences(rule.when);
    for (const effect of rule.effects) {
      for (const ref of refs) {
        if (!graph.has(ref)) graph.set(ref, new Set());
        graph.get(ref)?.add(effect.target);
      }
    }
  }
  return graph;
}

export function topologicalOrder(graph: DependencyGraph): string[] {
  const indegree = new Map<string, number>();
  for (const node of graph.keys()) indegree.set(node, indegree.get(node) ?? 0);
  for (const dependents of graph.values()) {
    for (const dependent of dependents) indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
  }
  const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([node]) => node).sort();
  const ordered: string[] = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const dependent of graph.get(node) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
    ready.sort();
  }
  if (ordered.length !== indegree.size) {
    const cycle = [...indegree.entries()].filter(([, degree]) => degree > 0).map(([node]) => node);
    throw new Error(`Circular dependency detected: ${cycle.join(" -> ")}`);
  }
  return ordered;
}

export function affectedFields(graph: DependencyGraph, changedFieldId: string): Set<string> {
  const affected = new Set<string>();
  const queue = [...(graph.get(changedFieldId) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (affected.has(next)) continue;
    affected.add(next);
    queue.push(...(graph.get(next) ?? []));
  }
  return affected;
}

export function validateDependencyGraph<TValues extends FormValues>(definition: FormDefinition<TValues>): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const fieldIds: Set<string> = new Set(flattenFields(definition).map((field) => field.id));
  for (const field of flattenFields(definition)) {
    const refs = [
      ...(field.dependencies ?? []),
      ...collectConditionReferences(field.visibility),
      ...collectConditionReferences(field.enabledWhen),
      ...collectConditionReferences(field.readOnlyWhen),
      ...collectConditionReferences(field.requiredWhen),
      ...(field.type === "calculated" && "calculated" in field ? field.calculated.dependencies : []),
      ...(field.dataSource?.dependsOn ?? [])
    ];
    for (const ref of refs) {
      if (!fieldIds.has(ref)) {
        issues.push({ code: "unknown-field-reference", message: `Field "${field.id}" references unknown dependency "${ref}".`, path: field.id });
      }
    }
  }
  for (const rule of definition.rules ?? []) {
    const refs = collectConditionReferences(rule.when);
    for (const ref of refs) {
      if (!fieldIds.has(ref)) issues.push({ code: "unknown-rule-reference", message: `Rule "${rule.id}" references unknown field "${ref}".`, path: rule.id });
    }
    for (const effect of rule.effects) {
      if (!fieldIds.has(effect.target)) issues.push({ code: "unknown-effect-target", message: `Rule "${rule.id}" targets unknown field "${effect.target}".`, path: rule.id });
    }
  }
  try {
    topologicalOrder(buildDependencyGraph(definition));
  } catch (error) {
    issues.push({ code: "circular-dependency", message: error instanceof Error ? error.message : "Circular dependency detected." });
  }
  return issues;
}
