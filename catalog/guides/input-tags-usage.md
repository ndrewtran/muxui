# InputTags usage

Give InputTags a label or an accessible name. The committed tags are its value, and the text being typed is a separate draft that joins the value only when Enter adds it.

## Adding and rejecting tags

A rejected draft stays in the input, no callback is called, and no message appears, so the application shows any message through the invalid state and the error message. The validator receives the trimmed draft and returns whether to accept it. The Tag validation example rejects a malformed tag and shows a count against the limit. The [Behavior](#behavior) section lists what is rejected, in what order, and which callbacks an added or removed tag calls.

## In a form

InputTags submits nothing with a surrounding form: the tags have no form input, and the draft input has no name. Keep the tags in controlled state and send them when the form submits. Required adds an asterisk and marks the field required, but it does not check the list, so the application does. The InputTags in a form example submits the tags and checks that the list is not empty. The [API reference](#api-reference) lists the props.
