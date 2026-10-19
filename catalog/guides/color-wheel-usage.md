# ColorWheel usage

Give ColorWheel a label and a valid Mux UI color string.

## Radius

`outerRadius` and `innerRadius` are in pixels, and the wheel is twice its outer radius wide and tall. Both must be finite numbers of zero or more, and `innerRadius` must be less than `outerRadius`. ColorWheel throws a TypeError for a pair that breaks these rules; it does not clamp them. The ColorWheel with a custom radius example uses a valid pair.
