# RadioGroup usage

Give RadioGroup an accessible name.

## RadioField options

A RadioGroup takes its options either as a list or as children, never both. RadioField options go in as children. Each one needs the group as its parent, and the group supplies the selected value, the change callback, and the size. A RadioField also carries its own description and error parts. The RadioGroup with RadioField options example shows two options in a controlled group, and the RadioField page shows the error and disabled states. The [API reference](#api-reference) lists the props Mux UI defines.
