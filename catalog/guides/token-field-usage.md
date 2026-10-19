# TokenField usage

Use the Mux UI TokenField contract and provide an accessible name.

## In a form

Give TokenField a name to submit it with a form. Each token is its own entry under that name, so read them with `FormData.getAll`; `FormData.get` returns only the first. An empty field submits no entry. A disabled field submits no tokens, and a read-only field still submits its tokens. Text that has not been turned into a token with Enter is not submitted.

Resetting the form restores an uncontrolled field to the tokens it had when it mounted and clears any draft text; a later change to its default tokens does not replace that starting point. A controlled field is not changed by a reset, so the application restores it. The TokenField in a form example submits the tokens and resets them.
