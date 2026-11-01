// Значки Recallo: Mobile из build/icon-mobile.svg: 180 (apple-touch-icon), 192 и 512 px для манифеста.
// Запуск: swift scripts/render-mobile-icons.swift (рисует системный движок SVG macOS, без сторонних пакетов).
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let svg = root.appendingPathComponent("build/icon-mobile.svg")
let outDir = root.appendingPathComponent("src/mobile/public/icons")
guard let image = NSImage(contentsOf: svg) else { fatalError("Cannot read \(svg.path)") }

for (size, name) in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")] {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent(name))
  print("wrote \(name)")
}
