# PaymentInput

PaymentInput formats a card number as it is typed and detects the card type from the leading digits. It validates nothing: it does not check a number's length or checksum, and what counts as acceptable is the application's decision.

## Formatted values

The change callback receives the formatted text with its spaces, not the digits and not an event. These sample numbers show what it receives:

| Typed digits | Callback receives | Grouping |
| --- | --- | --- |
| `378282246310005` | `3782 822463 10005` | Amex, 4-6-5 |
| `4111111111111111` | `4111 1111 1111 1111` | Visa, 4-4-4-4 |
| `9999999999999999` | `9999 9999 9999 9999` | Unknown, 4-4-4-4 |

Digits past the last group are dropped. To work with the digits, remove the spaces in the application, as the PaymentInput formatting example does. A named input part submits the formatted text, spaces included.

## Errors

The application checks the number, marks the field invalid, and renders the error part with its message. Use sample numbers like these, not real card numbers, in examples and tests. The [API reference](#api-reference) lists the props Mux UI defines.

- Check on submit first, so a number still being typed is not judged.
- After a failed check, recheck on every edit so the message clears once the number is complete, as the PaymentInput formatting example does with a length check.
- Show your own checks in the error part, and a failure from the payment provider as its own message. Formatting never produces an error.

## Card icon

CardIcon is decoration: one generic card glyph, marked `aria-hidden`, that looks the same for every card type. The card type is detected from the leading digits and recorded as `data-card-type` metadata, or set with `cardType`, but PaymentInput renders no card brand. Sending the number to a payment provider and handling its response belong to the application.

## Content

- Label the field Card number and set `autoComplete="cc-number"` on the input, as the examples do.
- Word the error as what is missing, such as Enter all the digits on the card.

## Common mistake

Sending the callback value to a payment provider as it is. It includes spaces, so remove them in the application first.
