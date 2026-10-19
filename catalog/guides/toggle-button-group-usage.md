# ToggleButtonGroup usage

Use the Mux UI ToggleButtonGroup contract and provide an accessible name.

## Selection

Give each ToggleButton in the group a stable id. The group's selection is a list of those ids, passed as an array of strings, and its change callback reports the same kind of array. A single-selection group holds at most one id, and a multiple-selection group holds any number. Unlike the selection of other collections, it does not accept an all selection, and a selection mode other than single or multiple is rejected with an error. The Basic and Multiple selection ToggleButtonGroup examples show one array shape each.
