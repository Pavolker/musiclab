#!/usr/bin/swift

import AVFoundation
import Foundation

struct TrackSelection: Encodable {
    let title: String
    let source: String
    let output: String
}

struct ConversionReport: Encodable {
    let createdAt: String
    let outputDirectory: String
    let totalTracks: Int
    let tracks: [TrackSelection]
}

let sourceExtensions = Set(["aif", "aiff", "wav", "mp3"])
let preferredOrder = ["aif", "aiff", "wav", "mp3"]

func normalizedTitle(for url: URL) -> String {
    let stem = url.deletingPathExtension().lastPathComponent
    let trimmed = stem.trimmingCharacters(in: .whitespacesAndNewlines)
    let collapsed = trimmed.replacingOccurrences(
        of: #"\s+"#,
        with: " ",
        options: .regularExpression
    )
    return collapsed
}

func slugify(_ title: String) -> String {
    let lower = title.lowercased()
    let latin = lower.folding(options: .diacriticInsensitive, locale: .current)
    let slug = latin.replacingOccurrences(
        of: #"[^a-z0-9]+"#,
        with: "-",
        options: .regularExpression
    )
    return slug.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
}

func preferredFile(_ lhs: URL, _ rhs: URL) -> URL {
    let leftExt = lhs.pathExtension.lowercased()
    let rightExt = rhs.pathExtension.lowercased()
    let leftIndex = preferredOrder.firstIndex(of: leftExt) ?? preferredOrder.count
    let rightIndex = preferredOrder.firstIndex(of: rightExt) ?? preferredOrder.count

    if leftIndex != rightIndex {
        return leftIndex < rightIndex ? lhs : rhs
    }

    let leftSize = (try? lhs.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    let rightSize = (try? rhs.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    return leftSize >= rightSize ? lhs : rhs
}

func exportTrack(inputURL: URL, outputURL: URL) throws {
    let asset = AVURLAsset(url: inputURL)
    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        throw NSError(domain: "convert_audio", code: 10, userInfo: [
            NSLocalizedDescriptionKey: "Nao foi possivel criar export session para \(inputURL.lastPathComponent)"
        ])
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .m4a
    exportSession.shouldOptimizeForNetworkUse = true

    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?

    exportSession.exportAsynchronously {
        exportError = exportSession.error
        semaphore.signal()
    }

    semaphore.wait()

    if let exportError {
        throw exportError
    }

    if exportSession.status != .completed {
        throw NSError(domain: "convert_audio", code: 11, userInfo: [
            NSLocalizedDescriptionKey: "Exportacao incompleta para \(inputURL.lastPathComponent): \(exportSession.status.rawValue)"
        ])
    }
}

let fileManager = FileManager.default
let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let outputDirectory = currentDirectory.appendingPathComponent("web-audio", isDirectory: true)

try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let sourceURLs = try fileManager.contentsOfDirectory(
    at: currentDirectory,
    includingPropertiesForKeys: [.fileSizeKey],
    options: [.skipsHiddenFiles]
).filter { url in
    sourceExtensions.contains(url.pathExtension.lowercased())
}

var selectedByTitle: [String: URL] = [:]

for url in sourceURLs {
    let title = normalizedTitle(for: url)
    if let existing = selectedByTitle[title] {
        selectedByTitle[title] = preferredFile(existing, url)
    } else {
        selectedByTitle[title] = url
    }
}

let sortedSelections = selectedByTitle.keys.sorted().compactMap { title -> (String, URL)? in
    guard let url = selectedByTitle[title] else { return nil }
    return (title, url)
}

var usedSlugs = Set<String>()
var reportTracks: [TrackSelection] = []

for (title, inputURL) in sortedSelections {
    var slug = slugify(title)
    if slug.isEmpty {
        slug = "faixa"
    }

    let baseSlug = slug
    var suffix = 2
    while usedSlugs.contains(slug) {
        slug = "\(baseSlug)-\(suffix)"
        suffix += 1
    }
    usedSlugs.insert(slug)

    let outputURL = outputDirectory.appendingPathComponent("\(slug).m4a")
    if fileManager.fileExists(atPath: outputURL.path) {
        try fileManager.removeItem(at: outputURL)
    }

    print("Convertendo: \(inputURL.lastPathComponent) -> web-audio/\(outputURL.lastPathComponent)")
    try exportTrack(inputURL: inputURL, outputURL: outputURL)

    reportTracks.append(
        TrackSelection(
            title: title,
            source: inputURL.lastPathComponent,
            output: outputURL.lastPathComponent
        )
    )
}

let isoFormatter = ISO8601DateFormatter()
isoFormatter.formatOptions = [.withInternetDateTime]

let report = ConversionReport(
    createdAt: isoFormatter.string(from: Date()),
    outputDirectory: outputDirectory.lastPathComponent,
    totalTracks: reportTracks.count,
    tracks: reportTracks
)

let reportURL = currentDirectory.appendingPathComponent("conversion-report.json")
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
let reportData = try encoder.encode(report)
try reportData.write(to: reportURL)

print("Concluido: \(reportTracks.count) faixas em web-audio/")
print("Relatorio: conversion-report.json")
