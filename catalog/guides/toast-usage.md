# Toast usage

Wrap transient notifications in ToastProvider. Use useToast for event-driven notifications or mount Toast to enqueue one declarative notification.

## Provider and queue

Components that call useToast or mount Toast sit inside a ToastProvider, which renders the notification region and owns the queue. The provider also sets how many toasts are visible at once and where the region sits; the Toast keys and removal example shows both.

useToast returns a manager. Its add method enqueues a toast and returns the toast's key, and its remove method closes the toast with that key, so keep the key when the application needs to close the toast itself.

## Declarative toasts

Mounting Toast enqueues one notification, and a later change to what it shows updates that toast in place. The Toast updated in place example changes a mounted Toast from Saving to Saved.

## Timing

Duration is in milliseconds, and a duration of zero keeps the toast until the user dismisses it or the application removes it by key. The [Behavior](#behavior) section lists the duration limits, when timers pause, and what an update, a dismissal, and an unmount do.
