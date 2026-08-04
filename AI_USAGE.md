# AI Usage

## 1. AI Tools Used

OpenAI Codex was used for architecture analysis, implementation scaffolding, testing strategy, documentation, and review.

## 2. Architecture Prompts

- "Analyze the Admiral challenge and identify the reusable platform capabilities versus demo-form requirements."
- "Design a lightweight monorepo package boundary for a metadata-driven enterprise form platform."

## 3. Schema Design Prompts

- "Create a TypeScript schema API that supports typed field ids, conditional rules, permissions, calculated fields, and migrations."
- "Review schema types for excessive any usage and propose safer generic contracts."

## 4. Rules Engine Prompts

- "Implement deterministic declarative rules with nested AND/OR and dependency graph validation."
- "Explain how circular dependency detection and affected-field recalculation should work."

## 5. TypeScript API Prompts

- "Create a public facade package named @admiral/form-platform while keeping internal package boundaries."
- "Design plugin contracts for attachment, audit trail, and analytics contributions."

## 6. Testing Prompts

- "List mandatory unit and integration tests for duplicate fields, circular dependencies, draft isolation, conflicts, and unknown submissions."
- "Create Playwright journeys for shipment booking and conflict preservation without fixed delays."

## 7. Security Review Prompts

- "Review this form platform for unsafe dynamic execution, tenant data leakage, permission bypasses, plugin risks, and attachment upload risks."
- "Identify AI-generated code paths that need human review before production use, especially around security and privacy boundaries."

The security-focused output was used as a checklist, not copied verbatim. It led to explicit notes for backend authorization, plugin allowlisting, encrypted draft storage, attachment scanning, and sensitive-value redaction in audit events.

## 8. Prompt Iterations

Several iterations narrowed the scope from a full no-code builder to a headless engine plus React renderer, because the challenge explicitly states a drag-and-drop product is out of scope.

## 9. Outputs Modified

AI-generated scaffolding was modified to keep the monorepo lightweight, avoid Next.js coupling, and keep permissions inside the engine instead of JSX.

## 10. Outputs Rejected

A recommendation to rely heavily on React Hook Form was rejected because it would make an external library define the public core contract.

## 11. Validation Methods

Validation used TypeScript strict mode, Vitest unit/integration tests, Playwright E2E journeys, manual architecture review, and README traceability against the challenge checklist.

## 12. Lessons Learned

The most important design pressure is separating reusable platform behavior from product-specific business logic while still giving product squads a friendly API.
