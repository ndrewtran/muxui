import { NumberField } from '@muxui/react';

export function SizingNumberFieldExample() {
  return (
    <div className="muxui-number-field-sizing-example">
      <style>{`
        .muxui-number-field-sizing-example {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .muxui-number-field-sizing-case {
          width: 100%;
        }

        .muxui-number-field-sizing-fixed {
          --muxui-component-number-field-width: 12rem;
        }

        .muxui-number-field-sizing-full {
          --muxui-component-number-field-width: 100%;
        }
      `}</style>
      <div className="muxui-number-field-sizing-case">
        <NumberField label="Default fit-content" defaultValue={1} />
      </div>
      <div className="muxui-number-field-sizing-case">
        <NumberField label="Fixed 12rem" defaultValue={1} className="muxui-number-field-sizing-fixed" />
      </div>
      <div className="muxui-number-field-sizing-case">
        <NumberField label="Full container width" defaultValue={1} className="muxui-number-field-sizing-full" />
      </div>
    </div>
  );
}
