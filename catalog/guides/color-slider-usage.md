# ColorSlider usage

Give each slider a distinct accessible label and a Mux UI color value.

## ColorSlider or ColorWheel

Neither is the default. Choose by the layout and the task.

- Use ColorSlider for compact channel editing. A straight track fits a row or a column.
- A slider edits any one channel: hue, saturation, lightness, brightness, red, green, blue, or alpha.
- Use [ColorWheel](/components/color-wheel/) when circular hue exploration helps, such as choosing a theme color where related hues sit side by side. It edits hue only.
- For saturation and brightness together, use [ColorArea](/components/color-area/).
- A slider with `colorSpace` set returns colors in that space, and a wheel returns colors in the space of its value.
- The Basic ColorSlider example sets `hsl`, so it returns `hsla()` for a hex value, where a wheel would return `rgba()`.

## Content

- Label each slider by its channel, such as Hue or Opacity.
- Set `colorSpace` when the channel is not part of the value's own space. A hue slider on a hex value needs `hsl` or `hsb`.

## Common mistake

Choosing a channel the color space does not have, such as `hue` on a hex or rgb value with no `colorSpace`. The slider throws a TypeError, so set `colorSpace` to a space that has the channel.
