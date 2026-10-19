# InputTags usage

Give InputTags a label or an accessible name. The committed tags are its value. The text being typed is a separate draft that joins the value only when Enter adds it.

## Adding and rejecting tags

Enter trims the draft, adds it as a tag, and empties the input. Enter never submits a surrounding form. A draft is rejected, and nothing else happens, when it is blank, repeats an existing tag exactly (the comparison is case-sensitive), would go past the tag limit, or fails the validator. The rejected text stays in the input, no callback is called, and no message appears.

The validator receives the trimmed draft and returns whether to accept it. It runs after the blank, duplicate, and limit checks, so it is not called for those drafts. A message is the application's to show, through the invalid state and the error message, which replaces the description while the field is invalid. The Tag validation example rejects a malformed tag with a validator and shows a count against the limit.

An added tag calls the change callback with the full list and then the added callback with the new tag. A removed tag calls the change callback and then the removed callback.

## In a form

InputTags has no form input for its tags, and its draft input has no name, so a surrounding form does not submit them. Keep the tags in controlled state and send them when the form submits. Required adds an asterisk to the label and marks the field required; it does not check that the list has a tag, so the application does. The InputTags in a form example submits the tags and checks that the list is not empty. The [API reference](#api-reference) lists the props.
