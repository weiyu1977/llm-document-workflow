const { createDocumentWorkflowEngine } = require("../..");

async function main() {
  const saved = new Map();
  const engine = createDocumentWorkflowEngine({
    getSecret: (integrationId, secretName) => saved.get(`${integrationId}:${secretName}`),
    setSecret: ({ integrationId, secretName, secretValue }) => {
      saved.set(`${integrationId}:${secretName}`, secretValue);
    }
  });

  const workflow = engine.getDefaultWorkflow("policy_analysis");
  engine.saveWorkflow("policy_analysis", { ...workflow, providerId: "mock" }, "example");

  const result = await engine.runToReport({
    workflowId: "policy_analysis",
    text: "Example travel medical policy text.",
    fileName: "example-policy.txt"
  });

  console.log(JSON.stringify({
    workflow: result.workflow,
    summary: result.normalizedReport.documentSummary.summary,
    diagnostics: result.diagnostics
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
