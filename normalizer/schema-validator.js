const policyAnalysisSchema = require("../schemas/policy-analysis.schema.json");
const { validateJsonSchema } = require("./json-schema-lite");

const confidenceValues = new Set(["high", "medium", "low"]);

const identityKeys = [
  "carrier",
  "productName",
  "policyNumber",
  "certificateNumber",
  "coverageStart",
  "coverageEnd",
  "destinationArea",
  "effectiveArea",
  "residenceCountry",
  "assistancePhone",
  "network"
];

const identityListKeys = ["insuredNames", "travelDates"];

const financialTermKeys = ["policyMaximum", "deductible", "coinsurance", "outOfPocketMax", "perIncidentLimit", "benefitCaps"];

const medicalBenefitKeys = [
  "er",
  "urgentCare",
  "hospitalization",
  "icu",
  "ambulance",
  "surgery",
  "physician",
  "diagnostics",
  "prescriptionDrugs",
  "dental",
  "medicalEvacuation"
];

const accidentMedicalKeys = ["er", "hospitalization", "surgery", "ambulance", "separateBilling", "medicalEvacuation", "exclusions"];

const exclusionKeys = ["alcoholDrug", "hazardousActivity", "pregnancy", "routineCare", "mentalHealth", "sports", "residenceCountry", "general"];

function asText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeConfidence(value) {
  const text = asText(value).toLowerCase();
  return confidenceValues.has(text) ? text : "medium";
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  return ["true", "yes", "y", "required", "manual", "review"].some((token) => text.includes(token));
}

function normalizeEvidenceItem(item, fallbackTitle = "") {
  if (typeof item === "string") {
    return {
      title: fallbackTitle || item.slice(0, 80),
      finding: item,
      detail: item,
      whyItMatters: "",
      userAction: "",
      manualReviewRequired: false,
      sourceText: "",
      page: "",
      confidence: "medium"
    };
  }
  const source = item && typeof item === "object" ? item : {};
  const title = asText(source.title || source.label || fallbackTitle);
  const finding = asText(source.finding || source.name || source.key || source.title || source.label || source.answer || source.text || source.value || source.item || fallbackTitle);
  const detail = asText(source.detail || source.explanation || source.answer || source.text || source.value || source.item || source.finding || "");
  return {
    title,
    finding,
    detail,
    whyItMatters: asText(source.whyItMatters || source.why || source.rationale || source.importance),
    userAction: asText(source.userAction || source.action || source.nextStep || source.recommendation),
    manualReviewRequired: asBoolean(source.manualReviewRequired ?? source.manualReview ?? source.requiresReview),
    sourceText: asText(source.sourceText || source.source || source.quote || source.evidence),
    page: asText(source.page || source.pageNumber),
    confidence: normalizeConfidence(source.confidence)
  };
}

function normalizeEvidenceList(value, fallbackTitle = "") {
  return asArray(value)
    .map((item) => normalizeEvidenceItem(item, fallbackTitle))
    .filter((item) => item.title || item.finding || item.detail || item.sourceText);
}

function normalizeSingleEvidence(value, fallbackTitle = "") {
  const normalized = normalizeEvidenceItem(value, fallbackTitle);
  return normalized.title || normalized.finding || normalized.detail || normalized.sourceText
    ? normalized
    : normalizeEvidenceItem({ title: fallbackTitle, confidence: "low" }, fallbackTitle);
}

function normalizeDeadline(item) {
  const source = item && typeof item === "object" ? item : { text: item };
  return {
    type: asText(source.type || "other"),
    date: asText(source.date),
    relativeRule: asText(source.relativeRule || source.rule),
    text: asText(source.text || source.detail || source.finding || source.title),
    whyItMatters: asText(source.whyItMatters || source.why || source.rationale),
    userAction: asText(source.userAction || source.action || source.nextStep),
    sourceText: asText(source.sourceText || source.source || source.quote),
    page: asText(source.page || source.pageNumber),
    confidence: normalizeConfidence(source.confidence)
  };
}

function normalizeEvidenceMap(value, keys, labels = {}) {
  const source = isObject(value) ? value : {};
  return keys.reduce((result, key) => {
    result[key] = normalizeEvidenceList(source[key], labels[key] || key);
    return result;
  }, {});
}

function normalizeIdentity(value, candidate = {}) {
  const source = isObject(value) ? value : {};
  const summary = isObject(candidate.documentSummary) ? candidate.documentSummary : {};
  const result = {};
  identityKeys.forEach((key) => {
    result[key] = normalizeSingleEvidence(source[key] || summary[key] || candidate[key], key);
  });
  identityListKeys.forEach((key) => {
    result[key] = normalizeEvidenceList(source[key] || candidate[key], key);
  });
  if (!result.carrier.finding && summary.carrier) result.carrier = normalizeSingleEvidence(summary.carrier, "carrier");
  if (!result.productName.finding && summary.productName) result.productName = normalizeSingleEvidence(summary.productName, "productName");
  return result;
}

function normalizeFinancialTerms(value, candidate = {}) {
  const source = isObject(value) ? value : {};
  return {
    policyMaximum: normalizeEvidenceList(source.policyMaximum || candidate.policyMaximum || candidate.coverageHighlights, "Policy maximum"),
    deductible: normalizeEvidenceList(source.deductible || candidate.deductible, "Deductible"),
    coinsurance: normalizeEvidenceList(source.coinsurance || candidate.coinsurance, "Coinsurance"),
    outOfPocketMax: normalizeEvidenceList(source.outOfPocketMax || candidate.outOfPocketMax, "Out-of-pocket maximum"),
    perIncidentLimit: normalizeEvidenceList(source.perIncidentLimit || candidate.perIncidentLimit, "Per incident limit"),
    benefitCaps: normalizeEvidenceList(source.benefitCaps || candidate.benefitCaps || candidate.benefitSchedule, "Benefit cap")
  };
}

function normalizePreExisting(value, candidate = {}) {
  const source = isObject(value) ? value : {};
  return {
    summary: asText(source.summary || candidate.preExisting || ""),
    definition: asText(source.definition),
    exclusion: asText(source.exclusion),
    acuteOnset: asText(source.acuteOnset || candidate.acuteOnset || ""),
    stabilityRequirement: asText(source.stabilityRequirement || source.stability || ""),
    lookbackPeriod: asText(source.lookbackPeriod || candidate.lookbackPeriod || ""),
    waitingPeriod: asText(source.waitingPeriod || ""),
    ageLimits: normalizeEvidenceList(source.ageLimits || candidate.ageLimits, "Age limit"),
    coverageLimits: normalizeEvidenceList(source.coverageLimits || source.limits, "Coverage limit"),
    warnings: normalizeEvidenceList(source.warnings || candidate.warnings, "Pre-existing warning")
  };
}

function evidenceHasValue(item) {
  return Boolean(item && (asText(item.finding) || asText(item.detail) || asText(item.sourceText)));
}

function listHasValue(items) {
  return Array.isArray(items) && items.some(evidenceHasValue);
}

function evaluateQualityGate(report) {
  const missingCriticalFields = [];
  if (!listHasValue(report.financialTerms?.policyMaximum)) missingCriticalFields.push("policy maximum");
  if (!listHasValue(report.financialTerms?.deductible)) missingCriticalFields.push("deductible");
  const hasPreExisting = Boolean(
    asText(report.preExistingCondition?.summary)
    || asText(report.preExistingCondition?.definition)
    || asText(report.preExistingCondition?.exclusion)
    || asText(report.preExistingCondition?.acuteOnset)
    || listHasValue(report.preExistingCondition?.warnings)
  );
  if (!hasPreExisting) missingCriticalFields.push("pre-existing condition / acute onset wording");
  const hasClaimDeadline = (report.deadlines || []).some((item) => /claim|proof|notice|appeal/i.test(`${item.type} ${item.text} ${item.relativeRule}`));
  if (!hasClaimDeadline) missingCriticalFields.push("claim notice / proof-of-loss deadline");
  if (!listHasValue(report.exclusions?.general) && !Object.values(report.exclusions || {}).some(listHasValue)) missingCriticalFields.push("exclusions");
  const lowConfidenceCount = [
    ...(report.coverageHighlights || []),
    ...(report.claimPreparation || []),
    ...(report.manualReview?.reasons || []),
    ...Object.values(report.financialTerms || {}).flat(),
    ...Object.values(report.medicalBenefits || {}).flat(),
    ...Object.values(report.accidentMedical || {}).flat(),
    ...Object.values(report.exclusions || {}).flat()
  ].filter((item) => item?.confidence === "low").length;
  const manualReviewReasons = [
    ...(report.manualReview?.reasons || []).map((item) => item.finding || item.detail || item.title).filter(Boolean),
    ...missingCriticalFields.map((field) => `Missing critical field: ${field}`)
  ];
  if (lowConfidenceCount >= 3) manualReviewReasons.push(`Multiple low-confidence findings: ${lowConfidenceCount}`);
  const status = missingCriticalFields.length || manualReviewReasons.length || report.manualReview?.required ? "needs_review" : "complete";
  return {
    status,
    missingCriticalFields,
    manualReviewReasons: [...new Set(manualReviewReasons)]
  };
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
  const base = {
    documentSummary: {
      fileName: asText(parsed.fileName || fallback.fileName),
      documentType: asText(parsed.documentType || "insurance_policy"),
      carrier: asText(parsed.carrier),
      productName: asText(parsed.productName),
      policyType: asText(parsed.policyType),
      summary: answerText("summary") || answerText("document_identity") || asText(parsed.summary || fallback.summary),
      confidence: normalizeConfidence(byId.get("summary")?.confidence || byId.get("document_identity")?.confidence)
    },
    identity: normalizeIdentity(parsed.identity, parsed),
    coverageHighlights: normalizeEvidenceList(parsed.coverageHighlights, "Coverage highlight").concat(answerItem("coverage_highlights", "Coverage highlights")),
    financialTerms: normalizeFinancialTerms(parsed.financialTerms, parsed),
    medicalBenefits: normalizeEvidenceMap(parsed.medicalBenefits || {}, medicalBenefitKeys, {
      er: "ER",
      urgentCare: "Urgent care",
      hospitalization: "Hospitalization",
      icu: "ICU",
      ambulance: "Ambulance",
      surgery: "Surgery",
      physician: "Physician",
      diagnostics: "Diagnostics",
      prescriptionDrugs: "Prescription drugs",
      dental: "Dental",
      medicalEvacuation: "Medical evacuation"
    }),
    preExistingCondition: normalizePreExisting(parsed.preExistingCondition, parsed),
    accidentMedical: normalizeEvidenceMap(parsed.accidentMedical || {}, accidentMedicalKeys, {
      er: "Accident ER",
      hospitalization: "Accident hospitalization",
      surgery: "Accident surgery",
      ambulance: "Accident ambulance",
      separateBilling: "Separate billing",
      medicalEvacuation: "Medical evacuation",
      exclusions: "Accident exclusion"
    }),
    exclusions: normalizeEvidenceMap(parsed.exclusions || {}, exclusionKeys, {
      alcoholDrug: "Alcohol or drug exclusion",
      hazardousActivity: "Hazardous activity",
      pregnancy: "Pregnancy",
      routineCare: "Routine care",
      mentalHealth: "Mental health",
      sports: "Sports",
      residenceCountry: "Residence country",
      general: "General exclusion"
    }),
    claimPreparation: normalizeEvidenceList(parsed.claimPreparation, "Claim preparation").concat(answerItem("claim_preparation", "Claim preparation")),
    deadlines: asArray(parsed.deadlines).map(normalizeDeadline).filter((item) => item.text || item.date || item.relativeRule),
    manualReview: {
      required: Boolean(parsed.manualReview?.required ?? parsed.manualReviewRequired ?? true),
      reasons: normalizeEvidenceList(parsed.manualReview?.reasons || parsed.manualReviewReasons || parsed.warnings || [], "Manual review").concat(answerItem("warnings", "Manual review"))
    },
    missingInformation: normalizeEvidenceList(parsed.missingInformation || parsed.missingInfo, "Missing information").concat(answerItem("missing_info", "Missing information")),
    nextSteps: normalizeEvidenceList(parsed.nextSteps, "Next step").concat(answerItem("next_steps", "Next step")),
    citations: normalizeEvidenceList(parsed.citations || parsed.sourceSnippets, "Citation"),
    qualityGate: { status: "needs_review", missingCriticalFields: [], manualReviewReasons: [] },
    answers,
    rawDebug: parsed.rawDebug || {}
  };
  base.financialTerms.policyMaximum.push(...answerItem("financial_terms", "Financial terms"));
  base.medicalBenefits.er.push(...answerItem("medical_benefits", "Medical benefits"));
  base.preExistingCondition.warnings.push(...answerItem("pre_existing", "Pre-existing / acute onset"));
  base.accidentMedical.er.push(...answerItem("accident_medical", "Accident medical"));
  base.exclusions.general.push(...answerItem("exclusions", "Exclusion"));
  base.deadlines.push(...answerItem("claim_deadlines", "Claim deadline").map((item) => normalizeDeadline({ ...item, type: "claim", text: item.detail })));
  base.nextSteps.push(...answerItem("final_next_steps", "Next step"));
  base.qualityGate = evaluateQualityGate(base);
  return base;
}

function validateEvidenceObject(value, key, errors) {
  if (!isObject(value)) {
    errors.push(`${key} must be an object.`);
    return;
  }
  if (!["high", "medium", "low"].includes(value.confidence)) errors.push(`${key}.confidence must be high, medium, or low.`);
}

function validateEvidenceListValue(value, key, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array.`);
    return;
  }
  value.forEach((item, index) => validateEvidenceObject(item, `${key}[${index}]`, errors));
}

function validateEvidenceMap(report, key, keys, errors) {
  if (!isObject(report[key])) {
    errors.push(`${key} must be an object.`);
    return;
  }
  keys.forEach((childKey) => validateEvidenceListValue(report[key][childKey], `${key}.${childKey}`, errors));
}

function validateIdentity(report, errors) {
  if (!isObject(report.identity)) {
    errors.push("identity must be an object.");
    return;
  }
  identityKeys.forEach((key) => validateEvidenceObject(report.identity[key], `identity.${key}`, errors));
  identityListKeys.forEach((key) => validateEvidenceListValue(report.identity[key], `identity.${key}`, errors));
}

function validatePreExistingCondition(report, errors) {
  if (!isObject(report.preExistingCondition)) {
    errors.push("preExistingCondition must be an object.");
    return;
  }
  ["ageLimits", "coverageLimits", "warnings"].forEach((key) => {
    validateEvidenceListValue(report.preExistingCondition[key], `preExistingCondition.${key}`, errors);
  });
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
  validateIdentity(report, errors);
  validateEvidenceListValue(report.coverageHighlights, "coverageHighlights", errors);
  validateEvidenceMap(report, "financialTerms", financialTermKeys, errors);
  validateEvidenceMap(report, "medicalBenefits", medicalBenefitKeys, errors);
  validatePreExistingCondition(report, errors);
  validateEvidenceMap(report, "accidentMedical", accidentMedicalKeys, errors);
  validateEvidenceMap(report, "exclusions", exclusionKeys, errors);
  ["claimPreparation", "missingInformation", "nextSteps", "citations"].forEach((key) => validateEvidenceListValue(report[key], key, errors));
  if (!Array.isArray(report.deadlines)) errors.push("deadlines must be an array.");
  if (!isObject(report.manualReview)) {
    errors.push("manualReview is required.");
  } else {
    if (typeof report.manualReview.required !== "boolean") errors.push("manualReview.required must be a boolean.");
    validateEvidenceListValue(report.manualReview.reasons, "manualReview.reasons", errors);
  }
  if (!isObject(report.qualityGate)) {
    errors.push("qualityGate is required.");
  } else {
    if (!report.qualityGate.status) errors.push("qualityGate.status is required.");
    if (!Array.isArray(report.qualityGate.missingCriticalFields)) errors.push("qualityGate.missingCriticalFields must be an array.");
    if (!Array.isArray(report.qualityGate.manualReviewReasons)) errors.push("qualityGate.manualReviewReasons must be an array.");
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
    identity: normalizeIdentity(candidate.identity, candidate),
    coverageHighlights: normalizeEvidenceList(candidate.coverageHighlights, "Coverage highlight"),
    financialTerms: normalizeFinancialTerms(candidate.financialTerms, candidate),
    medicalBenefits: normalizeEvidenceMap(candidate.medicalBenefits || {}, medicalBenefitKeys, {
      er: "ER",
      urgentCare: "Urgent care",
      hospitalization: "Hospitalization",
      icu: "ICU",
      ambulance: "Ambulance",
      surgery: "Surgery",
      physician: "Physician",
      diagnostics: "Diagnostics",
      prescriptionDrugs: "Prescription drugs",
      dental: "Dental",
      medicalEvacuation: "Medical evacuation"
    }),
    preExistingCondition: normalizePreExisting(candidate.preExistingCondition, candidate),
    accidentMedical: normalizeEvidenceMap(candidate.accidentMedical || {}, accidentMedicalKeys, {
      er: "Accident ER",
      hospitalization: "Accident hospitalization",
      surgery: "Accident surgery",
      ambulance: "Accident ambulance",
      separateBilling: "Separate billing",
      medicalEvacuation: "Medical evacuation",
      exclusions: "Accident exclusion"
    }),
    exclusions: normalizeEvidenceMap(candidate.exclusions || {}, exclusionKeys, {
      alcoholDrug: "Alcohol or drug exclusion",
      hazardousActivity: "Hazardous activity",
      pregnancy: "Pregnancy",
      routineCare: "Routine care",
      mentalHealth: "Mental health",
      sports: "Sports",
      residenceCountry: "Residence country",
      general: "General exclusion"
    }),
    claimPreparation: normalizeEvidenceList(candidate.claimPreparation, "Claim preparation"),
    deadlines: asArray(candidate.deadlines).map(normalizeDeadline).filter((item) => item.text || item.date || item.relativeRule),
    manualReview: {
      required: Boolean(candidate.manualReview?.required),
      reasons: normalizeEvidenceList(candidate.manualReview?.reasons, "Manual review")
    },
    missingInformation: normalizeEvidenceList(candidate.missingInformation, "Missing information"),
    nextSteps: normalizeEvidenceList(candidate.nextSteps, "Next step"),
    citations: normalizeEvidenceList(candidate.citations, "Citation"),
    qualityGate: { status: "needs_review", missingCriticalFields: [], manualReviewReasons: [] },
    answers: Array.isArray(candidate.answers) ? candidate.answers : [],
    rawDebug: candidate.rawDebug || {}
  };
  report.qualityGate = isObject(candidate.qualityGate)
    ? {
      ...evaluateQualityGate(report),
      ...candidate.qualityGate,
      missingCriticalFields: Array.isArray(candidate.qualityGate.missingCriticalFields) ? candidate.qualityGate.missingCriticalFields : evaluateQualityGate(report).missingCriticalFields,
      manualReviewReasons: Array.isArray(candidate.qualityGate.manualReviewReasons) ? candidate.qualityGate.manualReviewReasons : evaluateQualityGate(report).manualReviewReasons
    }
    : evaluateQualityGate(report);
  return { report, validation: validatePolicyAnalysisReport(report) };
}

module.exports = {
  normalizePolicyAnalysisReport,
  validatePolicyAnalysisReport
};
