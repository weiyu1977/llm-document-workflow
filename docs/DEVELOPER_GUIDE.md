# Developer Guide: llm-document-workflow

This guide explains how to embed `llm-document-workflow` in another Node.js project.

## 1. Purpose

`llm-document-workflow` turns document files or text into stable structured reports by combining:

- workflow prompt configuration
- provider adapters
- model output parsing
- schema normalization
- normalizer presets
- repair and fallback handling
- diagnostics

It does not manage authentication, upload security, database persistence, or UI.

## 2. Recommended Integration Shape

```text
Host API route
  -> upload validation / scan
  -> createDocumentWorkflowEngine(...)
  -> engine.runToReport(...)
  -> store normalizedReport, diagnostics, rawOutput, parsedOutput
  -> render normalizedReport in UI
```

Use `runToReport()` in new projects. Use `run()` only when you need the current insurance app's legacy analysis shape.

## 3. Installation Options

Local path during development:

```js
const { createDocumentWorkflowEngine } = require("./llm-document-workflow");
```

Package path after installing from GitHub or npm:

```js
const { createDocumentWorkflowEngine } = require("llm-document-workflow");
```

## 4. Engine Setup

```js
const engine = createDocumentWorkflowEngine({
  getSecret(integrationId, secretName) {
    return db.getSecret(integrationId, secretName);
  },
  setSecret({ integrationId, secretName, secretValue, updatedBy }) {
    return db.setSecret({ integrationId, secretName, secretValue, updatedBy });
  },
  extractText(vertexResponseJson) {
    return vertexResponseJson?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim() || "";
  },
  google: {
    apiKey: async () => process.env.GEMINI_API_KEY,
    projectId: async () => process.env.GOOGLE_CLOUD_PROJECT,
    location: () => process.env.VERTEX_AI_LOCATION || "us-central1",
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
    fetchJsonWithAdc: async (url, payload, timeoutMs) => {
      // Host app provides ADC/authenticated HTTP transport.
    }
  }
});
```

The built-in Gemini provider checks `apiKey` first. If an API key is present, it calls the Gemini Developer API directly and does not require a Google Cloud project. If no API key is present, it falls back to Vertex AI ADC.

## 5. Run a Workflow

```js
const result = await engine.runToReport({
  workflowId: "policy_analysis",
  files: [uploadedFile],
  text: "",
  fileName: uploadedFile.originalname,
  fallbackAnalysis: null
});

await db.save({
  workflow: result.workflow,
  normalizedReport: result.normalizedReport,
  diagnostics: result.diagnostics,
  rawOutput: result.rawOutput,
  parsedOutput: result.parsedOutput
});
```

## 6. Result Contract

`runToReport()` returns:

```js
{
  workflow: {
    workflowId,
    version,
    providerId,
    model
  },
  normalizedReport: {},
  rawOutput: "",
  parsedOutput: {},
  diagnostics: {
    runId,
    parseMethod,
    repaired,
    errors: [],
    warnings: [],
    timingsMs: {},
    provider: {}
  },
  providerResult: {}
}
```

Persist all fields except `providerResult.rawJson` if storage size or privacy policy requires trimming.

## 7. Workflow Configuration

Workflow configs bind prompt and schema together:

```js
{
  workflowId: "policy_analysis",
  version: "v1",
  providerId: "gemini",
  model: "gemini-2.5-flash",
  normalizerId: "policy_analysis",
  legacyAdapterId: "visitor_insurance",
  parserStrategy: "policy_report_json",
  systemPrompt: "...",
  businessContext: "...",
  taskPrompt: "...",
  questions: [
    { id: "summary", title: "Document summary", prompt: "..." }
  ],
  outputSchema: {},
  repairPrompt: "...",
  displayConfig: {}
}
```

Rules:

- Update `version` when prompt or schema changes materially.
- Keep `questions[].id` stable for stored reports.
- Do not remove fields from `outputSchema` without migration.
- Put UI-only preferences in `displayConfig`, not prompts.
- Use `normalizerId` to select the output contract.
- Use `legacyAdapterId` only when a host application needs backward-compatible output.

## 8. Saving Workflows

```js
engine.saveWorkflow("policy_analysis", workflowConfig, userId);
```

The engine validates required fields before saving. Invalid configs throw `WorkflowConfigError`.

## 9. Custom Provider Adapter

```js
engine.registerProvider({
  id: "openai",
  name: "OpenAI Responses API",
  supportsPdf: true,
  supportsText: true,
  status: "custom",
  async generate({ files, text, prompt, workflow, mode }) {
    const response = await callYourProvider({ files, text, prompt, workflow, mode });
    return {
      providerId: "openai",
      mode,
      model: workflow.model,
      location: "api",
      statusCode: response.statusCode,
      finishReason: response.finishReason,
      rawText: response.text,
      rawJson: response.raw
    };
  }
});
```

Provider adapters must not mutate workflow config. They only return raw output and provider metadata.

## 10. Custom Normalizer

```js
engine.registerNormalizer({
  id: "invoice_summary",
  name: "Invoice summary",
  normalize(parsed) {
    const report = {
      vendor: String(parsed?.vendor || ""),
      total: Number(parsed?.total || 0),
      lineItems: Array.isArray(parsed?.lineItems) ? parsed.lineItems : []
    };
    return {
      report,
      validation: {
        ok: Boolean(report.vendor) && report.total >= 0,
        errors: Boolean(report.vendor) ? [] : ["vendor is required"]
      }
    };
  },
  fallback(rawOutput) {
    return { vendor: "", total: 0, lineItems: [], rawOutput };
  }
});
```

Then set `normalizerId: "invoice_summary"` in the workflow config.

## 11. Normalization Pipeline

```text
raw model output
  -> direct JSON parse
  -> markdown fence cleanup
  -> balanced JSON extraction
  -> schema normalization
  -> provider repair pass
  -> markdown/list fallback
  -> normalizedReport + diagnostics
```

The UI should consume `normalizedReport`. Raw output belongs in admin/debug views only.

## 12. Security And Privacy Notes

Host app must handle:

- file size/type restrictions
- malware scanning
- encryption at rest
- audit logs
- consent and deletion/export workflows
- provider data transfer disclosures

This module can process sensitive health/insurance documents, so do not log raw files or raw outputs by default.

## 13. Extraction To A Separate Package

Recommended path:

```text
packages/llm-document-workflow
```

Then update host apps to import through package name. Keep the public API stable:

- `createDocumentWorkflowEngine`
- `engine.runToReport`
- `engine.saveWorkflow`
- `engine.registerProvider`
- `engine.registerNormalizer`
