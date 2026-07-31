# Admiral Form Platform Documentation

This directory contains the submission documentation for `@admiral/form-platform`.

## Reading Order

1. [Getting Started](./getting-started.md)
2. [Architecture](./architecture.md)
3. [Authoring Forms](./authoring-forms.md)
4. [Schema Reference](./schema-reference.md)
5. [Rules and Validation](./rules-and-validation.md)
6. [Plugins](./plugins.md)
7. [Persistence and Submission](./persistence-and-submission.md)
8. [Testing](./testing.md)
9. [Accessibility and Internationalisation](./accessibility-and-i18n.md)
10. [Performance, Security, and Governance](./performance-security-governance.md)
11. [Technical Review Script](./review-script.md)

## What This Platform Solves

The platform lets product squads define enterprise forms as typed metadata instead of repeatedly implementing rendering, validation, conditional logic, draft persistence, permissions, remote options, submission states, and plugin hooks.

The implementation is intentionally not a visual no-code builder. It is a reusable frontend platform capability with a headless engine, React adapter, UI foundation, typed schema, rules engine, validation layer, CLI generator, examples, Storybook, tests, and governance documentation.

## Main Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm e2e
CI=1 pnpm --filter @admiral/showcase build-storybook
```

## Key Packages

- `@admiral/form-platform`: public facade package for product teams.
- `@admiral/form-core`: headless form engine, state, drafts, submission, plugins.
- `@admiral/form-react`: React renderer and hooks.
- `@admiral/form-schema`: typed schema and public contracts.
- `@admiral/form-rules`: declarative rules and dependency graph.
- `@admiral/form-validation`: schema and value validation.
- `@admiral/form-ui`: reusable accessible UI foundation.
- `@admiral/form-cli`: generator for new product forms.
- `@admiral/form-testing`: testing utility entry point.
- `@admiral/telemetry`: telemetry abstraction.

## Example Forms

- Shipment Booking Form: maritime booking, route-dependent voyage options, dangerous goods rules, repeating containers, charges, attachments, conflict handling, unknown submission.
- Employee Onboarding Form: HR onboarding, async national ID validation, manager data source, payroll permissions, equipment and emergency contacts.
