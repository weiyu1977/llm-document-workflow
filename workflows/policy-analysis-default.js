function itemSchema(description = "") {
  return {
    title: "short label",
    detail: description || "clear user-facing detail",
    sourceText: "short exact supporting wording from the document when available",
    page: "page number if known, otherwise empty string",
    confidence: "high|medium|low"
  };
}

function defaultPolicyAnalysisWorkflow() {
  return {
    workflowId: "policy_analysis",
    version: "v1",
    providerId: "gemini",
    model: "gemini-2.5-flash",
    normalizerId: "policy_analysis",
    legacyAdapterId: "visitor_insurance",
    parserStrategy: "policy_report_json",
    systemPrompt: [
      "You are a careful document analyst for visitor medical insurance and travel insurance policy documents.",
      "Use only the uploaded document or pasted text. Do not invent coverage, claim approval, eligibility, deadlines, or carrier intent.",
      "If a term is absent or ambiguous, mark it low confidence and add a manual review reason.",
      "Return user-facing wording, but keep enough source text for verification."
    ].join("\n"),
    businessContext: [
      "The host product helps families understand U.S. visitor medical insurance policies after purchase.",
      "Prioritize medical benefits, ER, urgent care, hospitalization, ambulance, surgery, pre-existing condition / acute onset, exclusions, claim requirements, deadlines, and manual review triggers.",
      "This is not licensed insurance advice. All conclusions must be verified against the official policy PDF and carrier confirmation."
    ].join("\n"),
    taskPrompt: [
      "Read the PDF attachment or pasted policy text.",
      "Answer by filling the required PolicyAnalysisReport JSON object.",
      "Do not output markdown. Do not include prose before or after the JSON.",
      "Keep each item concise. Split long bullet paragraphs into separate structured items."
    ].join("\n"),
    questions: [
      { id: "summary", title: "File/text summary", prompt: "Identify the document type, likely policy/product type, carrier/product if present, and the main review risks." },
      { id: "coverage_highlights", title: "Coverage highlights", prompt: "Extract policy maximum, deductible, coinsurance, PPO/network, assistance phone, coverage dates, and comprehensive vs fixed/limited benefit clues." },
      { id: "medical_benefits", title: "Medical benefits", prompt: "Extract ER, urgent care, hospitalization, ambulance, surgery, ICU, diagnostics, physician visits, and accident-related medical wording." },
      { id: "pre_existing", title: "Pre-existing / acute onset", prompt: "Extract pre-existing condition exclusions, acute onset wording, look-back period, age limits, waiting periods, and warnings." },
      { id: "claim_preparation", title: "Claim preparation", prompt: "Extract claim materials, itemized bill, diagnosis records, receipts, proof of travel, approval codes, claim form, notice/proof-of-loss deadlines, and submission methods." },
      { id: "manual_review", title: "Manual review", prompt: "List every ambiguity, missing document, exclusion, high-risk clause, or wording that requires human review." },
      { id: "next_steps", title: "Next steps", prompt: "Give practical next steps after analysis, including what to verify, what to save, and which deadlines to add to calendar." }
    ],
    outputSchema: {
      documentSummary: {
        fileName: "",
        documentType: "insurance_policy|certificate|brochure|claim_form|unknown",
        carrier: "",
        productName: "",
        policyType: "comprehensive|fixed_benefit|limited|travel_insurance|unknown",
        summary: "",
        confidence: "high|medium|low"
      },
      coverageHighlights: [itemSchema("coverage term")],
      medicalBenefits: {
        er: [itemSchema("ER benefit")],
        urgentCare: [itemSchema("urgent care benefit")],
        hospitalization: [itemSchema("hospital benefit")],
        ambulance: [itemSchema("ambulance benefit")],
        surgery: [itemSchema("surgery benefit")]
      },
      preExistingCondition: {
        summary: "",
        acuteOnset: "",
        lookbackPeriod: "",
        ageLimits: [itemSchema("age-related limitation")],
        warnings: [itemSchema("pre-existing condition warning")]
      },
      claimPreparation: [itemSchema("claim material or action")],
      deadlines: [{ type: "claim|cancel|coverage_end|other", date: "", relativeRule: "", text: "", sourceText: "", page: "", confidence: "high|medium|low" }],
      manualReview: { required: true, reasons: [itemSchema("manual review reason")] },
      missingInformation: [itemSchema("missing information")],
      nextSteps: [itemSchema("next step")],
      citations: [itemSchema("source citation")]
    },
    repairPrompt: [
      "You are repairing an LLM document-analysis output.",
      "Convert the raw output into the required PolicyAnalysisReport JSON schema.",
      "Preserve facts, split long bullets into separate items, and do not invent missing policy terms.",
      "Return strict JSON only."
    ].join("\n"),
    displayConfig: {
      renderer: "policy-analysis-report",
      primarySections: ["documentSummary", "coverageHighlights", "medicalBenefits", "preExistingCondition", "claimPreparation", "deadlines", "manualReview", "missingInformation", "nextSteps"]
    }
  };
}

module.exports = {
  defaultPolicyAnalysisWorkflow
};
