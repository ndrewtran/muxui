import { useRef, useState } from 'react';
import { Select } from '@muxui/react';

export function CustomTriggerSelectExample() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [lastKey, setLastKey] = useState('');
  return <>
    <Select label="City" name="city" items={['Melbourne', 'Sydney']}
      trigger={<button ref={triggerRef} onKeyDown={(event) => setLastKey(event.key)}><Select.Value /></button>} />
    <output>{lastKey}</output>
  </>;
}
