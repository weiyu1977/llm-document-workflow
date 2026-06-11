function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return { parsed: null, method: "empty", error: "empty_output" };
  const candidates = [
    raw,
    raw
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim(),
    raw
      .replace(/```(?:json)?/gi, "")
      .replace(/``/g, "")
      .replace(/^\s*json\s*(?=\{)/i, "")
      .trim()
  ];
  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed) return { parsed, method: "direct_json" };
    const balanced = extractBalancedJsonObject(candidate);
    if (balanced) {
      const balancedParsed = tryParseJson(balanced);
      if (balancedParsed) return { parsed: balancedParsed, method: "balanced_json" };
    }
  }
  return { parsed: null, method: "failed", error: "json_parse_failed" };
}

module.exports = {
  extractBalancedJsonObject,
  parseJsonFromText,
  tryParseJson
};
