# Accessibility and Internationalisation

## Accessibility Goals

The implementation targets practical WCAG 2.1 AA awareness for enterprise form workflows.

Implemented foundations:

- explicit label association
- required-state indicators
- error messages with `role="alert"`
- error summary with field navigation
- focus on first invalid field after submit
- visible focus states
- keyboard-operable stepper and controls
- non-color-only error and completed step indicators
- `aria-live` pending validation and submission feedback
- accessible file input trigger
- radio group semantics
- RTL layout support

## Field Labels

`FieldShell` associates labels through `htmlFor` and field IDs. Help text, validation messages, and pending validation messages are linked through `aria-describedby`.

## Error Summary

The error summary lists blocking validation errors and lets users focus the related field. On submit, the renderer focuses the first invalid field.

## Async Validation Announcements

Pending async validation renders an `aria-live="polite"` message. This avoids silent background validation for screen-reader users.

## Stepper

The stepper uses buttons, `aria-current="step"` for the active step, and visual plus icon-based indicators for completed and error states.

## Attachment Controls

The file field supports:

- keyboard file selection through a native input
- drag and drop
- list of attached files
- retry, cancel, and remove actions
- status labels
- error messages for invalid files

## RTL

Persian locale sets `dir="rtl"` on the form. The UI uses logical layout decisions and direction-aware step icons.

## Localized Text

The schema uses `LocalizedText` for:

- form title
- form description
- section title
- field labels
- help text
- validation messages
- rule warnings

```ts
{
  label: {
    en: "Port of loading",
    fa: "بندر بارگیری"
  }
}
```

## Locale-Aware Formatting

The renderer uses `Intl` for number, currency, and date previews. Inputs remain simple HTML controls so browser accessibility and native keyboard behavior are preserved.

Examples:

- `en-US` for English.
- `fa-IR` for Persian.

## Locale Persistence

The showcase persists locale in local storage so refreshes keep the selected language.

Production recommendations:

- store locale on the user profile when available
- fall back to tenant or browser locale
- avoid mixing persisted locale across tenants if tenant language policy differs

## Accessibility Testing Recommendations

Current tests verify functional flows. Recommended production additions:

- axe checks in Storybook or Playwright
- keyboard-only E2E path
- screen-reader smoke checklist
- high-contrast visual review
- reduced-motion review
- manual RTL review for complex layouts
