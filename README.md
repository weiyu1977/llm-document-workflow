# llm-document-workflow

Reusable CommonJS document workflow engine for LLM-based document analysis.

The core is domain-neutral: provider adapters call LLMs, normalizers convert model output into typed reports, and optional legacy adapters map normalized reports into existing application contracts.

License: Apache-2.0.

## What This Module Owns

- Prompt and schema workflow configuration
- LLM provider adapter registry
- Normalizer preset registry
- PDF/text provider calls
- Robust JSON extraction from model output
- Schema normalization into stable report contracts
- Repair pass for malformed model output
- Markdown/list fallback when JSON repair fails
- Diagnostics for every run

The host app owns:

- Authentication and authorization
- File upload and virus scanning
- Secret storage
- Database persistence
- UI rendering
- Domain-specific business decisions

## Architecture

```text
workflow config
  -> composePrompt()
  -> provider adapter
  -> raw model output
  -> JSON extractor
  -> repair runner
  -> normalizer preset
  -> normalizedReport
  -> optional host legacy adapter
```

## Public API

```js
const { createDocumentWorkflowEngine } = require("./modules/llm-document-workflow");

const engine = createDocumentWorkflowEngine({
  getSecret(integrationId, secretName) {},
  setSecret({ integrationId, secretName, secretValue, updatedBy }) {},
  extractText(vertexResponseJson) {},
  google: {
    // Gemini Developer API key mode. If present, no Google Cloud project is required.
    apiKey: async () => process.env.GEMINI_API_KEY,
    // Vertex AI ADC mode. Used when apiKey is not present.
    projectId: async () => "my-gcp-project",
    location: () => "us-central1",
    model: () => "gemini-2.5-flash",
    fetchJsonWithAdc: async (url, payload, timeoutMs) => ({ statusCode: 200, json: {}, body: "" })
  }
});
```

### Run and Return a Generic Report

Use this in new projects.

```js
const result = await engine.runToReport({
  workflowId: "policy_analysis",
  files: [uploadedPdf],
  text: "",
  fileName: "policy.pdf",
  fallbackAnalysis: null
});

console.log(result.normalizedReport);
console.log(result.diagnostics);
```

### Run With Legacy Insurance Adapter

The current insurance app uses this compatibility path.

```js
const legacyAnalysis = await engine.run({
  workflowId: "policy_analysis",
  files: [uploadedPdf],
  fallbackAnalysis
});
```

## Workflow Config

Each workflow binds prompt, questions, schema, repair prompt, display config, provider and model.

```js
{
  workflowId: "policy_analysis",
  version: "v1",
  providerId: "gemini",
  model: "gemini-2.5-flash",
  normalizerId: "policy_analysis",
  legacyAdapterId: "visitor_insurance",
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

## Provider Contract

Register custom providers without changing the runner.

```js
engine.registerProvider({
  id: "openai",
  name: "OpenAI Responses API",
  supportsPdf: true,
  supportsText: true,
  status: "custom",
  async generate({ files, text, prompt, workflow, mode }) {
    return {
      providerId: "openai",
      mode,
      model: workflow.model,
      location: "api",
      statusCode: 200,
      finishReason: "STOP",
      rawText: "{...}",
      rawJson: {}
    };
  }
});
```

### Built-In Gemini Provider Auth Modes

The built-in `gemini` provider supports two auth modes:

- Gemini Developer API key: set `google.apiKey`. No Google Cloud project is required.
- Vertex AI ADC: set `google.projectId`, `google.location`, and `google.fetchJsonWithAdc`.

If neither auth mode is configured, the provider throws `missing_gemini_credentials`; the host application should decide whether to show an error or fall back to a local parser.

## Normalizer Contract

Normalizers are the domain boundary. Put policy, lease, invoice, or medical-record logic here, not in the runner.

```js
engine.registerNormalizer({
  id: "risk_list",
  name: "Risk list",
  normalize(parsed) {
    const report = {
      title: String(parsed?.title || "Untitled"),
      risks: Array.isArray(parsed?.risks) ? parsed.risks : []
    };
    return {
      report,
      validation: {
        ok: report.risks.length > 0,
        errors: report.risks.length ? [] : ["risks must contain at least one item"]
      }
    };
  },
  fallback(rawOutput) {
    return { title: "Raw output", risks: [String(rawOutput || "")] };
  }
});
```

## Normalization Pipeline

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

Diagnostics include:

- `runId`
- `parseMethod`
- `repaired`
- `errors`
- `warnings`
- `timingsMs`
- provider metadata

## Built-In Workflow

Current built-in workflow:

- `policy_analysis`

It returns a `PolicyAnalysisReport` shape suitable for visitor medical insurance policy analysis.

Built-in normalizers:

- `json_passthrough`
- `policy_analysis`

Built-in legacy adapters:

- `visitor_insurance`

## Examples

```powershell
node examples/basic-mock/index.js
node examples/custom-normalizer/index.js
```

## Quality Gates

Run from the module directory:

```powershell
npm run check
npm test
```

The root project `npm run check` also runs this module's checks and self-test.

## Full Documentation

- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Test Manual](docs/TEST_MANUAL.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Package / Repository Plan

This folder is ready to move into:

```text
packages/llm-document-workflow
```

or into a separate repository. Host apps should keep using only the public API above.
