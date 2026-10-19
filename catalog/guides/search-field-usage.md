# SearchField

Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Submit and clear

Enter submits the current text. Escape, or the clear button, empties a field that has text, reporting the empty string and then the clear. The SearchField submit and clear example shows what each callback receives. A native keydown handler passed through the input props runs first, so calling `preventDefault` in it stops Enter or Escape from submitting or clearing, as the SearchField cancelling a shortcut example shows. Neither key acts while an input method composition is in progress. The [API reference](#api-reference) lists the props Mux UI defines.
