const crypto = require("node:crypto");
const { parseJsonFromText } = require("./normalizer/json-extractor");
const { repairWithProvider } = require("./normalizer/repair-runner");

const POLICY_REPORT_SECTIONS = [
  "documentSummary",
  "identity",
  "financialTerms",
  "coverageHighlights",
  "medicalBenefits",
  "preExistingCondition",
  "accidentMedical",
  "exclusions",
  "claimPreparation",
  "deadlines",
  "manualReview",
  "missingInformation",
  "nextSteps"
];

function createRunId() {
  return `dwf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const nonCjk = value.length - cjk;
  return Math.ceil(cjk * 1.4 + nonCjk / 4);
}

function workflowPromptFingerprint(workflow = {}) {
  return hashText(stableStringify({
    workflowId: workflow.workflowId,
    version: workflow.version,
    providerId: workflow.providerId,
    model: workflow.model,
    normalizerId: workflow.normalizerId,
    parserStrategy: workflow.parserStrategy,
    systemPrompt: workflow.systemPrompt,
    businessContext: workflow.businessContext,
    taskPrompt: workflow.taskPrompt,
    promptPack: workflow.promptPack,
    schemaContract: workflow.schemaContract,
    outputSchema: workflow.promptComposition?.includeFullOutputSchema ? workflow.outputSchema : undefined,
    repairPrompt: workflow.repairPrompt,
    displayConfig: workflow.promptComposition?.includeDisplayConfig ? workflow.displayConfig : undefined
  }));
}

function compactSchemaContract(workflow = {}) {
  if (workflow.schemaContract) {
    return typeof workflow.schemaContract === "string"
      ? workflow.schemaContract
      : JSON.stringify(workflow.schemaContract, null, 2);
  }
  return JSON.stringify(workflow.outputSchema || {}, null, 2);
}

function composeQuestionChecklist(questions = []) {
  return questions
    .map((question, index) => `${index + 1}. [${question.id}] ${question.title || question.id}`)
    .join("\n");
}

function composePromptSections(workflow, inputLabel = "") {
  const composition = workflow.promptComposition || {};
  const includeQuestionPrompts = composition.includeQuestionPrompts !== false;
  const includeFullOutputSchema = composition.includeFullOutputSchema === true;
  const includeDisplayConfig = composition.includeDisplayConfig === true;
  const promptPackLines = workflow.promptPack && typeof workflow.promptPack === "object"
    ? Object.entries(workflow.promptPack)
      .map(([key, value]) => `### ${key}\n${value}`)
      .join("\n\n")
    : "";
  const questionLines = includeQuestionPrompts
    ? (workflow.questions || [])
      .map((question, index) => `${index + 1}. [${question.id}] ${question.title}\n${question.prompt}`)
      .join("\n\n")
    : composeQuestionChecklist(workflow.questions || []);
  const schemaText = includeFullOutputSchema
    ? JSON.stringify(workflow.outputSchema || {}, null, 2)
    : compactSchemaContract(workflow);
  const sections = {
    systemPrompt: workflow.systemPrompt || "",
    businessContext: workflow.businessContext ? `Business context:\n${workflow.businessContext}` : "",
    taskPrompt: workflow.taskPrompt ? `Task:\n${workflow.taskPrompt}` : "",
    promptPack: promptPackLines ? `Prompt pack modules:\n${promptPackLines}` : "",
    questions: questionLines ? `${includeQuestionPrompts ? "Questions to answer" : "Section checklist"}:\n${questionLines}` : "",
    schemaContract: `${includeFullOutputSchema ? "Required JSON schema" : "Required JSON contract"}:\n${schemaText}`,
    displayConfig: includeDisplayConfig && workflow.displayConfig ? `Display config:\n${JSON.stringify(workflow.displayConfig, null, 2)}` : "",
    rules: [
      "Rules:",
      "- Return strict JSON only.",
      "- The entire response must start with { and end with }.",
      "- Do not wrap JSON in markdown.",
      "- Do not include prose, commentary, headings, bullets, or code fences outside the JSON object.",
      "- Do not repeat long policy text. Use concise sourceText snippets only for evidence.",
      "- Put confidence only in the confidence field; never append confidence words to findings.",
      "- Split long bullets into structured array items.",
      "- Use sourceText/page when available.",
      "- If a section cannot be completed, return an empty array/object and add manualReview plus qualityGate reasons.",
      "- If information is missing, add it to missingInformation or manualReview.reasons."
    ].join("\n"),
    inputLabel: inputLabel ? `Input label: ${inputLabel}` : ""
  };
  const prompt = Object.values(sections).filter(Boolean).join("\n\n");
  return {
    sections,
    prompt,
    promptLength: prompt.length,
    estimatedTokens: estimateTokens(prompt),
    promptFingerprint: workflowPromptFingerprint(workflow)
  };
}

function composePrompt(workflow, inputLabel = "") {
  return composePromptSections(workflow, inputLabel).prompt;
}

function composeContinuationPrompt(workflow, missingSections = []) {
  const sectionList = missingSections.length ? missingSections : POLICY_REPORT_SECTIONS;
  return [
    workflow.systemPrompt,
    workflow.businessContext ? `Business context:\n${workflow.businessContext}` : "",
    "The previous response was truncated before all sections were returned.",
    `Return strict JSON only for these missing PolicyAnalysisReport sections: ${sectionList.join(", ")}.`,
    "Do not repeat already completed sections unless needed to make a missing section understandable.",
    "Use the same schema shape as the original PolicyAnalysisReport for each returned section.",
    "If a section is not present in the document, return an empty section and add a manualReview reason.",
    "The response must start with { and end with }.",
    "Required JSON contract:",
    compactSchemaContract(workflow)
  ].filter(Boolean).join("\n\n");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "string") return hasText(value);
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return false;
}

function evidenceItemHasContent(item) {
  if (!isObject(item)) return hasMeaningfulValue(item);
  return ["finding", "detail", "sourceText", "text", "answer", "value", "summary", "date", "relativeRule"]
    .some((key) => hasText(item[key]) || (Array.isArray(item[key]) && item[key].some(hasMeaningfulValue)));
}

function evidenceContainerHasContent(value) {
  if (Array.isArray(value)) return value.some(evidenceItemHasContent);
  if (!isObject(value)) return hasMeaningfulValue(value);
  return Object.values(value).some((child) => {
    if (Array.isArray(child)) return child.some(evidenceItemHasContent);
    if (isObject(child)) return evidenceItemHasContent(child) || evidenceContainerHasContent(child);
    return hasMeaningfulValue(child);
  });
}

function sectionHasContent(report, section) {
  if (!report || !section) return false;
  if (section === "qualityGate") return true;
  if (section === "documentSummary") {
    const summary = report.documentSummary || {};
    return ["carrier", "productName", "policyType", "summary"].some((key) => hasText(summary[key]));
  }
  if (section === "preExistingCondition") {
    const value = report.preExistingCondition || {};
    return ["summary", "definition", "exclusion", "acuteOnset", "stabilityRequirement", "lookbackPeriod", "waitingPeriod"]
      .some((key) => hasText(value[key]))
      || evidenceContainerHasContent(value.ageLimits)
      || evidenceContainerHasContent(value.coverageLimits)
      || evidenceContainerHasContent(value.warnings);
  }
  if (section === "manualReview") return Boolean(report.manualReview?.required || evidenceContainerHasContent(report.manualReview?.reasons));
  return evidenceContainerHasContent(report[section]);
}

function mergeJson(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) {
    const left = Array.isArray(base) ? base : [];
    const right = Array.isArray(extra) ? extra : [];
    return [...left, ...right];
  }
  if (isObject(base) && isObject(extra)) {
    const merged = { ...base };
    Object.entries(extra).forEach(([key, value]) => {
      merged[key] = key in merged ? mergeJson(merged[key], value) : value;
    });
    return merged;
  }
  return hasMeaningfulValue(extra) ? extra : base;
}

function mergeReports(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  return mergeJson(base, extra);
}

function applySectionDiagnostics(report, diagnostics) {
  if (!report || !diagnostics) return report;
  const recovered = new Set((diagnostics.recoveredSections || []).filter((section) => POLICY_REPORT_SECTIONS.includes(section)));
  POLICY_REPORT_SECTIONS.forEach((section) => {
    if (sectionHasContent(report, section)) recovered.add(section);
  });
  const failed = POLICY_REPORT_SECTIONS.filter((section) => !recovered.has(section));
  diagnostics.recoveredSections = [...recovered];
  diagnostics.failedSections = failed;
  if (failed.length) {
    diagnostics.isPartial = true;
    const qualityGate = report.qualityGate && typeof report.qualityGate === "object" ? report.qualityGate : {};
    const manualReviewReasons = Array.isArray(qualityGate.manualReviewReasons) ? [...qualityGate.manualReviewReasons] : [];
    const missingCriticalFields = Array.isArray(qualityGate.missingCriticalFields) ? [...qualityGate.missingCriticalFields] : [];
    failed.forEach((section) => {
      manualReviewReasons.push(`Section unavailable: ${section}`);
    });
    report.qualityGate = {
      ...qualityGate,
      status: "partial",
      missingCriticalFields: [...new Set(missingCriticalFields)],
      manualReviewReasons: [...new Set(manualReviewReasons)],
      manualReviewRequired: true
    };
    report.manualReview = report.manualReview && typeof report.manualReview === "object"
      ? report.manualReview
      : { required: true, reasons: [] };
    report.manualReview.required = true;
    report.rawDebug = {
      ...(report.rawDebug || {}),
      unavailableSections: failed
    };
  }
  return report;
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
        report: applySectionDiagnostics(normalized.report, diagnostics),
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
    report: applySectionDiagnostics(markPartialReport(normalized.report, diagnostics), diagnostics),
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
  const promptInfo = composePromptSections(workflow, fileName || files[0]?.originalname || files[0]?.name || "document");
  const prompt = promptInfo.prompt;
  const providerResult = await provider.generate({ workflow, files, text, prompt, mode: "analysis" });
  const rawOutput = providerResult.rawText || "";
  let normalized = await normalizeRawOutput({ rawOutput, workflow, provider, normalizer, fallbackAnalysis });
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
    applySectionDiagnostics(normalized.report, normalized.diagnostics);
    if (normalized.parsedOutput && normalized.diagnostics.failedSections?.length) {
      const continuationStarted = Date.now();
      try {
        const continuationPrompt = composeContinuationPrompt(workflow, normalized.diagnostics.failedSections);
        const continuationResult = await provider.generate({ workflow, files, text, prompt: continuationPrompt, mode: "continuation" });
        const continuation = await normalizeRawOutput({
          rawOutput: continuationResult.rawText || "",
          workflow,
          provider,
          normalizer,
          fallbackAnalysis
        });
        const mergedParsed = mergeJson(normalized.parsedOutput || {}, continuation.parsedOutput || {});
        const merged = normalizer.normalize(mergedParsed, fallbackAnalysis, { workflow });
        if (merged?.report) {
          normalized.parsedOutput = mergedParsed;
          normalized.report = applySectionDiagnostics(mergeReports(normalized.report, merged.report), normalized.diagnostics);
          normalized.diagnostics.continuation = {
            attempted: true,
            finishReason: continuationResult.finishReason || "",
            statusCode: continuationResult.statusCode,
            parseMethod: continuation.diagnostics.parseMethod,
            recoveredSections: continuation.diagnostics.recoveredSections || [],
            failedSections: continuation.diagnostics.failedSections || [],
            elapsedMs: Date.now() - continuationStarted
          };
          normalized.diagnostics.recoveredSections = [...new Set([
            ...(normalized.diagnostics.recoveredSections || []),
            ...(continuation.diagnostics.recoveredSections || [])
          ])];
          applySectionDiagnostics(normalized.report, normalized.diagnostics);
          normalized.diagnostics.warnings.push("MAX_TOKENS continuation attempted for missing sections.");
        }
      } catch (error) {
        normalized.diagnostics.continuation = {
          attempted: true,
          error: error.message,
          elapsedMs: Date.now() - continuationStarted
        };
        normalized.diagnostics.warnings.push(`MAX_TOKENS continuation failed: ${error.message}`);
      }
    }
  }
  const result = {
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
  result.diagnostics.prompt = {
    length: promptInfo.promptLength,
    estimatedTokens: promptInfo.estimatedTokens,
    fingerprint: promptInfo.promptFingerprint
  };
  return result;
}

module.exports = {
  composePrompt,
  composePromptSections,
  estimateTokens,
  workflowPromptFingerprint,
  runDocumentWorkflowToReport
};
