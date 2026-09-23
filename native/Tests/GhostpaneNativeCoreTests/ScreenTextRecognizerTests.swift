import CoreGraphics
import CoreText
import Foundation
import ImageIO
import XCTest
@testable import GhostpaneNativeCore

final class ScreenTextRecognizerTests: XCTestCase {
    /// Draws black text on white at points measured from the TOP-left, like a screen.
    private func renderPNG(
        _ lines: [(String, CGPoint)],
        font fontName: String = "Helvetica",
        pointSize: CGFloat = 36,
        size: CGSize = CGSize(width: 1200, height: 800)
    ) throws -> URL {
        let context = try XCTUnwrap(CGContext(
            data: nil, width: Int(size.width), height: Int(size.height),
            bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(origin: .zero, size: size))
        let font = CTFontCreateWithName(fontName as CFString, pointSize, nil)
        for (text, point) in lines {
            let attributed = NSAttributedString(string: text, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1)
            ])
            context.textPosition = CGPoint(x: point.x, y: size.height - point.y)
            CTLineDraw(CTLineCreateWithAttributedString(attributed), context)
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ocr-\(UUID().uuidString).png")
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil))
        CGImageDestinationAddImage(destination, try XCTUnwrap(context.makeImage()), nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testReadsTextFromAnImage() throws {
        let url = try renderPNG([("Longest Substring", CGPoint(x: 80, y: 120))])
        let lines = try ScreenTextRecognizer.recognize(url: url)

        XCTAssertTrue(lines.contains { $0.text.contains("Longest Substring") }, "\(lines)")
    }

    func testReportsPositionsFromTheTopLeftAsFractionsOfTheImage() throws {
        let url = try renderPNG([("Upper line", CGPoint(x: 80, y: 120)), ("Lower line", CGPoint(x: 600, y: 600))])
        let lines = try ScreenTextRecognizer.recognize(url: url)
        let upper = try XCTUnwrap(lines.first { $0.text.contains("Upper") })
        let lower = try XCTUnwrap(lines.first { $0.text.contains("Lower") })

        XCTAssertLessThan(upper.y, lower.y, "top of the screen must have the smaller y")
        XCTAssertLessThan(upper.x, lower.x)
        for line in lines {
            XCTAssertTrue((0...1).contains(line.x) && (0...1).contains(line.y), "\(line)")
            XCTAssertGreaterThan(line.width, 0)
            XCTAssertGreaterThan(line.height, 0)
        }
    }

    func testKeepsCodeLiteralsExactlyAsWritten() throws {
        // With language correction on, Vision rewrites this as "[2,7,11, 15]". It only
        // does so at this font, size and canvas; change them and the test stops guarding
        // usesLanguageCorrection (verified by flipping the flag).
        let url = try renderPNG(
            [("nums = [2,7,11,15]", CGPoint(x: 40, y: 120))],
            font: "Menlo", pointSize: 34, size: CGSize(width: 1400, height: 200)
        )
        let text = try ScreenTextRecognizer.recognize(url: url).map(\.text).joined(separator: " ")

        XCTAssertTrue(text.contains("[2,7,11,15]"), text)
    }

    func testRejectsAFileThatIsNotAnImage() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("not-an-image-\(UUID().uuidString).png")
        try Data("hello".utf8).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }

        XCTAssertThrowsError(try ScreenTextRecognizer.recognize(url: url))
    }
}
