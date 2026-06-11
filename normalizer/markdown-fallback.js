function splitBullets(text) {
  return String(text || "")
    .split(/\n|(?:^|\s)[*-]\s+/)
    .map((line) => line.replace(/^\s*[*-]\s*/, "").trim())
    .filter(Boolean);
}

function classifyBullet(line) {
  const text = String(line || "");
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
    detail: line,
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
    coverageHighlights: [],
    medicalBenefits: { er: [], urgentCare: [], hospitalization: [], ambulance: [], surgery: [] },
    preExistingCondition: { summary: "", acuteOnset: "", lookbackPeriod: "", ageLimits: [], warnings: [] },
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
    else if (type === "deadlines") report.deadlines.push({ type: "claim", date: "", relativeRule: "", text: line, sourceText: "", page: "", confidence: "low" });
    else if (type === "medicalBenefits") report.medicalBenefits.er.push(evidence(line, "Medical benefit"));
    else report.coverageHighlights.push(evidence(line, "Coverage highlight"));
  });
  return report;
}

module.exports = {
  markdownFallbackReport,
  splitBullets
};
