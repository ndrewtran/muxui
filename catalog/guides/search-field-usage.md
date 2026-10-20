# SearchField

Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## SearchField or Autocomplete

- Use SearchField to enter a query that the application runs, against a local list or a server.
- Use [Autocomplete](/components/autocomplete/) when the user should pick from suggestions as they type.

## Filtering or searching

SearchField reports the text as it changes and when Enter is pressed. Choose by what a result costs.

- Filter on every change when the results are already in memory and cheap to compute, such as a local list. The SearchField filtering a list example narrows a list as the user types.
- Search on Enter when each search is a request, such as a call to a server. Run it in the submit callback so typing sends nothing. The SearchField searching on Enter example shows it.
- SearchField keeps no request state. The application tracks whether a request is running and what it returned.

## Submit and clear

Enter submits the current text. Escape, or the clear button, empties a field that has text, reporting the empty string and then the clear. The SearchField submit and clear example shows what each callback receives. A native keydown handler passed through the input props runs first, so calling `preventDefault` in it stops Enter or Escape from submitting or clearing, as the SearchField cancelling a shortcut example shows. Neither key acts while an input method composition is in progress. The [API reference](#api-reference) lists the props Mux UI defines.

## Content

- Name what is searched, such as Search projects, so the scope is clear without a placeholder.
- When Enter starts the search, say so in the description, such as Press Enter to search.

## Common mistake

Leaving results on screen after the field is emptied. Escape and the clear button report `onClear`, but deleting the text by hand reports only `onChange`, and none of them submits. Reset the results and any pending request when `onChange` receives an empty string, as the searching on Enter example does.
