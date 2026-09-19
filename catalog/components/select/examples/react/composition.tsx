import { useRef, useState } from 'react';
import { Select } from '@muxui/react';

export function CompoundSelectExample() {
  const [value, setValue] = useState<string | undefined>('melbourne');
  return <Select.Root name="city" value={value} onChange={setValue} modal={false}>
    <Select.Label>City</Select.Label>
    <Select.Trigger><Select.Value /></Select.Trigger>
    <Select.Popup placement="bottom-start">
      <Select.List>
        <Select.Item id="melbourne" textValue="Melbourne"><strong>Melbourne</strong></Select.Item>
        <Select.Item id="sydney" textValue="Sydney"><strong>Sydney</strong></Select.Item>
        <Select.Item id="perth" disabled>Perth</Select.Item>
      </Select.List>
    </Select.Popup>
    <Select.Description>Choose your nearest city.</Select.Description>
    <Select.Error>Choose a city.</Select.Error>
  </Select.Root>;
}

export function NativeSelectTriggerExample() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [lastKey, setLastKey] = useState('');
  return <>
    <Select label="City" name="city" items={['Melbourne', 'Sydney']}
      trigger={<button ref={triggerRef} onKeyDown={(event) => setLastKey(event.key)}><Select.Value /></button>} />
    <output>{lastKey}</output>
  </>;
}
