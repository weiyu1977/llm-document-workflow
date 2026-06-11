const { createDocumentWorkflowEngine } = require("../..");

async function main() {
  const saved = new Map();
  const engine = createDocumentWorkflowEngine({
    getSecret: (integrationId, secretName) => saved.get(`${integrationId}:${secretName}`),
    setSecret: ({ integrationId, secretName, secretValue }) => {
      saved.set(`${integrationId}:${secretName}`, secretValue);
    }
  });

  engine.registerProvider({
    id: "json_test_provider",
    name: "JSON Test Provider",
    supportsText: true,
    async generate() {
      return {
        providerId: "json_test_provider",
        mode: "analysis",
        model: "fixture",
        statusCode: 200,
        finishReason: "STOP",
        rawText: JSON.stringify({
          title: "Lease review",
          risks: ["Late fee clause is unclear.", "Termination notice period is missing."]
        })
      };
    }
  });

  engine.registerNormalizer({
    id: "risk_list",
    name: "Risk list",
    normalize(parsed) {
      const report = {
        title: String(parsed?.title || "Untitled"),
        risks: Array.isArray(parsed?.risks) ? parsed.risks.map(String) : []
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
      return { title: "Raw output", risks: [String(rawOutput || "").slice(0, 500)] };
    }
  });

  const workflow = {
    workflowId: "lease_risk_review",
    version: "v1",
    providerId: "json_test_provider",
    model: "fixture",
    normalizerId: "risk_list",
    systemPrompt: "You review documents and return JSON.",
    taskPrompt: "Return title and risks.",
    questions: [{ id: "risks", prompt: "List risks." }],
    outputSchema: { title: "", risks: [""] }
  };

  engine.saveWorkflow("lease_risk_review", workflow, "example");

  const result = await engine.runToReport({
    workflowId: "lease_risk_review",
    text: "Lease document sample."
  });

  console.log(JSON.stringify(result.normalizedReport, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
