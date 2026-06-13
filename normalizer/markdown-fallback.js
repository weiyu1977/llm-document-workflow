function splitBullets(text) {
  return String(text || "")
    .split(/\n|(?:^|\s)[*-]\s+/)
    .map((line) => line.replace(/^\s*[*-]\s*/, "").trim())
    .filter(Boolean);
}

function classifyBullet(line) {
  const text = String(line || "");
  if (/exclusion|excluded|not covered|hazardous|alcohol|drug|pregnancy|sports|routine care/i.test(text)) {
    return "exclusions";
  }
  if (/accident|car crash|auto|vehicle/i.test(text)) {
    return "accidentMedical";
  }
  if (/human review|manual review|requires review|clarification|ambiguity|look-back|pre-existing|acute onset/i.test(text)) {
    return "manualReview";
  }
  if (/claim|document|receipt|bill|record|approval|police report|certificate|confirmation/i.test(text)) {
    return "claimPreparation";
  }
  if (/deadline|days|submit|notice|proof of loss/i.test(text)) {
    return "deadlines";
  }
  if (/ER|emergency|hospital|ambulance|surgery|urgent care/i.test(text)) {
    return "medicalBenefits";
  }
  return "coverageHighlights";
}

function evidence(line, title = "") {
  return {
    title: title || line.slice(0, 80),
    finding: line,
    detail: line,
    whyItMatters: "",
    userAction: "",
    manualReviewRequired: false,
    sourceText: "",
    page: "",
    confidence: "low"
  };
}

function markdownFallbackReport(rawOutput, fallback = {}) {
  const bullets = splitBullets(rawOutput);
  const report = {
    documentSummary: {
      fileName: fallback.fileName || "",
      documentType: "insurance_policy",
      carrier: "",
      productName: "",
      policyType: "",
      summary: fallback.summary || "The model returned unstructured text. The system extracted visible bullets as a fallback.",
      confidence: "low"
    },
    identity: {
      carrier: evidence("", "carrier"),
      productName: evidence("", "productName"),
      policyNumber: evidence("", "policyNumber"),
      certificateNumber: evidence("", "certificateNumber"),
      insuredNames: [],
      coverageStart: evidence("", "coverageStart"),
      coverageEnd: evidence("", "coverageEnd"),
      travelDates: [],
      destinationArea: evidence("", "destinationArea"),
      effectiveArea: evidence("", "effectiveArea"),
      residenceCountry: evidence("", "residenceCountry"),
      assistancePhone: evidence("", "assistancePhone"),
      network: evidence("", "network")
    },
    coverageHighlights: [],
    financialTerms: { policyMaximum: [], deductible: [], coinsurance: [], outOfPocketMax: [], perIncidentLimit: [], benefitCaps: [] },
    medicalBenefits: { er: [], urgentCare: [], hospitalization: [], icu: [], ambulance: [], surgery: [], physician: [], diagnostics: [], prescriptionDrugs: [], dental: [], medicalEvacuation: [] },
    preExistingCondition: { summary: "", definition: "", exclusion: "", acuteOnset: "", stabilityRequirement: "", lookbackPeriod: "", waitingPeriod: "", ageLimits: [], coverageLimits: [], warnings: [] },
    accidentMedical: { er: [], hospitalization: [], surgery: [], ambulance: [], separateBilling: [], exclusions: [] },
    exclusions: { alcoholDrug: [], hazardousActivity: [], pregnancy: [], routineCare: [], mentalHealth: [], sports: [], residenceCountry: [], general: [] },
    claimPreparation: [],
    deadlines: [],
    manualReview: { required: true, reasons: [] },
    missingInformation: [],
    nextSteps: [],
    citations: [],
    answers: [{
      questionId: "raw_model_output",
      title: "Raw model output",
      answer: String(rawOutput || "").slice(0, 8000),
      confidence: "low",
      sourceText: "",
      page: ""
    }],
    rawDebug: { parseMethod: "markdown_fallback" }
  };
  bullets.forEach((line) => {
    const type = classifyBullet(line);
    if (type === "manualReview") report.manualReview.reasons.push(evidence(line, "Manual review"));
    else if (type === "claimPreparation") report.claimPreparation.push(evidence(line, "Claim preparation"));
    else if (type === "deadlines") report.deadlines.push({ type: "claim", date: "", relativeRule: "", text: line, whyItMatters: "", userAction: "", sourceText: "", page: "", confidence: "low" });
    else if (type === "medicalBenefits") report.medicalBenefits.er.push(evidence(line, "Medical benefit"));
    else if (type === "accidentMedical") report.accidentMedical.er.push(evidence(line, "Accident medical"));
    else if (type === "exclusions") report.exclusions.general.push(evidence(line, "Exclusion"));
    else report.coverageHighlights.push(evidence(line, "Coverage highlight"));
  });
  return report;
}

module.exports = {
  markdownFallbackReport,
  splitBullets
};
