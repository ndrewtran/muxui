# NumberField

Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

NumberField uses fit-content width by default. To choose a fixed or container width, pass a `className` and set the `--muxui-component-number-field-width` custom property in that class:

```css
.quantity-field-fixed {
  --muxui-component-number-field-width: 12rem;
}

.quantity-field-full {
  --muxui-component-number-field-width: 100%;
}
```

```tsx
<NumberField label="Quantity" className="quantity-field-full" />
```

The sizing hook is CSS-owned. There is no `width` React prop.

## Formatting and bounds

Formatting options change only the displayed text: the field reports and submits plain numbers. A typed value is kept between the minimum and maximum and rounded to the nearest step when it is committed. NumberField formats and parses numbers in the browser's locale and has no locale prop, so the same value can read 1,234.50 in one locale and 1.234,50 in another while the field reports the same number. The NumberField formatting and bounds example shows a currency field with a decimal step and bounds.

## Empty value

Clearing the field and leaving it reports `NaN`, not `0` and not `null`. Keep that number in state to keep the field empty, and test for it with `Number.isNaN`. A named field that is empty submits an empty string. `JSON.stringify(NaN)` gives `null`, so choose any saved representation yourself. The [API reference](#api-reference) lists the props Mux UI defines.
