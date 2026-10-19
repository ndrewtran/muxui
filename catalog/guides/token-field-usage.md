# TokenField usage

Use the Mux UI TokenField contract and provide an accessible name.

## In a form

Give TokenField a name to submit it. Each token is its own entry under that name, so read them with `FormData.getAll`; `FormData.get` returns only the first. The TokenField in a form example submits the tokens and resets them. The [Behavior](#behavior) section lists what an empty, disabled, or read-only field submits and what a reset restores.
