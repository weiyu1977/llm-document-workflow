const crypto = require("node:crypto");
const { parseJsonFromText } = require("./normalizer/json-extractor");
const { repairWithProvider } = require("./normalizer/repair-runner");

function createRunId() {
  return `dwf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function composePrompt(workflow, inputLabel = "") {
  const questionLines = (workflow.questions || [])
    .map((question, index) => `${index + 1}. [${question.id}] ${question.title}\n${question.prompt}`)
    .join("\n\n");
  return [
    workflow.systemPrompt,
    workflow.businessContext ? `Business context:\n${workflow.businessContext}` : "",
    workflow.taskPrompt ? `Task:\n${workflow.taskPrompt}` : "",
    questionLines ? `Questions to answer:\n${questionLines}` : "",
    "Required JSON schema:",
    JSON.stringify(workflow.outputSchema || {}, null, 2),
    [
      "Rules:",
      "- Return strict JSON only.",
      "- Do not wrap JSON in markdown.",
      "- Split long bullets into structured array items.",
      "- Use sourceText/page when available.",
      "- If information is missing, add it to missingInformation or manualReview.reasons."
    ].join("\n"),
    inputLabel ? `Input label: ${inputLabel}` : ""
  ].filter(Boolean).join("\n\n");
}

async function normalizeRawOutput({ rawOutput, workflow, provider, normalizer, fallbackAnalysis }) {
  const diagnostics = {
    runId: createRunId(),
    parseMethod: "",
    repaired: false,
    warnings: [],
    errors: [],
    timingsMs: {}
  };
  const parseStarted = Date.now();
  const parsedResult = parseJsonFromText(rawOutput);
  diagnostics.timingsMs.initialParse = Date.now() - parseStarted;
  let parsed = parsedResult.parsed;
  diagnostics.parseMethod = parsedResult.method;
  let normalized = parsed ? normalizer.normalize(parsed, fallbackAnalysis, { workflow }) : null;
  if (!parsed || !normalized.validation.ok) {
    diagnostics.errors.push(...(normalized?.validation?.errors || [parsedResult.error || "json_parse_failed"]));
    try {
      const repairStarted = Date.now();
      const repaired = await repairWithProvider({ provider, workflow, rawOutput, validationErrors: diagnostics.errors });
      diagnostics.timingsMs.repair = Date.now() - repairStarted;
      if (repaired.parsed) {
        parsed = repaired.parsed;
        normalized = normalizer.normalize(parsed, fallbackAnalysis, { workflow });
        diagnostics.repaired = true;
        diagnostics.repair = repaired.diagnostics;
        diagnostics.parseMethod = `repair:${repaired.diagnostics.repairParseMethod}`;
      }
    } catch (error) {
      diagnostics.warnings.push(`repair_failed: ${error.message}`);
    }
  }
  if (!normalized || !normalized.validation.ok) {
    diagnostics.parseMethod = diagnostics.repaired ? diagnostics.parseMethod : "markdown_fallback";
    diagnostics.warnings.push("Using markdown fallback report.");
    return {
      report: typeof normalizer.fallback === "function" ? normalizer.fallback(rawOutput, fallbackAnalysis, { workflow }) : { rawOutput, fallbackAnalysis },
      parsedOutput: parsed,
      diagnostics
    };
  }
  return {
    report: normalized.report,
    parsedOutput: parsed,
    diagnostics
  };
}

async function runDocumentWorkflowToReport({ workflow, provider, normalizer, files = [], text = "", fileName = "", fallbackAnalysis = null }) {
  const started = Date.now();
  const prompt = composePrompt(workflow, fileName || files[0]?.originalname || files[0]?.name || "document");
  const providerResult = await provider.generate({ workflow, files, text, prompt, mode: "analysis" });
  const rawOutput = providerResult.rawText || "";
  const normalized = await normalizeRawOutput({ rawOutput, workflow, provider, normalizer, fallbackAnalysis });
  normalized.diagnostics.timingsMs.total = Date.now() - started;
  normalized.diagnostics.provider = {
    providerId: providerResult.providerId,
    mode: providerResult.mode,
    model: providerResult.model,
    finishReason: providerResult.finishReason,
    statusCode: providerResult.statusCode
  };
  return {
    workflow: {
      workflowId: workflow.workflowId,
      version: workflow.version,
      providerId: workflow.providerId,
      model: workflow.model
    },
    normalizedReport: normalized.report,
    rawOutput,
    parsedOutput: normalized.parsedOutput,
    diagnostics: normalized.diagnostics,
    providerResult
  };
}

module.exports = {
  composePrompt,
  runDocumentWorkflowToReport
};
