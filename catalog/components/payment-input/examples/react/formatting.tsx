import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, PaymentInput } from '@muxui/react';

export function PaymentInputFormattingExample() {
  // The callback receives the formatted text, spaces included, so keep that text as the value.
  const [card, setCard] = useState('');
  const [attempted, setAttempted] = useState(false);
  const digits = card.replace(/\D/g, '');
  // PaymentInput validates nothing, so this length rule is the application's own: 15 digits for the Amex prefixes, else 16.
  const complete = digits.length === (/^3[47]/.test(digits) ? 15 : 16);
  // Judge the number only after a submit, then recheck on every edit so the message clears once the number is complete.
  const incomplete = attempted && !complete;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    // A complete number would go to the payment provider from here. PaymentInput processes no payment.
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <PaymentInput.Root value={card} onChange={setCard} invalid={incomplete}>
          <PaymentInput.Label>Card number</PaymentInput.Label>
          <PaymentInput.Group>
            <PaymentInput.Input name="card" autoComplete="cc-number" />
            <PaymentInput.CardIcon />
          </PaymentInput.Group>
          <PaymentInput.Description>Try 378282246310005 or 4111111111111111.</PaymentInput.Description>
          <PaymentInput.Error>Enter all the digits on the card.</PaymentInput.Error>
        </PaymentInput.Root>
        <p>
          Callback value: {card || 'empty'}. Digits: {digits || 'none'}.
        </p>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </form>
  );
}
