import { PaymentInput } from "@muxui/react";

export function BasicPaymentInputExample() {
  return <PaymentInput.Root><PaymentInput.Label>Card number</PaymentInput.Label><PaymentInput.Group><PaymentInput.Input inputMode="numeric" autoComplete="cc-number" /><PaymentInput.CardIcon /></PaymentInput.Group></PaymentInput.Root>;
}
