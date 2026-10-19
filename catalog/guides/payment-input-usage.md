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

The application checks the number, marks the field invalid, and renders the error part with its message. The example shows an error from a length check. Use sample numbers like these, not real card numbers, in examples and tests. The [API reference](#api-reference) lists the props Mux UI defines.
