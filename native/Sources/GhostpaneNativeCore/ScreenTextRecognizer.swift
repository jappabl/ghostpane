import CoreGraphics
import Foundation
import ImageIO
import Vision

public enum ScreenTextError: LocalizedError {
    case unreadableImage

    public var errorDescription: String? {
        "The screenshot could not be opened for text recognition."
    }
}

/// Reads the text in a screenshot on-device with the Vision framework, so a
/// model that cannot see images can still answer about the screen.
public enum ScreenTextRecognizer {
    public static func recognize(url: URL) throws -> [TextLine] {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw ScreenTextError.unreadableImage
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // Screens are full of code and identifiers. Correcting them toward
        // dictionary words corrupts exactly the text the user is asking about.
        request.usesLanguageCorrection = false
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])

        return (request.results ?? []).compactMap { observation in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let box = observation.boundingBox // normalised, origin at the bottom-left
            return TextLine(
                text: candidate.string,
                x: box.minX,
                y: 1 - box.maxY,
                width: box.width,
                height: box.height
            )
        }
    }
}
