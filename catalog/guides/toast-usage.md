# Toast usage

Wrap transient notifications in ToastProvider. Use useToast for event-driven notifications or mount Toast to enqueue one declarative notification.

## What belongs in a toast

- Use a toast for a discrete result the user can miss without harm, such as Saved or Export ready.
- Keep work that is still running beside the control that started it, such as the `pending` state of a [Button](/components/button/) or a [ProgressBar](/components/progress-bar/).
- Keep a failure the user must act on beside its source, with the error text and a way to retry.
- Skip a toast for routine updates, such as every autosave.

The Toast result and inline failure example compares the two on one Save Button. A finished save adds a success toast, a failed save leaves its error and a Try again Button beside Save, and the pending state sits on the Button.

## Variants

Choose the variant from what happened. A variant changes how the toast looks, not how long it stays.

- `neutral` is the default, for information.
- `success` is for a completed action.
- `warning` is for something the user may want to check.
- `danger` is for a failure.

## Content

- Write the message as the result in one short sentence, such as Report exported.
- Add a title only to say what the message is about, such as Export.

## Common mistake

Reporting a failure the user must act on only in a toast. It leaves after its duration, and the error text and the way to retry leave with it. Show the error beside the control that failed, and add a toast only if a short note helps.

## Provider and queue

Components that call useToast or mount Toast sit inside a ToastProvider, which renders the notification region and owns the queue. The provider takes these props.

- `maxVisible` is how many toasts show at once. It defaults to 5, and it is read when the provider first mounts, so a later change has no effect.
- `placement` is the viewport corner of the region: `top-start`, `top-end`, `bottom-start`, or `bottom-end`. It defaults to `top-end`.
- `className` styles the region.

useToast returns a manager. Its add method takes a message and the options `title`, `variant`, `duration`, `onDismiss`, and `className`, enqueues a toast, and returns the toast's key. Its remove method closes the toast with that key, so keep the key when the application needs to close the toast itself. The Toast keys and removal example sets both provider props, keeps a pending export on its Button, and removes the finished result's toast by its key.

## Declarative toasts

Mounting Toast enqueues one notification, and it is meant for a result that has already happened. A later render that changes its message, title, variant, or className updates the visible toast in place: the content inside the toast that is already shown changes, and no new toast element appears. The update does not restart the timer and does not call `onDismiss`. The Toast updated in place example shows a second Save updating the first result, with the pending state on the Save Button instead of in a toast.

## Timing

Duration is in milliseconds, and it defaults to 5000. A duration of zero keeps the toast until the user dismisses it or the application removes it by key. The largest supported duration is 2147483647 ms, about 24.8 days. A larger duration, a negative one, or one that is not finite throws a TypeError, and no toast is added. The [Behavior](#behavior) section lists when timers pause and what an update, a dismissal, and an unmount do.
