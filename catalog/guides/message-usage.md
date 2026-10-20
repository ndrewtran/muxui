# Message usage

Use Message to show one turn of a conversation: its author, its content, and optional actions, sources, and follow-ups. The application supplies the content and updates it.

## Message or another family

- Use [PromptComposer](/components/prompt-composer/) to write the next message.
- Use [Toast](/components/toast/) for a short notice that is not part of a conversation.

## Sender and author

- `sender` is `user`, `assistant`, or `system`, and defaults to `assistant`. A `user` message shows its content in a filled bubble.
- `author` is any content shown above the message, such as You or Assistant.

## Content, actions, sources, and follow-ups

- Put the content in the children. For Markdown, compose the [Markdown](/components/markdown/) family inside, as the Basic React Message example does. Message itself imports no parser.
- `actions` are compact buttons, such as Helpful. Each has an `id`, a `label`, and `onAction`, and `pressed` makes it a toggle.
- `sources` list what a reply relied on, each with a `label` and `href`. A count button opens the list, and only `http`, `https`, and relative links are kept as links.
- `followUps` suggest next messages. Choosing one reports it to `onFollowUp` and sends nothing, so put its label into the composer, as the Conversation React Message example does.

## Streaming

`streaming` only adds the status text in `streamingLabel`. The application updates the children as content arrives and clears `streaming` when it ends. Message makes no request, scrolls nothing, and moves no focus.

## Common mistake

Passing `followUps` without `onFollowUp`. The follow-up buttons render only when the handler exists, so they silently do not appear.
