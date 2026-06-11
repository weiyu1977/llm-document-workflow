const fs = require("node:fs");
const path = require("node:path");

function createGeminiProvider(deps) {
  const google = deps.google || {};
  const extractText = deps.extractText || ((json) => json?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "");
  return {
    id: "gemini",
    name: "Google Gemini via Vertex AI ADC",
    supportsPdf: true,
    supportsText: true,
    status: "implemented",
    async generate({ files = [], text = "", prompt = "", workflow = {}, mode = "analysis" }) {
      const projectId = await google.projectId({ workflow });
      if (!projectId) throw new Error("missing_google_project");
      const location = google.location({ workflow });
      const model = workflow.model || google.model({ workflow });
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
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
      const result = await google.fetchJsonWithAdc(url, payload, Number(workflow.timeoutMs || 90000));
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Vertex HTTP ${result.statusCode}: ${String(result.body || "").slice(0, 500)}`);
      }
      const rawText = extractText(result.json);
      return {
        providerId: "gemini",
        mode: mode === "repair" ? "vertex-ai-repair" : "vertex-ai-document-analysis",
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

module.exports = {
  createGeminiProvider
};
