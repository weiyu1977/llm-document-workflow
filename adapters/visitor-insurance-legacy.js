function normalizeEvidenceSections(report) {
  return [
    ["summary", "Document summary", report.documentSummary.summary ? [{ detail: report.documentSummary.summary, confidence: report.documentSummary.confidence }] : []],
    ["coverage_highlights", "Coverage highlights", report.coverageHighlights],
    ["medical_benefits", "Medical benefits", Object.values(report.medicalBenefits).flat()],
    ["pre_existing", "Pre-existing / acute onset", [
      report.preExistingCondition.summary && { detail: report.preExistingCondition.summary, confidence: "medium" },
      report.preExistingCondition.acuteOnset && { detail: report.preExistingCondition.acuteOnset, confidence: "medium" },
      ...report.preExistingCondition.ageLimits,
      ...report.preExistingCondition.warnings
    ].filter(Boolean)],
    ["claim_preparation", "Claim preparation", report.claimPreparation],
    ["manual_review", "Manual review", report.manualReview.reasons],
    ["missing_info", "Missing information", report.missingInformation],
    ["next_steps", "Next steps", report.nextSteps]
  ]
    .filter(([, , items]) => items.length)
    .map(([id, title, items]) => ({
      id,
      title,
      status: items.some((item) => item.confidence === "low") ? "needs_review" : id === "manual_review" ? "manual_review" : "found",
      items: items.map((item) => item.detail || item.answer || item.text || String(item)).filter(Boolean),
      sourceText: items.map((item) => item.sourceText).filter(Boolean).join("\n")
    }));
}

function reportToVisitorInsuranceLegacyAnalysis({ report, workflow, providerResult, rawOutput, parsedOutput, diagnostics, fallbackAnalysis }) {
  const fields = {
    policyMaximum: report.coverageHighlights.find((item) => /maximum|limit/i.test(`${item.title} ${item.detail}`))?.detail || fallbackAnalysis?.fields?.policyMaximum || "",
    deductible: report.coverageHighlights.find((item) => /deductible/i.test(`${item.title} ${item.detail}`))?.detail || fallbackAnalysis?.fields?.deductible || "",
    preExisting: [report.preExistingCondition.summary, report.preExistingCondition.acuteOnset, ...report.preExistingCondition.warnings.map((item) => item.detail)].filter(Boolean).join(" ") || fallbackAnalysis?.fields?.preExisting || "",
    evacuation: report.coverageHighlights.find((item) => /evacuation/i.test(`${item.title} ${item.detail}`))?.detail || fallbackAnalysis?.fields?.evacuation || "",
    exclusions: report.manualReview.reasons.filter((item) => /exclusion|excluded|not covered/i.test(`${item.title} ${item.detail}`)).map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.exclusions || "",
    claimRequirements: report.claimPreparation.map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.claimRequirements || "",
    ambulance: report.medicalBenefits.ambulance.map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.ambulance || "",
    emergencyRoom: report.medicalBenefits.er.concat(report.medicalBenefits.urgentCare).map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.emergencyRoom || "",
    hospitalization: report.medicalBenefits.hospitalization.map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.hospitalization || "",
    surgery: report.medicalBenefits.surgery.map((item) => item.detail).join(" ") || fallbackAnalysis?.fields?.surgery || ""
  };
  const sections = normalizeEvidenceSections(report);
  const answers = sections.map((section) => ({
    questionId: section.id,
    title: section.title,
    answer: section.items.join("\n"),
    confidence: section.status === "needs_review" ? "low" : "medium",
    sourceText: section.sourceText,
    page: ""
  }));
  return {
    ...(fallbackAnalysis || {}),
    parser: "llm-document-workflow-v1",
    source: "llm_document_workflow",
    summary: report.documentSummary.summary || fallbackAnalysis?.summary || "",
    fields,
    sections,
    answers,
    deadlines: report.deadlines,
    flags: report.manualReview.reasons.map((item) => item.detail || item.title).filter(Boolean),
    citations: report.citations,
    policyReport: report,
    normalizedReport: report,
    rawOutput,
    parsedOutput,
    workflow: {
      workflowId: workflow.workflowId,
      version: workflow.version,
      providerId: workflow.providerId,
      model: workflow.model,
      promptVersion: workflow.version,
      schemaVersion: workflow.version,
      diagnostics
    },
    gemini: providerResult?.providerId === "gemini" ? {
      providerId: "gemini",
      mode: providerResult.mode,
      model: providerResult.model,
      location: providerResult.location,
      statusCode: providerResult.statusCode,
      finishReason: providerResult.finishReason,
      textLength: String(rawOutput || "").length,
      parseMethod: diagnostics.parseMethod,
      repaired: diagnostics.repaired
    } : undefined
  };
}

module.exports = {
  reportToVisitorInsuranceLegacyAnalysis
};
