const fs = require("node:fs");
const path = require("node:path");

function createGeminiProvider(deps) {
  const google = deps.google || {};
  const extractText = deps.extractText || ((json) => json?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "");
  const fetchJson = deps.fetchJson || postJson;
  return {
    id: "gemini",
    name: "Google Gemini",
    supportsPdf: true,
    supportsText: true,
    status: "implemented",
    async generate({ files = [], text = "", prompt = "", workflow = {}, mode = "analysis" }) {
      const apiKey = await maybeCall(google.apiKey, { workflow });
      const projectId = apiKey ? "" : await maybeCall(google.projectId, { workflow });
      if (!apiKey && !projectId) throw new Error("missing_gemini_credentials");
      const location = apiKey ? "" : await maybeCall(google.location, { workflow });
      const model = workflow.model || await maybeCall(google.model, { workflow }) || "gemini-2.5-flash";
      const parts = [{ text: prompt }];
      files.forEach((file) => {
        const ext = path.extname(file.originalname || file.name || "").toLowerCase();
        const mimeType = file.mimetype || file.mimeType || (ext === ".pdf" ? "application/pdf" : "text/plain");
        if (String(mimeType).includes("pdf") || ext === ".pdf") {
          parts.push({ inlineData: { mimeType: "application/pdf", data: fs.readFileSync(file.path).toString("base64") } });
        } else {
          parts.push({ text: fs.readFileSync(file.path, "utf8") });
        }
      });
      if (text) parts.push({ text: String(text) });
      const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: Number(workflow.temperature ?? 0.1),
          maxOutputTokens: Number(workflow.maxOutputTokens || 8192),
          thinkingConfig: { thinkingBudget: Number(workflow.thinkingBudget || 0) }
        }
      };
      const timeoutMs = Number(workflow.timeoutMs || 90000);
      const result = apiKey
        ? await fetchJson(geminiDeveloperUrl(model, "generateContent"), payload, timeoutMs, { "x-goog-api-key": apiKey })
        : await fetchWithVertexAdc(google, vertexGeminiUrl({ projectId, location, model, method: "generateContent" }), payload, timeoutMs);
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Gemini HTTP ${result.statusCode}: ${String(result.body || "").slice(0, 500)}`);
      }
      const rawText = extractText(result.json);
      const authMode = apiKey ? "developer-api-key" : "vertex-ai-adc";
      return {
        providerId: "gemini",
        mode: mode === "repair" ? `${authMode}-repair` : `${authMode}-document-analysis`,
        model,
        location,
        statusCode: result.statusCode,
        finishReason: result.json?.candidates?.[0]?.finishReason || "",
        rawText,
        rawJson: result.json
      };
    }
  };
}

async function fetchWithVertexAdc(google, url, payload, timeoutMs) {
  if (typeof google.fetchJsonWithAdc !== "function") {
    throw new Error("missing_vertex_adc_transport");
  }
  return google.fetchJsonWithAdc(url, payload, timeoutMs);
}

function vertexGeminiUrl({ projectId, location, model, method }) {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:${method}`;
}

function geminiDeveloperUrl(model, method) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`;
}

async function maybeCall(fn, arg) {
  return typeof fn === "function" ? String(await fn(arg) || "").trim() : "";
}

async function postJson(url, payload, timeoutMs, headers = {}) {
  if (typeof fetch !== "function") throw new Error("global_fetch_unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 90000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.text();
    return {
      statusCode: response.status,
      body,
      json: safeJson(body)
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

module.exports = {
  createGeminiProvider
};
