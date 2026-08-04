import { describe, expect, it } from "vitest";
import { affectedFields, buildDependencyGraph, evaluateRules, topologicalOrder } from "./index";
import type { FormDefinition } from "@admiral/form-schema";

describe("form-rules", () => {
  it("evaluates nested conditions and deterministic rule ordering", () => {
    const definition: FormDefinition<{ cargoType: string; amount: number; unNumber: string }> = {
      id: "rules",
      version: 1,
      title: "Rules",
      sections: [{ id: "main", title: "Main", fields: [
        { id: "cargoType", type: "text", label: "Cargo type" },
        { id: "amount", type: "number", label: "Amount" },
        { id: "unNumber", type: "text", label: "UN number" }
      ] }],
      rules: [
        { id: "b-warning", priority: 2, when: { field: "amount", operator: "greaterThan", value: 100 }, effects: [{ type: "warning", target: "amount", message: "High amount" }] },
        { id: "a-require", priority: 1, when: { all: [{ field: "cargoType", operator: "equals", value: "dangerous" }, { field: "amount", operator: "greaterThan", value: 10 }] }, effects: [{ type: "require", target: "unNumber" }] }
      ]
    };
    const result = evaluateRules(definition, { cargoType: "dangerous", amount: 150, unNumber: "" });
    expect(result.required.has("unNumber")).toBe(true);
    expect(result.warnings.get("amount")).toEqual(["High amount"]);
    expect(result.history.map((entry) => entry.ruleId)).toEqual(["a-require", "b-warning"]);
  });

  it("builds dependency order and affected field chains", () => {
    const definition: FormDefinition<{ base: number; fee: number; total: number }> = {
      id: "graph",
      version: 1,
      title: "Graph",
      sections: [{ id: "main", title: "Main", fields: [
        { id: "base", type: "number", label: "Base" },
        { id: "fee", type: "number", label: "Fee", dependencies: ["base"] },
        { id: "total", type: "calculated", label: "Total", calculated: { dependencies: ["base", "fee"], calculate: (values) => Number(values.base) + Number(values.fee) } }
      ] }]
    };
    const graph = buildDependencyGraph(definition);
    expect(topologicalOrder(graph).indexOf("base")).toBeLessThan(topologicalOrder(graph).indexOf("total"));
    expect(affectedFields(graph, "base")).toEqual(new Set(["fee", "total"]));
  });
});
