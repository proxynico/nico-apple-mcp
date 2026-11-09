#!/usr/bin/env swift
// Run from the repository root: swift scripts/build-icons.swift
// AppKit renders the SVG masters; no third-party image packages are needed.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assets = root.appendingPathComponent("assets")
let scratch = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: scratch) }

guard let logo = NSImage(contentsOf: assets.appendingPathComponent("nico-apple-mcp.svg")),
      let favicon = NSImage(contentsOf: assets.appendingPathComponent("favicon.svg")) else {
    fatalError("Run from the repository root; both SVG masters must exist.")
}

func render(_ image: NSImage, size: Int) -> Data {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    bitmap.size = NSSize(width: size, height: size)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}

try render(logo, size: 512).write(to: assets.appendingPathComponent("nico-apple-mcp.png"))
try render(favicon, size: 32).write(to: assets.appendingPathComponent("favicon-32.png"))

// ICO directory followed by PNG payloads. Offsets are from the start of the file.
func appendLE<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
}
let faviconSizes = [16, 32, 48]
let faviconImages = faviconSizes.map { render(favicon, size: $0) }
var ico = Data()
appendLE(UInt16(0), to: &ico)
appendLE(UInt16(1), to: &ico)
appendLE(UInt16(faviconSizes.count), to: &ico)
var offset = 6 + 16 * faviconSizes.count
for (size, png) in zip(faviconSizes, faviconImages) {
    ico.append(contentsOf: [UInt8(size), UInt8(size), 0, 0])
    appendLE(UInt16(1), to: &ico)
    appendLE(UInt16(32), to: &ico)
    appendLE(UInt32(png.count), to: &ico)
    appendLE(UInt32(offset), to: &ico)
    offset += png.count
}
for png in faviconImages { ico.append(png) }
try ico.write(to: assets.appendingPathComponent("favicon.ico"))

let iconset = scratch.appendingPathComponent("NicoAppleMCPCalendarHelper.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    // Small Finder icons use the same simplified mark as the favicon.
    for scale in [1, 2] {
        let master = size <= 32 ? favicon : logo
        let suffix = scale == 2 ? "@2x" : ""
        try render(master, size: size * scale).write(
            to: iconset.appendingPathComponent("icon_\(size)x\(size)\(suffix).png")
        )
    }
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o",
    root.appendingPathComponent("src/helpers/NicoAppleMCPCalendarHelper.icns").path]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else { fatalError("iconutil failed") }
print("Updated README logo, SVG/PNG/ICO favicons, and macOS helper icon.")
