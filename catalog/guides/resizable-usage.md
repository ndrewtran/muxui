# Resizable usage

Use Resizable to let people resize adjacent panels. Panel sizes are percentages of the container.

## Composition

Resizable's children alternate Panel, Handle, Panel, with a Panel at each end. Each Handle names the Panels on either side of it and has its own accessible name, and every Panel and Handle has a unique id. Panels can set minimum and maximum sizes, which must leave room for all the panels to add up to 100 percent. The Resizable with three panels example has two handles and bounds on each panel.

## Invalid layouts

Resizable does not throw for a layout it cannot use. An invalid composition or configuration marks the root and its panels as invalid and disables every handle, so check the composition when a handle does not respond. A controlled layout must give a size for every panel, within its bounds, adding up to 100. A default layout that does not is adjusted instead.

## Container size

A horizontal Resizable fills the width of its container. A vertical one fills the height of its container, so give that container a height, as the example does.
