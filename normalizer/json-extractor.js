const { jsonrepair } = require("jsonrepair");
const partialJson = require("partial-json");
const bestEffortJson = require("best-effort-json-parser");

if (typeof bestEffortJson.disableErrorLogging === "function") {
  bestEffortJson.disableErrorLogging();
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripJsonNoise(value) {
  return String(value || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/``/g, "")
    .replace(/^\s*json\s*(?=\{)/i, "")
    .trim();
}

function extractBalancedJsonObject(value) {
  const text = String(value || "");
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function extractJsonObjectCandidate(value) {
  const text = String(value || "");
  const start = text.indexOf("{");
  if (start < 0) return "";
  const balanced = extractBalancedJsonObject(text);
  if (balanced) return balanced;
  return text.slice(start).trim();
}

function detectTruncation(value) {
  const text = String(value || "");
  const trimmed = text.trim();
  return {
    hasTruncationMarker: /\.\.\.\[truncated\s+\d+\s+chars\]/i.test(text),
    likelyIncompleteJson: Boolean(trimmed) && trimmed.includes("{") && !extractBalancedJsonObject(trimmed),
    endsAbruptly: /["[:,{[]\s*$/.test(trimmed),
    markerText: (text.match(/\.\.\.\[truncated\s+\d+\s+chars\]/i) || [""])[0]
  };
}

function objectSections(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function parseWithJsonRepair(candidate) {
  try {
    const repaired = jsonrepair(candidate);
    const parsed = tryParseJson(repaired);
    return parsed ? { parsed, repaired } : null;
  } catch {
    return null;
  }
}

function parseWithPartialJson(candidate) {
  try {
    const parsed = partialJson.parse(candidate, partialJson.Allow.ALL);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseWithBestEffort(candidate) {
  try {
    const parsed = bestEffortJson.parse(candidate);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildParseResult({ parsed, method, error = "", isPartial = false, repairedJson = "", partialJsonText = "", raw }) {
  const truncation = detectTruncation(raw);
  return {
    parsed,
    method,
    error,
    isPartial: Boolean(isPartial || truncation.hasTruncationMarker || truncation.likelyIncompleteJson),
    truncationDetected: Boolean(truncation.hasTruncationMarker || truncation.likelyIncompleteJson || truncation.endsAbruptly),
    truncationMarker: truncation.markerText,
    repairedJson,
    partialJson: partialJsonText,
    recoveredSections: objectSections(parsed)
  };
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return { parsed: null, method: "empty", error: "empty_output" };
  const candidates = [
    raw,
    stripJsonNoise(raw),
    extractJsonObjectCandidate(stripJsonNoise(raw)),
    extractJsonObjectCandidate(raw)
  ].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed) return buildParseResult({ parsed, method: "direct_json", raw });
    const balanced = extractBalancedJsonObject(candidate);
    if (balanced) {
      const balancedParsed = tryParseJson(balanced);
      if (balancedParsed) return buildParseResult({ parsed: balancedParsed, method: "balanced_json", raw });
    }
    const repaired = parseWithJsonRepair(candidate);
    if (repaired) {
      return buildParseResult({
        parsed: repaired.parsed,
        method: "jsonrepair",
        isPartial: detectTruncation(candidate).likelyIncompleteJson,
        repairedJson: repaired.repaired,
        raw
      });
    }
    const partialParsed = parseWithPartialJson(candidate);
    if (partialParsed) {
      return buildParseResult({
        parsed: partialParsed,
        method: "partial_json",
        isPartial: true,
        partialJsonText: JSON.stringify(partialParsed),
        raw
      });
    }
    const bestEffortParsed = parseWithBestEffort(candidate);
    if (bestEffortParsed) {
      return buildParseResult({
        parsed: bestEffortParsed,
        method: "best_effort_json",
        isPartial: true,
        partialJsonText: JSON.stringify(bestEffortParsed),
        raw
      });
    }
  }
  return buildParseResult({ parsed: null, method: "failed", error: "json_parse_failed", raw });
}

module.exports = {
  extractBalancedJsonObject,
  extractJsonObjectCandidate,
  parseJsonFromText,
  tryParseJson
};
