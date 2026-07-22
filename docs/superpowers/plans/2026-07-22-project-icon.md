# Nico Apple MCP Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one approved Apple-app bridge mark for the project README, favicon use, and the macOS Calendar helper bundle.

**Architecture:** Keep a hand-authored SVG as the only editable source of truth. Rasterize it with macOS ImageIO through `sips`, because this machine's internal ImageMagick SVG renderer turns gradients black; use ImageMagick only to resize the correct master raster and assemble the ICO, then use `iconutil` for the ICNS. Treat asset presence and helper integration as identity contracts in the existing Bun test suite.

**Tech Stack:** SVG, macOS `sips` and `iconutil`, ImageMagick, Bun tests, Apple Info.plist, Swift helper build

## Global Constraints

- Use a 22%-radius rounded square with a `#263149` to `#090D18` midnight gradient.
- Use a white center hub connected to Calendar red `#FF5F57`, Notes yellow `#FFD84A`, and Contacts blue `#54A7FF` nodes.
- Use soft white `#EAF0F8` connectors behind the nodes.
- Include no text, letters, Apple logo, or copied Apple app glyphs in the mark.
- Keep `assets/nico-apple-mcp.svg` as the editable source of truth; derived exports must preserve its geometry and colors.
- Do not change server behavior, tools, permissions, runtime interfaces, or dependencies.
- Use Bun only for repository scripts and tests. Do not use npm or Yarn.

---

### Task 1: Create the vector master and derived icon assets

**Files:**
- Create: `assets/nico-apple-mcp.svg`
- Create: `assets/nico-apple-mcp.png`
- Create: `assets/favicon-32.png`
- Create: `assets/favicon.ico`
- Create: `src/helpers/NicoAppleMCPCalendarHelper.icns`
- Modify: `tests/identity.test.ts`

**Interfaces:**
- Consumes: The exact colors, geometry, and export sizes in the approved design spec.
- Produces: A 1024-unit SVG master, a 512×512 project PNG, a 32×32 favicon PNG, a 16/32/48px ICO, and a macOS ICNS with 16–1024px representations.

- [ ] **Step 1: Write the failing asset-contract test**

Add this test inside the existing `describe("Nico Apple MCP identity", ...)` block in `tests/identity.test.ts`:

```ts
  test("commits the approved project icon exports", async () => {
    const assetPaths = [
      "assets/nico-apple-mcp.svg",
      "assets/nico-apple-mcp.png",
      "assets/favicon-32.png",
      "assets/favicon.ico",
      "src/helpers/NicoAppleMCPCalendarHelper.icns",
    ];

    for (const assetPath of assetPaths) {
      const asset = Bun.file(`${ROOT}/${assetPath}`);
      expect(await asset.exists()).toBe(true);
      if (await asset.exists()) {
        expect(asset.size).toBeGreaterThan(100);
      }
    }

    const svg = await Bun.file(`${ROOT}/assets/nico-apple-mcp.svg`).text();
    expect(svg).toContain("#263149");
    expect(svg).toContain("#090D18");
    expect(svg).toContain("#FF5F57");
    expect(svg).toContain("#FFD84A");
    expect(svg).toContain("#54A7FF");
    expect(svg).not.toContain("<text");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test tests/identity.test.ts
```

Expected: FAIL because `assets/nico-apple-mcp.svg` and the derived exports do not exist.

- [ ] **Step 3: Create the SVG source of truth**

Create `assets/nico-apple-mcp.svg` with this exact content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
  <title id="title">Nico Apple MCP</title>
  <desc id="desc">Three colored Apple app nodes connected through one central MCP hub</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#263149"/>
      <stop offset="1" stop-color="#090D18"/>
    </linearGradient>
    <linearGradient id="highlight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".18"/>
      <stop offset=".42" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#02040A" flood-opacity=".34"/>
    </filter>
  </defs>
  <rect x="16" y="16" width="992" height="992" rx="225" fill="url(#background)" filter="url(#shadow)"/>
  <rect x="28" y="28" width="968" height="968" rx="213" fill="url(#highlight)"/>
  <g fill="none" stroke="#EAF0F8" stroke-width="52" stroke-linecap="round" opacity=".82">
    <path d="M 300 300 L 512 512"/>
    <path d="M 724 300 L 512 512"/>
    <path d="M 512 732 L 512 512"/>
  </g>
  <g stroke="#FFFFFF" stroke-opacity=".2" stroke-width="10">
    <circle cx="300" cy="300" r="92" fill="#FF5F57"/>
    <circle cx="724" cy="300" r="92" fill="#FFD84A"/>
    <circle cx="512" cy="732" r="92" fill="#54A7FF"/>
  </g>
  <circle cx="512" cy="512" r="102" fill="#FFFFFF"/>
</svg>
```

- [ ] **Step 4: Generate the PNG, ICO, and ICNS exports**

Run these commands from the repository root:

```bash
mkdir -p assets
icon_export_dir=$(mktemp -d)
sips -s format png assets/nico-apple-mcp.svg --out "$icon_export_dir/master.png"
magick "$icon_export_dir/master.png" -resize 512x512 assets/nico-apple-mcp.png
magick "$icon_export_dir/master.png" -resize 32x32 assets/favicon-32.png
magick "$icon_export_dir/master.png" -resize 16x16 "$icon_export_dir/favicon-16.png"
magick "$icon_export_dir/master.png" -resize 32x32 "$icon_export_dir/favicon-32.png"
magick "$icon_export_dir/master.png" -resize 48x48 "$icon_export_dir/favicon-48.png"
magick "$icon_export_dir/favicon-16.png" "$icon_export_dir/favicon-32.png" "$icon_export_dir/favicon-48.png" assets/favicon.ico
mkdir -p "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset"
magick "$icon_export_dir/master.png" -resize 16x16 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_16x16.png"
magick "$icon_export_dir/master.png" -resize 32x32 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_16x16@2x.png"
magick "$icon_export_dir/master.png" -resize 32x32 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_32x32.png"
magick "$icon_export_dir/master.png" -resize 64x64 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_32x32@2x.png"
magick "$icon_export_dir/master.png" -resize 128x128 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_128x128.png"
magick "$icon_export_dir/master.png" -resize 256x256 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_128x128@2x.png"
magick "$icon_export_dir/master.png" -resize 256x256 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_256x256.png"
magick "$icon_export_dir/master.png" -resize 512x512 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_256x256@2x.png"
magick "$icon_export_dir/master.png" -resize 512x512 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_512x512.png"
magick "$icon_export_dir/master.png" -resize 1024x1024 "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset/icon_512x512@2x.png"
iconutil -c icns "$icon_export_dir/NicoAppleMCPCalendarHelper.iconset" -o src/helpers/NicoAppleMCPCalendarHelper.icns
```

Expected: all five committed asset paths exist; ImageMagick reports no conversion errors; `iconutil` creates the ICNS.

- [ ] **Step 5: Verify formats and sizes**

Run:

```bash
magick identify assets/nico-apple-mcp.png assets/favicon-32.png assets/favicon.ico
icon_verify_dir=$(mktemp -d)
iconutil -c iconset src/helpers/NicoAppleMCPCalendarHelper.icns -o "$icon_verify_dir/NicoAppleMCPCalendarHelper.iconset"
find "$icon_verify_dir/NicoAppleMCPCalendarHelper.iconset" -type f -print | sort
```

Expected: the project PNG is 512×512, favicon PNG is 32×32, ICO lists 16×16, 32×32, and 48×48 frames, and the extracted iconset lists the ten standard 16–1024px files.

Open `assets/nico-apple-mcp.png` and `assets/favicon-32.png` with the image viewer. Confirm the three nodes remain separate, connectors are centered behind them, the rounded-square edges are clean, and no element is cropped.

- [ ] **Step 6: Run the focused test**

Run:

```bash
bun test tests/identity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the asset unit**

Run:

```bash
git add assets/nico-apple-mcp.svg assets/nico-apple-mcp.png assets/favicon-32.png assets/favicon.ico src/helpers/NicoAppleMCPCalendarHelper.icns tests/identity.test.ts
git commit -m "feat: add Nico Apple MCP icon assets"
```

### Task 2: Publish the mark and add it to the helper bundle

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `src/helpers/nico-apple-cal.Info.plist`
- Modify: `tests/identity.test.ts`

**Interfaces:**
- Consumes: `assets/nico-apple-mcp.png` and `src/helpers/NicoAppleMCPCalendarHelper.icns` from Task 1.
- Produces: A visible README mark and a built helper app whose Info.plist points to a copied ICNS resource.

- [ ] **Step 1: Write the failing integration test**

Add this test inside the existing identity `describe` block:

```ts
  test("publishes the icon in the README and Calendar helper bundle", async () => {
    const pkg = await Bun.file(`${ROOT}/package.json`).json();
    const plist = await Bun.file(`${ROOT}/src/helpers/nico-apple-cal.Info.plist`).text();
    const readme = await Bun.file(`${ROOT}/README.md`).text();

    expect(readme).toContain('src="assets/nico-apple-mcp.png"');
    expect(readme).toContain('alt="Nico Apple MCP icon"');
    expect(plist).toContain("<key>CFBundleIconFile</key>");
    expect(plist).toContain("<string>NicoAppleMCPCalendarHelper</string>");
    expect(pkg.scripts["build:swift"]).toContain("Contents/Resources");
    expect(pkg.scripts["build:swift"]).toContain("NicoAppleMCPCalendarHelper.icns");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test tests/identity.test.ts
```

Expected: FAIL because the README, Info.plist, and helper build do not reference the icon.

- [ ] **Step 3: Add the README mark**

Insert this block immediately after `# Nico Apple MCP` in `README.md`, preserving the existing introduction after it:

```html
<p align="center">
  <img src="assets/nico-apple-mcp.png" width="160" alt="Nico Apple MCP icon">
</p>
```

- [ ] **Step 4: Declare the helper icon**

Insert this key/value pair immediately after `CFBundleExecutable` in `src/helpers/nico-apple-cal.Info.plist`:

```xml
  <key>CFBundleIconFile</key>
  <string>NicoAppleMCPCalendarHelper</string>
```

- [ ] **Step 5: Copy the ICNS during the helper build**

Replace the existing `build:swift` value in `package.json` with:

```json
"build:swift": "mkdir -p src/helpers/NicoAppleMCPCalendarHelper.app/Contents/MacOS src/helpers/NicoAppleMCPCalendarHelper.app/Contents/Resources && swiftc -O src/helpers/nico-apple-cal.swift -o src/helpers/NicoAppleMCPCalendarHelper.app/Contents/MacOS/nico-apple-cal && cp src/helpers/nico-apple-cal.Info.plist src/helpers/NicoAppleMCPCalendarHelper.app/Contents/Info.plist && cp src/helpers/NicoAppleMCPCalendarHelper.icns src/helpers/NicoAppleMCPCalendarHelper.app/Contents/Resources/NicoAppleMCPCalendarHelper.icns && codesign --force --sign - --options runtime --entitlements src/helpers/nico-apple-cal.entitlements src/helpers/NicoAppleMCPCalendarHelper.app"
```

- [ ] **Step 6: Run the focused test and helper build**

Run:

```bash
bun test tests/identity.test.ts
bun run build:swift
test -f src/helpers/NicoAppleMCPCalendarHelper.app/Contents/Resources/NicoAppleMCPCalendarHelper.icns
plutil -extract CFBundleIconFile raw src/helpers/NicoAppleMCPCalendarHelper.app/Contents/Info.plist
codesign --verify --strict src/helpers/NicoAppleMCPCalendarHelper.app
```

Expected: the test passes; the helper builds and signs; the resource exists; `plutil` prints `NicoAppleMCPCalendarHelper`; `codesign` exits zero.

- [ ] **Step 7: Run repository verification**

Run:

```bash
bun run test
git diff --check
git status --short
```

Expected: all tests pass, the diff check is clean, and status contains only the intended README, package, plist, test, and icon changes plus the committed planning documents.

- [ ] **Step 8: Commit the integration unit**

Run:

```bash
git add README.md package.json src/helpers/nico-apple-cal.Info.plist tests/identity.test.ts
git commit -m "feat: integrate project icon"
```
