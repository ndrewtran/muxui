import { Input, Link } from '@muxui/react';

export function InputLabelRowExample() {
  return (
    <Input.Root>
      {/* Input leaves the layout to you, so an action can share the label's row. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Input.Label>Password</Input.Label>
        <Link href="#reset">Forgot password?</Link>
      </div>
      <Input.Input name="password" type="password" autoComplete="current-password" />
    </Input.Root>
  );
}
