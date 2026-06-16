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
  assert.equal(defaults.version, "v3", "default policy workflow should use the v3 schema-aligned prompt pack");
  engine.saveWorkflow("policy_analysis", { ...defaults, providerId: "mock" }, "self-test");

  const legacyPromptEngine = createDocumentWorkflowEngine({
    getSecret: (integrationId, secretName) => {
      if (integrationId !== "document_workflow" || secretName !== "policy_analysis:promptPack") return undefined;
      return JSON.stringify({
        summary: "Legacy summary prompt.",
        warnings: "Legacy warning prompt.",
        claimPreparation: "Legacy claim prompt."
      });
    },
    setSecret: () => {}
  });
  const migrated = legacyPromptEngine.getWorkflow("policy_analysis");
  assert.ok(migrated.promptPack.document_identity_prompt.includes("Legacy summary prompt."), "legacy summary prompt should migrate into document_identity_prompt");
  assert.ok(migrated.promptPack.manual_review_prompt.includes("Legacy warning prompt."), "legacy warnings prompt should migrate into manual_review_prompt");
  assert.ok(migrated.promptPack.claim_deadline_prompt.includes("Legacy claim prompt."), "legacy claim prompt should migrate into claim_deadline_prompt");
  assert.ok(migrated.outputSchema.medicalBenefits.medicalEvacuation, "schema merge should preserve new medicalBenefits fields");
  assert.ok(migrated.questions.some((question) => question.id === "document_identity_prompt"), "migrated workflow should expose schema-aligned questions");

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

  let continuationCalls = 0;
  const continuationSaved = new Map();
  const continuationEngine = createDocumentWorkflowEngine({
    getSecret: (integrationId, secretName) => continuationSaved.get(`${integrationId}:${secretName}`),
    setSecret: ({ integrationId, secretName, secretValue }) => {
      continuationSaved.set(`${integrationId}:${secretName}`, secretValue);
    }
  });
  const continuationDefaults = continuationEngine.getDefaultWorkflow("policy_analysis");
  continuationEngine.registerProvider({
    id: "truncated_test",
    name: "Truncated Test Provider",
    supportsText: true,
    async generate({ mode }) {
      if (mode === "continuation") {
        continuationCalls += 1;
        return {
          providerId: "truncated_test",
          mode: "continuation",
          model: "test",
          statusCode: 200,
          finishReason: "STOP",
          rawText: JSON.stringify({
            financialTerms: {
              policyMaximum: [{ title: "Policy maximum", finding: "$100,000", detail: "$100,000", confidence: "high" }],
              deductible: [{ title: "Deductible", finding: "$250", detail: "$250", confidence: "high" }]
            },
            exclusions: {
              general: [{ title: "General exclusions", finding: "Pre-existing conditions excluded unless acute onset applies.", detail: "Pre-existing conditions excluded unless acute onset applies.", confidence: "medium" }]
            },
            deadlines: [{ type: "claim", text: "Submit proof of loss within 90 days.", confidence: "medium" }]
          })
        };
      }
      return {
        providerId: "truncated_test",
        mode: "analysis",
        model: "test",
        statusCode: 200,
        finishReason: "MAX_TOKENS",
        maxOutputTokens: 64,
        rawText: "{\"documentSummary\":{\"documentType\":\"insurance_policy\",\"carrier\":\"Truncated Carrier\",\"productName\":\"Visitor Medical\",\"summary\":\"Truncated sample\",\"confidence\":\"medium\"},\"medicalBenefits\":{\"er\":[{\"title\":\"ER\",\"finding\":\"Covered after deductible\",\"detail\":\"Covered after deductible\",\"confidence\":\"medium\"}]},\"preExistingCondition\":{\"summary\":\"Acute onset may be limited\""
      };
    }
  });
  continuationEngine.saveWorkflow("policy_analysis", { ...continuationDefaults, providerId: "truncated_test", maxOutputTokens: 64 }, "self-test");
  const continuationResult = await continuationEngine.runToReport({
    workflowId: "policy_analysis",
    text: "sample",
    fileName: "truncated.pdf"
  });
  assert.equal(continuationResult.diagnostics.provider.finishReason, "MAX_TOKENS");
  assert.equal(continuationResult.diagnostics.truncationDetected, true);
  assert.equal(continuationResult.diagnostics.continuation.attempted, true);
  assert.equal(continuationCalls, 1, "MAX_TOKENS should trigger exactly one continuation request");
  assert.notEqual(continuationResult.diagnostics.parseMethod, "markdown_fallback", "partial JSON should not markdown fallback");
  assert.ok(continuationResult.normalizedReport.financialTerms.policyMaximum.length >= 1, "continuation should restore financial terms");
  assert.ok(Array.isArray(continuationResult.diagnostics.failedSections), "section-level failedSections should be recorded");

  console.log("llm-document-workflow self-test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
