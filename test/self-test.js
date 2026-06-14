const assert = require("node:assert/strict");
const {
  createDocumentWorkflowEngine,
  parseJsonFromText
} = require("..");

async function main() {
  const parsed = parseJsonFromText("```json\n{\"ok\":true,\"items\":[1]}\n``` trailing text");
  assert.equal(parsed.parsed.ok, true, "json-extractor should parse fenced JSON with trailing text");

  const saved = new Map();
  const engine = createDocumentWorkflowEngine({
    getSecret: (integrationId, secretName) => saved.get(`${integrationId}:${secretName}`),
    setSecret: ({ integrationId, secretName, secretValue }) => {
      saved.set(`${integrationId}:${secretName}`, secretValue);
    }
  });

  const defaults = engine.getDefaultWorkflow("policy_analysis");
  engine.saveWorkflow("policy_analysis", { ...defaults, providerId: "mock" }, "self-test");

  const reportResult = await engine.runToReport({
    workflowId: "policy_analysis",
    text: "Policy text sample.",
    fileName: "sample-policy.txt",
    fallbackAnalysis: { fileName: "sample-policy.txt", fields: {}, sections: [], deadlines: [], flags: [], summary: "fallback" }
  });
  assert.equal(reportResult.workflow.workflowId, "policy_analysis");
  assert.ok(reportResult.normalizedReport.documentSummary, "runToReport should return normalizedReport");
  assert.ok(reportResult.diagnostics.runId, "diagnostics should include runId");

  const legacy = await engine.run({
    workflowId: "policy_analysis",
    text: "Policy text sample.",
    fileName: "sample-policy.txt",
    fallbackAnalysis: { fileName: "sample-policy.txt", fields: {}, sections: [], deadlines: [], flags: [], summary: "fallback" }
  });
  assert.equal(legacy.parser, "llm-document-workflow-v1");
  assert.ok(legacy.normalizedReport, "legacy adapter should include normalizedReport");

  engine.registerProvider({
    id: "custom_test",
    name: "Custom Test Provider",
    supportsText: true,
    async generate() {
      return {
        providerId: "custom_test",
        mode: "test",
        model: "custom",
        location: "local",
        statusCode: 200,
        finishReason: "STOP",
        rawText: JSON.stringify(defaults.outputSchema)
      };
    }
  });
  assert.ok(engine.listProviders().some((provider) => provider.id === "custom_test"), "custom provider should be registered");
  assert.ok(engine.listProviders().some((provider) => provider.id === "gemini" && /Gemini/.test(provider.name)), "Gemini provider should be registered");

  let capturedGeminiUrl = "";
  let capturedGeminiHeaders = {};
  let capturedGeminiPayload = null;
  const apiKeyEngine = createDocumentWorkflowEngine({
    google: {
      apiKey: async () => "test-gemini-key",
      model: () => "gemini-test-model",
      projectId: async () => {
        throw new Error("projectId should not be required when apiKey is configured");
      }
    },
    fetchJson: async (url, payload, timeoutMs, headers) => {
      capturedGeminiUrl = url;
      capturedGeminiHeaders = headers;
      capturedGeminiPayload = payload;
      return {
        statusCode: 200,
        body: "{}",
        json: {
          candidates: [{
            finishReason: "STOP",
            content: {
              parts: [{
                text: "{\"documentSummary\":{\"fileName\":\"api-key.pdf\",\"documentType\":\"insurance_policy\",\"policyType\":\"comprehensive\",\"summary\":\"API key mode works.\",\"confidence\":\"high\"},\"coverageHighlights\":[],\"medicalBenefits\":{\"er\":[],\"urgentCare\":[],\"hospitalization\":[],\"ambulance\":[],\"surgery\":[]},\"preExistingCondition\":{\"summary\":\"\",\"acuteOnset\":\"\",\"lookbackPeriod\":\"\",\"ageLimits\":[],\"warnings\":[]},\"claimPreparation\":[],\"deadlines\":[],\"manualReview\":{\"required\":false,\"reasons\":[]},\"missingInformation\":[],\"nextSteps\":[],\"citations\":[]}"
              }]
            }
          }]
        }
      };
    }
  });
  const apiKeyDefaults = apiKeyEngine.getDefaultWorkflow("policy_analysis");
  apiKeyEngine.saveWorkflow("policy_analysis", { ...apiKeyDefaults, providerId: "gemini" }, "api-key-self-test");
  const apiKeyResult = await apiKeyEngine.runToReport({
    workflowId: "policy_analysis",
    text: "sample",
    fileName: "api-key.pdf"
  });
  assert.match(capturedGeminiUrl, /generativelanguage\.googleapis\.com/, "Gemini API key mode should use the Developer API endpoint");
  assert.equal(capturedGeminiHeaders["x-goog-api-key"], "test-gemini-key", "Gemini API key should be sent as x-goog-api-key");
  assert.equal(capturedGeminiPayload.generationConfig.responseMimeType, "application/json", "Gemini structured workflows should request JSON output");
  assert.equal(apiKeyResult.diagnostics.provider.mode, "developer-api-key-document-analysis");
  assert.equal(apiKeyResult.normalizedReport.documentSummary.summary, "API key mode works.");

  console.log("llm-document-workflow self-test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
