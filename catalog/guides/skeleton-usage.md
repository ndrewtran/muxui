# Skeleton usage

Use Skeleton to hold the place of content while it loads. `Skeleton.Root` is the group and its one loading status, and `Skeleton.Line`, `Skeleton.Circle` and `Skeleton.Block` are the shapes inside it.

## Shaping the placeholder

- Build the placeholder in the markup the content will use, with a shape where each piece of text or media will go, so the page does not move when the content arrives.
- A `Skeleton.Line` is one line of the text around it: put it inside the element that will hold the text, such as a heading or a paragraph, and it takes that element's line height.
- Give a line a `width` near the length of the text it stands for, and make the last line of a paragraph shorter.
- Use `Skeleton.Circle` for an avatar or icon, at the size of the [Avatar](/components/avatar/) it stands for, and `Skeleton.Block` for media, by its height or aspect ratio.
- Keep layouts for particular screens in your own code. Skeleton gives the shapes and the group, not the layout.

## Loading status

- Use one `Skeleton.Root` for each region that loads on its own, and give it a `label` that says what is loading, such as Loading comments. It is read as one status, and the shapes are hidden.
- Put only shapes and layout inside the group. Text inside it becomes part of the status.
- Replace the whole group with the content when it has loaded.
- For a task whose progress is known, use [ProgressBar](/components/progress-bar/) instead.

## Motion

- Each group paints one soft sweep across all its shapes. It moves by transform only and runs only while the group is on the page.
- Under reduced motion, from the system setting or a reduced motion scope set on the page, there is no sweep and the shapes stay still.
- Under forced colours each shape shows as an outline and there is no sweep.
- The server renders the shapes without the sweep, and the sweep starts once the shapes are measured after hydration.

The Basic React Skeleton example holds the place of a post: a circle and a name, two lines of text and a media block.

## Common mistake

Giving every shape, or every row, its own `Skeleton.Root`. Each group is a separate status and a separate sweep, so a list of them is read many times and sweeps out of step. Wrap the list in one group.
