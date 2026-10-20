# Avatar usage

Use Avatar for a compact picture of a person or workspace. `Avatar.Image` shows the picture, and `Avatar.Fallback` shows its content while there is no picture.

## Choosing fallback content

The fallback stays visible while the image loads, when no source is given, and after the image fails.

- Use a short, identity-derived fallback where it is meaningful, such as AB for a person or WS for a workspace.
- Use a generic glyph, such as a person silhouette, when no useful abbreviation exists, such as for an unnamed guest.
- Write the abbreviation in the person's own script. One character can be enough, as in 田 for 田中 太郎.
- Write each string in your own code. Avatar does not derive an abbreviation from a name.

The Avatar fallbacks example shows Latin, Cyrillic, and Japanese abbreviations, a workspace, and a glyph. The Basic React Avatar example pairs an image with its fallback.

## Content

- Give `Avatar.Image` an `alt` that names the person for an informative avatar, and `alt=""` for a decorative one, such as an avatar beside the person's visible name.
- Keep the fallback to one or two characters, or to one glyph. The avatar is a small round surface.
- For a picture that is not a person or workspace, use [Image](/components/image/).

## Common mistake

Putting a full name in the fallback. The round surface clips what does not fit, so the name is cut off. Use an abbreviation, or a generic glyph when there is none.
