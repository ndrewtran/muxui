# Slider usage

Give Slider an accessible name.

## Slider or NumberField

- Use Slider to choose an approximate value along a bounded range, such as volume, where position matters more than the exact number.
- Use [NumberField](/components/number-field/) to enter or step a precise number, such as a quantity.

## Content

- Name the Slider with what it adjusts, such as Volume. It shows its current value beside the name, so leave the number out of the name.
- Set `min`, `max`, and `step` so every position along the track is a value worth choosing.

## Saving a value

The change callback follows the value while the thumb moves. The completion callback runs when an interaction ends, after a key press or when a drag is released, so it is where a value gets saved. It reports that an interaction finished, not that the value is new: it can repeat the value it last reported, for example when a key is pressed at the minimum or maximum, or when the thumb is pressed and released without moving. Compare the value with the last saved one before saving, as the Slider saving a value example does. Changing a controlled value from outside calls neither callback. The [API reference](#api-reference) lists the props Mux UI defines.

## Common mistake

Saving from the change callback. It runs at every step while the thumb moves, so save from the completion callback instead.
