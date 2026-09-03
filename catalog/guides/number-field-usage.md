# NumberField

Use the Mux UI React NumberField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

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
