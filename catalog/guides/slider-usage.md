# Slider usage

Give Slider an accessible name.

## Saving a value

The change callback follows the value while the thumb moves. The completion callback runs when an interaction ends, after a key press or when a drag is released, so it is where a value gets saved. It reports that an interaction finished, not that the value is new: it can repeat the value it last reported, for example when a key is pressed at the minimum or maximum, or when the thumb is pressed and released without moving. Compare the value with the last saved one before saving, as the Slider saving a value example does. Changing a controlled value from outside calls neither callback. The [API reference](#api-reference) lists the props Mux UI defines.
