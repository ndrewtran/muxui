import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, PaymentInput } from '@muxui/react';

export function PaymentInputFormattingExample() {
  // The callback receives the formatted text, spaces included, so keep that text as the value.
  const [card, setCard] = useState('');
  const [incomplete, setIncomplete] = useState(false);
  const digits = card.replace(/\D/g, '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // PaymentInput validates nothing, so this length check is the application's own rule.
    setIncomplete(digits.length < 15);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <PaymentInput.Root
          value={card}
          onChange={(next) => {
            setCard(next);
            setIncomplete(false);
          }}
          invalid={incomplete}
        >
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
