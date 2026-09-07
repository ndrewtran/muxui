---
id: muxui:guide:discovery
---

# Discovery & CLI

Mux UI's catalog is the source for component discovery, API retrieval, and
example selection. The CLI is a read-only projection of the generated command
registry and query API.

## Inspect the catalog

Use the generated CLI surface to inspect the available records and exact
component facts:

```sh
muxui manifest --json
muxui list component --platform web.react --json
muxui search button --platform web.react --json
muxui get muxui:component:button --platform web.react --json
```

The component list is the source for supported page inventory. Use an exact
artifact reference for API, accessibility, token, relation, and example
details. Example source is selected from the returned record and remains tied
to its declared binding.

## Current availability

The catalog query baseline is experimental and read-only. Composition planning,
consumer-project mutation, and hosted latest guidance are outside the current
product boundary.
