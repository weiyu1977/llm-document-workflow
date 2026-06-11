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

  console.log("llm-document-workflow self-test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
