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
  const promptPack = {
    document_identity_prompt: [
      "Fill documentSummary and identity only from explicit document text.",
      "Look for: carrier/underwriter, administrator, product/plan name, plan type, policy/certificate number, insured/traveler names, effective dates, trip dates, destination/covered area, residence/origin country, assistance phone, claim phone/email, PPO/network/direct billing wording.",
      "If a value is missing, keep the field empty or create a low-confidence item with userAction='Ask carrier or check policy certificate'."
    ].join(" "),
    medical_benefit_prompt: [
      "Fill medicalBenefits with separate arrays for er, urgentCare, hospitalization, icu, ambulance, surgery, physician, diagnostics, prescriptionDrugs, dental, and medicalEvacuation.",
      "For each benefit, capture limit, deductible/excess, coinsurance, prior authorization/precertification, in-network/direct billing wording, reimbursement wording, and exclusions tied to that benefit.",
      "Do not merge multiple benefits into one item."
    ].join(" "),
    financial_risk_prompt: [
      "Fill financialTerms with policyMaximum, deductible, coinsurance, outOfPocketMax, perIncidentLimit, and benefitCaps.",
      "Pay special attention to fixed/limited benefit schedules, per-service caps, per-day hospital caps, ER caps, surgery caps, ambulance caps, and whether the plan pays usual/customary/reasonable charges.",
      "When the policy maximum is missing, mark qualityGate missingCriticalFields with policyMaximum."
    ].join(" "),
    pre_existing_prompt: [
      "Fill preExistingCondition with definition, exclusion, acuteOnset, stabilityRequirement, lookbackPeriod, waitingPeriod, ageLimits, coverageLimits, and warnings.",
      "Extract exact wording for pre-existing disease/condition, acute onset/sudden recurrence, stable period, look-back period, medication change, recent treatment, diagnosis pending, age cap, and dollar cap.",
      "If the policy excludes pre-existing conditions broadly or acute onset is absent/unclear, add a manualReview reason."
    ].join(" "),
    accident_medical_prompt: [
      "Fill accidentMedical for car accident or other accidental injury scenarios.",
      "Extract ER, hospitalization, surgery, ambulance, separate physician billing, emergency medical evacuation, prior approval, assistance company coordination, and accident-related exclusions.",
      "Focus on what a visitor should verify if injured in a car accident and needing ER, admission, surgery, or medical transport."
    ].join(" "),
    claim_deadline_prompt: [
      "Fill claimPreparation and deadlines.",
      "Extract notice deadline, proof-of-loss deadline, claim form requirement, itemized bill, medical records, receipts, passport/travel records, authorization, police/accident report, appeal deadline, mailing/email/fax submission methods, and assistance company approval codes.",
      "Deadlines must use type, date or relativeRule, text, whyItMatters, userAction, sourceText, page, and confidence."
    ].join(" "),
    exclusion_prompt: [
      "Fill exclusions with alcoholDrug, hazardousActivity, pregnancy, routineCare, mentalHealth, sports, residenceCountry, and general.",
      "Also capture exclusions for war/riot, unlawful acts, self-inflicted injury, elective care, checkups, dental routine care, home/residence country care, professional sports, high-risk activities, and treatment without required approval.",
      "Each exclusion item should explain why it matters and what the user should verify."
    ].join(" "),
    manual_review_prompt: [
      "Fill manualReview.reasons and qualityGate.",
      "Require human review when: traveler is high age, already in the U.S. with symptoms, recent hospitalization/surgery/medication change, pregnancy, chronic disease, missing certificate pages, scanned/unreadable PDF, low confidence key terms, policy maximum missing, pre-existing/acute onset unclear, claim deadline missing, or any direct-billing/network ambiguity.",
      "Set manualReview.required=true if any reason exists."
    ].join(" "),
    final_report_prompt: [
      "Fill missingInformation, nextSteps, and citations.",
      "Next steps should tell the user what to verify with carrier, what documents to save, which deadlines to calendar, and when to seek licensed or human review.",
      "Citations should be short source snippets with page numbers when available."
    ].join(" ")
  };
  return {
    workflowId: "policy_analysis",
    version: "v3",
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
      "The first character of the response must be { and the last character must be }.",
      "Use exactly the top-level keys shown in the output schema. Do not rename keys and do not add wrapper keys such as answers, result, report, or analysis.",
      "The top-level keys must include documentSummary, identity, coverageHighlights, financialTerms, medicalBenefits, preExistingCondition, accidentMedical, exclusions, claimPreparation, deadlines, manualReview, qualityGate, missingInformation, nextSteps, and citations.",
      "Keep each item concise. Split long bullet paragraphs into separate structured items.",
      "Use empty arrays for sections with no evidence. Do not omit required arrays or objects.",
      "For each extracted item, include: finding, detail, whyItMatters, userAction, sourceText, page, confidence, and manualReviewRequired.",
      "Do not append bare confidence words such as high or medium to the end of finding/detail text. Put confidence only in the confidence field.",
      "If source evidence exists, put the exact quote in sourceText and the page number in page; do not mix source text into finding.",
      "Use confidence only as high, medium, or low.",
      "Use low confidence when the wording is missing, only implied, or requires the carrier to confirm."
    ].join("\n"),
    promptPack,
    questions: [
      { id: "document_identity_prompt", title: "Document identity", prompt: promptPack.document_identity_prompt },
      { id: "medical_benefit_prompt", title: "Medical benefits", prompt: promptPack.medical_benefit_prompt },
      { id: "financial_risk_prompt", title: "Financial risk", prompt: promptPack.financial_risk_prompt },
      { id: "pre_existing_prompt", title: "Pre-existing / acute onset", prompt: promptPack.pre_existing_prompt },
      { id: "accident_medical_prompt", title: "Accident medical", prompt: promptPack.accident_medical_prompt },
      { id: "claim_deadline_prompt", title: "Claims and deadlines", prompt: promptPack.claim_deadline_prompt },
      { id: "exclusion_prompt", title: "Exclusions", prompt: promptPack.exclusion_prompt },
      { id: "manual_review_prompt", title: "Manual review", prompt: promptPack.manual_review_prompt },
      { id: "final_report_prompt", title: "Final report", prompt: promptPack.final_report_prompt }
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
        medicalEvacuation: [itemSchema("accident medical evacuation wording")],
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
      qualityGate: {
        status: "complete|needs_review|incomplete",
        missingCriticalFields: ["critical field that is absent or too ambiguous"],
        manualReviewReasons: ["reason the report should be reviewed by a human"]
      },
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
      "The first character of the response must be { and the last character must be }.",
      "Return strict JSON only."
    ].join("\n"),
    displayConfig: {
      renderer: "policy-analysis-report",
      primarySections: ["documentSummary", "identity", "medicalBenefits", "financialTerms", "preExistingCondition", "accidentMedical", "claimPreparation", "deadlines", "exclusions", "manualReview", "missingInformation", "nextSteps"]
    }
  };
}

module.exports = {
  defaultPolicyAnalysisWorkflow
};
