const crypto = require("node:crypto");
const { parseJsonFromText } = require("./normalizer/json-extractor");
const { repairWithProvider } = require("./normalizer/repair-runner");

function createRunId() {
  return `dwf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function composePrompt(workflow, inputLabel = "") {
  const promptPackLines = workflow.promptPack && typeof workflow.promptPack === "object"
    ? Object.entries(workflow.promptPack)
      .map(([key, value]) => `### ${key}\n${value}`)
      .join("\n\n")
    : "";
  const questionLines = (workflow.questions || [])
    .map((question, index) => `${index + 1}. [${question.id}] ${question.title}\n${question.prompt}`)
    .join("\n\n");
  return [
    workflow.systemPrompt,
    workflow.businessContext ? `Business context:\n${workflow.businessContext}` : "",
    workflow.taskPrompt ? `Task:\n${workflow.taskPrompt}` : "",
    promptPackLines ? `Prompt pack modules:\n${promptPackLines}` : "",
    questionLines ? `Questions to answer:\n${questionLines}` : "",
    "Required JSON schema:",
    JSON.stringify(workflow.outputSchema || {}, null, 2),
    [
      "Rules:",
      "- Return strict JSON only.",
      "- The entire response must start with { and end with }.",
      "- Do not wrap JSON in markdown.",
      "- Do not include prose, commentary, headings, bullets, or code fences outside the JSON object.",
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
  diagnostics.isPartial = Boolean(parsedResult.isPartial);
  diagnostics.truncationDetected = Boolean(parsedResult.truncationDetected);
  diagnostics.truncationMarker = parsedResult.truncationMarker || "";
  diagnostics.recoveredSections = parsedResult.recoveredSections || [];
  diagnostics.repairedJson = parsedResult.repairedJson || "";
  diagnostics.partialJson = parsedResult.partialJson || "";
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
        diagnostics.isPartial = Boolean(diagnostics.isPartial || repaired.diagnostics.isPartial);
        diagnostics.truncationDetected = Boolean(diagnostics.truncationDetected || repaired.diagnostics.truncationDetected);
        diagnostics.recoveredSections = repaired.diagnostics.recoveredSections || diagnostics.recoveredSections;
        diagnostics.repairedJson = repaired.diagnostics.repairedJson || diagnostics.repairedJson;
        diagnostics.partialJson = repaired.diagnostics.partialJson || diagnostics.partialJson;
      }
    } catch (error) {
      diagnostics.warnings.push(`repair_failed: ${error.message}`);
    }
  }
  if (!normalized || !normalized.validation.ok) {
    if (parsed && normalized?.report) {
      diagnostics.warnings.push("Partial structured report recovered; validation issues require review.");
      diagnostics.errors.push(...(normalized.validation?.errors || []));
      markPartialReport(normalized.report, diagnostics, "partial_recovered_with_validation_errors");
      return {
        report: normalized.report,
        parsedOutput: parsed,
        diagnostics
      };
    }
    diagnostics.parseMethod = diagnostics.repaired ? diagnostics.parseMethod : "markdown_fallback";
    diagnostics.warnings.push("Using markdown fallback report.");
    return {
      report: typeof normalizer.fallback === "function" ? normalizer.fallback(rawOutput, fallbackAnalysis, { workflow }) : { rawOutput, fallbackAnalysis },
      parsedOutput: parsed,
      diagnostics
    };
  }
  return {
    report: markPartialReport(normalized.report, diagnostics),
    parsedOutput: parsed,
    diagnostics
  };
}

function markPartialReport(report, diagnostics, reason = "") {
  if (!report || !diagnostics?.isPartial) return report;
  const qualityGate = report.qualityGate && typeof report.qualityGate === "object" ? report.qualityGate : {};
  const manualReviewReasons = Array.isArray(qualityGate.manualReviewReasons) ? [...qualityGate.manualReviewReasons] : [];
  const missingCriticalFields = Array.isArray(qualityGate.missingCriticalFields) ? [...qualityGate.missingCriticalFields] : [];
  if (diagnostics.truncationDetected) manualReviewReasons.push("Model output appears truncated; recovered sections need review.");
  if (reason) manualReviewReasons.push(reason);
  report.qualityGate = {
    ...qualityGate,
    status: qualityGate.status === "complete" ? "partial" : (qualityGate.status || "partial"),
    missingCriticalFields: [...new Set(missingCriticalFields)],
    manualReviewReasons: [...new Set(manualReviewReasons)]
  };
  if (report.manualReview && typeof report.manualReview === "object") report.manualReview.required = true;
  return report;
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
    statusCode: providerResult.statusCode,
    maxOutputTokens: providerResult.maxOutputTokens || workflow.maxOutputTokens || "",
    responseMimeType: providerResult.responseMimeType || ""
  };
  if (/MAX_TOKENS/i.test(String(providerResult.finishReason || ""))) {
    normalized.diagnostics.truncationDetected = true;
    normalized.diagnostics.isPartial = true;
    normalized.diagnostics.warnings.push(`Provider stopped at MAX_TOKENS; increase maxOutputTokens above ${providerResult.maxOutputTokens || workflow.maxOutputTokens || "current value"}.`);
    markPartialReport(normalized.report, normalized.diagnostics, "Provider stopped at MAX_TOKENS.");
  }
  return {
    workflow: {
      workflowId: workflow.workflowId,
      version: workflow.version,
      providerId: workflow.providerId,
      model: workflow.model,
      parserStrategy: workflow.parserStrategy || "",
      promptPackKeys: workflow.promptPack && typeof workflow.promptPack === "object" ? Object.keys(workflow.promptPack) : []
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
