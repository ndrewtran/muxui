# Form

Use the Mux UI React Form binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Submitting

Form renders a native form and forwards its submit and reset events. Name each field, handle the submit event to prevent the native submission, and read the named values from the form's data. Form does not track whether a submission is in progress, so the application owns the submitting state, for example by setting the submit Button pending while its request runs. Form has no combined invalid state either: each field shows its own.

## Validation timing

Choose `validationBehavior` by when a field should show its error.

- `native` is the default. The browser checks rules such as `required`, `type`, and `pattern` when the form is submitted, and a failing field stops the submit before your handler runs.
- `aria` shows no error for those rules and stops no submit. The application decides when each field is invalid, so it can show an error as the user leaves a field.
- Errors passed as `validationErrors` show at once in either mode, as External validation describes.

Use native for short forms where checking at submit is enough, such as sign-in or contact. Use `aria` when a field needs feedback before the submit, such as an email address checked as the user leaves it. The Form with native validation and Form with inline validation examples show one each.

## External validation

Validation errors from the application or a server are passed to Form as an object keyed by field name, and each value is a message or an array of messages. A field shows its errors as soon as the object arrives, and a field with several messages shows them together in its error part. Editing a field, or resetting the form, dismisses the errors shown for it until Form receives a new errors object, so a new response needs a new object. The Form with external validation example submits named fields, receives errors, and resets. The [API reference](#api-reference) lists the props Mux UI defines.

## Common mistake

Switching a form to `aria` and leaving `required` or `type` as its only checks. Those rules then show no error and do not stop the submit, so the form sends invalid values. Check the values in the submit handler as well.
