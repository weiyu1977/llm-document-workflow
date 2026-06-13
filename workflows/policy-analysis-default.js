function itemSchema(description = "") {
  return {
    title: "short label",
    finding: description || "clear finding",
    detail: "plain-language explanation for the user",
    whyItMatters: "why this matters for coverage, claims, or manual review",
    userAction: "what the user should verify or do next",
    manualReviewRequired: false,
    sourceText: "short exact supporting wording from the document when available",
    page: "page number if known, otherwise empty string",
    confidence: "high|medium|low"
  };
}

function deadlineSchema() {
  return {
    type: "claim|appeal|coverage_start|coverage_end|cancel|other",
    date: "",
    relativeRule: "",
    text: "",
    whyItMatters: "",
    userAction: "",
    sourceText: "",
    page: "",
    confidence: "high|medium|low"
  };
}

function defaultPolicyAnalysisWorkflow() {
  return {
    workflowId: "policy_analysis",
    version: "v2",
    providerId: "gemini",
    model: "gemini-2.5-flash",
    normalizerId: "policy_analysis",
    legacyAdapterId: "visitor_insurance",
    parserStrategy: "policy_report_json_v2",
    systemPrompt: [
      "You are a careful document analyst for visitor medical insurance and travel insurance policy documents.",
      "Use only the uploaded document or pasted text. Do not invent coverage, claim approval, eligibility, deadlines, or carrier intent.",
      "If a term is absent or ambiguous, mark it low confidence and add a manual review reason.",
      "Return user-facing wording, keep short source snippets for verification, and separate facts from actions."
    ].join("\n"),
    businessContext: [
      "The host product helps families understand U.S. visitor medical insurance policies after purchase.",
      "Prioritize policy identity, financial terms, medical benefits, accident medical, ER, urgent care, hospitalization, ambulance, surgery, medical evacuation, pre-existing condition / acute onset, exclusions, claim requirements, deadlines, and manual review triggers.",
      "This is not licensed insurance advice. All conclusions must be verified against the official policy PDF and carrier confirmation."
    ].join("\n"),
    taskPrompt: [
      "Read the PDF attachment or pasted policy text.",
      "Answer by filling the required PolicyAnalysisReport JSON object.",
      "Do not output markdown. Do not include prose before or after the JSON.",
      "Keep each item concise. Split long bullet paragraphs into separate structured items.",
      "For each extracted item, include: finding, detail, whyItMatters, userAction, sourceText, page, confidence, and manualReviewRequired.",
      "Use low confidence when the wording is missing, only implied, or requires the carrier to confirm."
    ].join("\n"),
    questions: [
      { id: "document_identity", title: "Document identity", prompt: "Extract carrier, product, policy/certificate number, insured names, coverage start/end, trip dates, destination area, effective area, residence/origin country, assistance phone, and network/PPO if present." },
      { id: "financial_terms", title: "Financial terms", prompt: "Extract policy maximum, deductible, coinsurance, out-of-pocket maximum, per-incident limits, benefit caps, and any fixed/limited benefit schedule clues." },
      { id: "medical_benefits", title: "Medical benefits", prompt: "Extract ER, urgent care, hospitalization, ICU, surgery, physician visits, diagnostics, ambulance, prescription drugs, dental, and medical evacuation wording. Keep each benefit category separate." },
      { id: "pre_existing", title: "Pre-existing / acute onset", prompt: "Extract pre-existing condition definition, exclusions, acute onset wording, stability requirement, look-back period, waiting period, age limits, coverage limits, and warnings." },
      { id: "accident_medical", title: "Accident medical", prompt: "Extract wording relevant to car accident or other accident injury: ER, hospital, surgery, ambulance, separate billing, exclusions, prior authorization, and assistance requirements." },
      { id: "exclusions", title: "Exclusions", prompt: "Extract exclusions for alcohol/drugs, hazardous activities, pregnancy, routine care, mental health, sports, residence country, unlawful acts, and general exclusions." },
      { id: "claim_deadlines", title: "Claims and deadlines", prompt: "Extract claim materials, itemized bill, diagnosis records, receipts, proof of travel, approval codes, claim form, notice/proof-of-loss deadlines, appeal deadlines, and submission methods." },
      { id: "manual_review", title: "Manual review", prompt: "List every ambiguity, missing document, exclusion, high-risk clause, already-in-U.S. symptom issue, recent treatment issue, or wording that requires human review." },
      { id: "final_next_steps", title: "Next steps", prompt: "Give practical next steps after analysis, including what to verify, what to save, which deadlines to add to calendar, and what to ask the carrier." }
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
      identity: {
        carrier: itemSchema("carrier"),
        productName: itemSchema("product name"),
        policyNumber: itemSchema("policy number"),
        certificateNumber: itemSchema("certificate number"),
        insuredNames: [itemSchema("insured person")],
        coverageStart: itemSchema("coverage start"),
        coverageEnd: itemSchema("coverage end"),
        travelDates: [itemSchema("travel date")],
        destinationArea: itemSchema("destination or covered area"),
        effectiveArea: itemSchema("where coverage applies"),
        residenceCountry: itemSchema("residence or origin country"),
        assistancePhone: itemSchema("assistance phone"),
        network: itemSchema("PPO/network/direct billing")
      },
      coverageHighlights: [itemSchema("coverage term")],
      financialTerms: {
        policyMaximum: [itemSchema("policy maximum")],
        deductible: [itemSchema("deductible")],
        coinsurance: [itemSchema("coinsurance")],
        outOfPocketMax: [itemSchema("out-of-pocket maximum")],
        perIncidentLimit: [itemSchema("per incident limit")],
        benefitCaps: [itemSchema("benefit cap or schedule limit")]
      },
      medicalBenefits: {
        er: [itemSchema("ER benefit")],
        urgentCare: [itemSchema("urgent care benefit")],
        hospitalization: [itemSchema("hospital benefit")],
        icu: [itemSchema("ICU benefit")],
        ambulance: [itemSchema("ambulance benefit")],
        surgery: [itemSchema("surgery benefit")],
        physician: [itemSchema("physician visit benefit")],
        diagnostics: [itemSchema("diagnostic test benefit")],
        prescriptionDrugs: [itemSchema("prescription drug benefit")],
        dental: [itemSchema("dental benefit")],
        medicalEvacuation: [itemSchema("medical evacuation benefit")]
      },
      preExistingCondition: {
        summary: "",
        definition: "",
        exclusion: "",
        acuteOnset: "",
        stabilityRequirement: "",
        lookbackPeriod: "",
        waitingPeriod: "",
        ageLimits: [itemSchema("age-related limitation")],
        coverageLimits: [itemSchema("pre-existing or acute onset coverage limit")],
        warnings: [itemSchema("pre-existing condition warning")]
      },
      accidentMedical: {
        er: [itemSchema("accident ER wording")],
        hospitalization: [itemSchema("accident hospital wording")],
        surgery: [itemSchema("accident surgery wording")],
        ambulance: [itemSchema("accident ambulance wording")],
        separateBilling: [itemSchema("separate billing or provider billing wording")],
        exclusions: [itemSchema("accident medical exclusion")]
      },
      exclusions: {
        alcoholDrug: [itemSchema("alcohol or drug exclusion")],
        hazardousActivity: [itemSchema("hazardous activity exclusion")],
        pregnancy: [itemSchema("pregnancy exclusion")],
        routineCare: [itemSchema("routine or preventive care exclusion")],
        mentalHealth: [itemSchema("mental health exclusion")],
        sports: [itemSchema("sports exclusion")],
        residenceCountry: [itemSchema("residence country or home country exclusion")],
        general: [itemSchema("general exclusion")]
      },
      claimPreparation: [itemSchema("claim material or action")],
      deadlines: [deadlineSchema()],
      manualReview: { required: true, reasons: [itemSchema("manual review reason")] },
      missingInformation: [itemSchema("missing information")],
      nextSteps: [itemSchema("next step")],
      citations: [itemSchema("source citation")]
    },
    repairPrompt: [
      "You are repairing an LLM document-analysis output.",
      "Convert the raw output into the required PolicyAnalysisReport JSON schema.",
      "Preserve facts, split long bullets into separate items, and do not invent missing policy terms.",
      "If the raw output uses markdown or prose, map it into the closest section and mark confidence low or medium.",
      "Do not drop source snippets, warnings, deadlines, exclusions, or manual review triggers.",
      "Return strict JSON only."
    ].join("\n"),
    displayConfig: {
      renderer: "policy-analysis-report",
      primarySections: ["documentSummary", "identity", "financialTerms", "medicalBenefits", "preExistingCondition", "accidentMedical", "exclusions", "claimPreparation", "deadlines", "manualReview", "missingInformation", "nextSteps"]
    }
  };
}

module.exports = {
  defaultPolicyAnalysisWorkflow
};
