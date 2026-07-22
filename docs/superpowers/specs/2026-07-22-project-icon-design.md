# Nico Apple MCP Icon Design

## Goal

Create one recognizable mark for both the public project identity and the macOS Calendar helper. It must remain clear at favicon size while looking native beside other macOS app icons.

## Visual Design

Use a rounded square with a corner radius equal to 22% of its width. Its deep midnight background runs from `#263149` at the upper left to `#090D18` at the lower right. Place one white circular hub at the center and connect it to three colored circular nodes:

- red `#FF5F57` at the upper left for Calendar
- yellow `#FFD84A` at the upper right for Notes
- blue `#54A7FF` at the lower center for Contacts

Draw the connectors behind the nodes in soft white `#EAF0F8`. The hub diameter is 20% of the canvas; each app node diameter is 18%. Keep every node and connector inside the central 70% of the canvas so exports retain generous padding.

The three connections express the MCP server joining the Apple apps through one local bridge. The mark contains no text, letters, Apple logo, or copied Apple app glyphs. A restrained inner highlight and outer shadow may add depth at large sizes, but the core geometry and contrast must survive at 16–32 pixels.

## Source and Exports

Keep a deterministic SVG as the editable master. Generate and commit these derived assets:

- `assets/nico-apple-mcp.svg` — editable master and scalable project logo
- `assets/nico-apple-mcp.png` — 512×512 README and general-purpose image
- `assets/favicon-32.png` — 32×32 favicon image
- `assets/favicon.ico` — favicon containing 16×16, 32×32, and 48×48 images
- `src/helpers/NicoAppleMCPCalendarHelper.icns` — macOS helper icon containing 16, 32, 128, 256, 512, and 1024 pixel representations

Generated exports must preserve the same geometry and colors as the SVG. Do not use generated raster artwork as the source of truth.

## Integration

Show the project mark near the top of `README.md` without displacing the title or introduction. Add the `.icns` file to the Calendar helper bundle during `bun run build:swift`, and declare it through `CFBundleIconFile` in the helper Info.plist.

The icon changes only branding and bundle resources. It does not change server behavior, tools, permissions, or runtime interfaces.

## Verification

- Confirm all committed raster files have the specified dimensions and valid formats.
- Inspect the 512px and 32px renders for clean edges, centered geometry, and readable node separation.
- Confirm the `.icns` contains the expected macOS icon sizes.
- Run `bun run build:swift` and verify the built helper contains the icon resource and matching Info.plist entry.
- Run `bun run test` and `git diff --check`.

## Scope

Do not add a website, broader brand system, wordmark, animation, or alternate color themes. Keep the implementation limited to the approved mark, required exports, README placement, and helper integration.
