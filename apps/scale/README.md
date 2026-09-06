# Mux UI Scale

Private local authoring app for Mux UI themes. It uses the shared typed token
authoring and compiler APIs, so saved themes remain reusable by web and future
native projections.

Run it from the repository root with:

```sh
pnpm --filter @muxui/scale dev
```

The development server binds to `127.0.0.1:5174`. Saving a theme writes a
validated source document to `catalog/tokens/themes/<slug>.json` through the
local authoring endpoint. The endpoint is development-only and accepts writes
from that exact origin.
