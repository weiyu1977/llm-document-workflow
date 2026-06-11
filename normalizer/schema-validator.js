const policyAnalysisSchema = require("../schemas/policy-analysis.schema.json");
const { validateJsonSchema } = require("./json-schema-lite");

const confidenceValues = new Set(["high", "medium", "low"]);

function asText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeConfidence(value) {
  const text = asText(value).toLowerCase();
  return confidenceValues.has(text) ? text : "medium";
}

function normalizeEvidenceItem(item, fallbackTitle = "") {
  if (typeof item === "string") {
    return {
      title: fallbackTitle || item.slice(0, 80),
      detail: item,
      sourceText: "",
      page: "",
      confidence: "medium"
    };
  }
  const source = item && typeof item === "object" ? item : {};
  return {
    title: asText(source.title || source.label || fallbackTitle),
    detail: asText(source.detail || source.answer || source.text || source.value || source.item || ""),
    sourceText: asText(source.sourceText || source.source || source.quote),
    page: asText(source.page),
    confidence: normalizeConfidence(source.confidence)
  };
}

function normalizeEvidenceList(value, fallbackTitle = "") {
  return asArray(value)
    .map((item) => normalizeEvidenceItem(item, fallbackTitle))
    .filter((item) => item.title || item.detail || item.sourceText);
}

function normalizeDeadline(item) {
  const source = item && typeof item === "object" ? item : { text: item };
  return {
    type: asText(source.type || "other"),
    date: asText(source.date),
    relativeRule: asText(source.relativeRule || source.rule),
    text: asText(source.text || source.detail || source.title),
    sourceText: asText(source.sourceText || source.source),
    page: asText(source.page),
    confidence: normalizeConfidence(source.confidence)
  };
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateEvidenceList(report, key, errors) {
  if (!Array.isArray(report[key])) {
    errors.push(`${key} must be an array.`);
    return;
  }
  report[key].forEach((item, index) => {
    if (!isObject(item)) errors.push(`${key}[${index}] must be an object.`);
    if (isObject(item) && !item.title && !item.detail && !item.sourceText) {
      errors.push(`${key}[${index}] must include title, detail, or sourceText.`);
    }
  });
}

function validateMedicalBenefits(report, errors) {
  if (!isObject(report.medicalBenefits)) {
    errors.push("medicalBenefits must be an object.");
    return;
  }
  ["er", "urgentCare", "hospitalization", "ambulance", "surgery"].forEach((key) => {
    if (!Array.isArray(report.medicalBenefits[key])) errors.push(`medicalBenefits.${key} must be an array.`);
  });
}

function validatePreExistingCondition(report, errors) {
  if (!isObject(report.preExistingCondition)) {
    errors.push("preExistingCondition must be an object.");
    return;
  }
  if (!Array.isArray(report.preExistingCondition.ageLimits)) errors.push("preExistingCondition.ageLimits must be an array.");
  if (!Array.isArray(report.preExistingCondition.warnings)) errors.push("preExistingCondition.warnings must be an array.");
}

function answersToReport(parsed, fallback = {}) {
  fallback = fallback || {};
  const answers = Array.isArray(parsed.answers) ? parsed.answers : [];
  const byId = new Map(answers.map((answer) => [answer.questionId || answer.id, answer]));
  const answerText = (id) => asText(byId.get(id)?.answer || byId.get(id)?.text || byId.get(id)?.value);
  const answerItem = (id, title) => {
    const answer = byId.get(id);
    if (!answer) return [];
    return normalizeEvidenceList([{ ...answer, title, detail: answer.answer || answer.text || answer.value }], title);
  };
  return {
    documentSummary: {
      fileName: asText(parsed.fileName || fallback.fileName),
      documentType: asText(parsed.documentType || "insurance_policy"),
      carrier: asText(parsed.carrier),
      productName: asText(parsed.productName),
      policyType: asText(parsed.policyType),
      summary: answerText("summary") || asText(parsed.summary || fallback.summary),
      confidence: normalizeConfidence(byId.get("summary")?.confidence)
    },
    coverageHighlights: normalizeEvidenceList(parsed.coverageHighlights, "Coverage highlight").concat(answerItem("coverage_highlights", "Coverage highlights")),
    medicalBenefits: {
      er: normalizeEvidenceList(parsed.medicalBenefits?.er || parsed.er, "ER"),
      urgentCare: normalizeEvidenceList(parsed.medicalBenefits?.urgentCare || parsed.urgentCare, "Urgent care"),
      hospitalization: normalizeEvidenceList(parsed.medicalBenefits?.hospitalization || parsed.hospitalization, "Hospitalization"),
      ambulance: normalizeEvidenceList(parsed.medicalBenefits?.ambulance || parsed.ambulance, "Ambulance"),
      surgery: normalizeEvidenceList(parsed.medicalBenefits?.surgery || parsed.surgery, "Surgery")
    },
    preExistingCondition: {
      summary: asText(parsed.preExistingCondition?.summary || parsed.preExisting || ""),
      acuteOnset: asText(parsed.preExistingCondition?.acuteOnset || parsed.acuteOnset || ""),
      lookbackPeriod: asText(parsed.preExistingCondition?.lookbackPeriod || parsed.lookbackPeriod || ""),
      ageLimits: normalizeEvidenceList(parsed.preExistingCondition?.ageLimits || parsed.ageLimits, "Age limit"),
      warnings: normalizeEvidenceList(parsed.preExistingCondition?.warnings || [], "Pre-existing warning")
    },
    claimPreparation: normalizeEvidenceList(parsed.claimPreparation, "Claim preparation").concat(answerItem("claim_preparation", "Claim preparation")),
    deadlines: asArray(parsed.deadlines).map(normalizeDeadline).filter((item) => item.text || item.date || item.relativeRule),
    manualReview: {
      required: Boolean(parsed.manualReview?.required ?? parsed.manualReviewRequired ?? true),
      reasons: normalizeEvidenceList(parsed.manualReview?.reasons || parsed.manualReviewReasons || parsed.warnings || [], "Manual review").concat(answerItem("warnings", "Manual review"))
    },
    missingInformation: normalizeEvidenceList(parsed.missingInformation || parsed.missingInfo, "Missing information").concat(answerItem("missing_info", "Missing information")),
    nextSteps: normalizeEvidenceList(parsed.nextSteps, "Next step").concat(answerItem("next_steps", "Next step")),
    citations: normalizeEvidenceList(parsed.citations || parsed.sourceSnippets, "Citation"),
    answers,
    rawDebug: parsed.rawDebug || {}
  };
}

function validatePolicyAnalysisReport(report) {
  const errors = [];
  if (!isObject(report)) return { ok: false, errors: ["Report must be an object."] };
  const schemaValidation = validateJsonSchema(report, policyAnalysisSchema);
  errors.push(...schemaValidation.errors);
  if (!isObject(report.documentSummary)) {
    errors.push("documentSummary is required.");
  } else {
    if (!report.documentSummary.documentType) errors.push("documentSummary.documentType is required.");
    if (!["high", "medium", "low"].includes(report.documentSummary.confidence)) errors.push("documentSummary.confidence must be high, medium, or low.");
  }
  ["coverageHighlights", "claimPreparation", "missingInformation", "nextSteps", "citations"].forEach((key) => validateEvidenceList(report, key, errors));
  if (!Array.isArray(report.deadlines)) errors.push("deadlines must be an array.");
  validateMedicalBenefits(report, errors);
  validatePreExistingCondition(report, errors);
  if (!isObject(report.manualReview)) {
    errors.push("manualReview is required.");
  } else {
    if (typeof report.manualReview.required !== "boolean") errors.push("manualReview.required must be a boolean.");
    if (!Array.isArray(report.manualReview.reasons)) errors.push("manualReview.reasons must be an array.");
  }
  return { ok: errors.length === 0, errors };
}

function normalizePolicyAnalysisReport(parsed, fallback = {}) {
  fallback = fallback || {};
  const candidate = parsed && parsed.documentSummary ? parsed : answersToReport(parsed || {}, fallback);
  const report = {
    documentSummary: {
      fileName: asText(candidate.documentSummary?.fileName || fallback.fileName),
      documentType: asText(candidate.documentSummary?.documentType || "insurance_policy"),
      carrier: asText(candidate.documentSummary?.carrier),
      productName: asText(candidate.documentSummary?.productName),
      policyType: asText(candidate.documentSummary?.policyType),
      summary: asText(candidate.documentSummary?.summary || fallback.summary),
      confidence: normalizeConfidence(candidate.documentSummary?.confidence)
    },
    coverageHighlights: normalizeEvidenceList(candidate.coverageHighlights, "Coverage highlight"),
    medicalBenefits: {
      er: normalizeEvidenceList(candidate.medicalBenefits?.er, "ER"),
      urgentCare: normalizeEvidenceList(candidate.medicalBenefits?.urgentCare, "Urgent care"),
      hospitalization: normalizeEvidenceList(candidate.medicalBenefits?.hospitalization, "Hospitalization"),
      ambulance: normalizeEvidenceList(candidate.medicalBenefits?.ambulance, "Ambulance"),
      surgery: normalizeEvidenceList(candidate.medicalBenefits?.surgery, "Surgery")
    },
    preExistingCondition: {
      summary: asText(candidate.preExistingCondition?.summary),
      acuteOnset: asText(candidate.preExistingCondition?.acuteOnset),
      lookbackPeriod: asText(candidate.preExistingCondition?.lookbackPeriod),
      ageLimits: normalizeEvidenceList(candidate.preExistingCondition?.ageLimits, "Age limit"),
      warnings: normalizeEvidenceList(candidate.preExistingCondition?.warnings, "Pre-existing warning")
    },
    claimPreparation: normalizeEvidenceList(candidate.claimPreparation, "Claim preparation"),
    deadlines: asArray(candidate.deadlines).map(normalizeDeadline).filter((item) => item.text || item.date || item.relativeRule),
    manualReview: {
      required: Boolean(candidate.manualReview?.required),
      reasons: normalizeEvidenceList(candidate.manualReview?.reasons, "Manual review")
    },
    missingInformation: normalizeEvidenceList(candidate.missingInformation, "Missing information"),
    nextSteps: normalizeEvidenceList(candidate.nextSteps, "Next step"),
    citations: normalizeEvidenceList(candidate.citations, "Citation"),
    answers: Array.isArray(candidate.answers) ? candidate.answers : [],
    rawDebug: candidate.rawDebug || {}
  };
  return { report, validation: validatePolicyAnalysisReport(report) };
}

module.exports = {
  normalizePolicyAnalysisReport,
  validatePolicyAnalysisReport
};
