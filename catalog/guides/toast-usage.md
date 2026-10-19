# Toast usage

Wrap transient notifications in ToastProvider. Use useToast for event-driven notifications or mount Toast to enqueue one declarative notification.

## Provider and queue

ToastProvider renders the notification region and owns the queue, so every component that calls useToast or mounts Toast sits inside one. The provider also sets how many toasts are visible at once and where the region sits, and the Toast keys and removal example shows both. The visible count is read when the provider first mounts, so changing it later has no effect.

useToast returns a manager with two methods. Calling add with a message, and optionally the same options a declarative Toast takes, enqueues a toast and returns its key. Calling remove with that key closes the toast. Keep the key when the application needs to close the toast itself.

## Declarative toasts

Mounting Toast enqueues one notification, and unmounting it removes the notification without calling its dismissal callback. While it stays mounted, a change to what it shows updates the visible toast in place, with no new toast and no timer reset, and a change to its duration replaces it. The Toast updated in place example changes a mounted Toast from Saving to Saved.

## Timing

Duration is in milliseconds. A duration of zero sets no expiry timer, so that toast stays until the user dismisses it or the application removes it by key. The [Behavior](#behavior) section lists the duration and visibility limits and when timers pause.
