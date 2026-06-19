const debugFixtures = [
  {
    id: "valid_policy_json",
    title: "Valid PolicyAnalysisReport JSON",
    category: "valid_json",
    description: "A compact valid report used to verify direct JSON parsing and normalization.",
    rawOutput: JSON.stringify({
      documentSummary: {
        fileName: "sample-policy.pdf",
        documentType: "insurance_policy",
        carrier: "Example Carrier",
        productName: "Example Visitor Medical",
        policyType: "comprehensive",
        summary: "Visitor medical policy with ER, hospitalization, deductible, and claim requirements.",
        confidence: "high"
      },
      identity: {},
      coverageHighlights: [
        {
          title: "Emergency medical",
          finding: "Emergency medical expenses are covered up to the policy maximum.",
          detail: "The policy includes emergency medical benefits.",
          whyItMatters: "This is the core benefit for unexpected illness or injury.",
          userAction: "Confirm the exact policy maximum on the certificate.",
          manualReviewRequired: false,
          sourceText: "Emergency medical expenses up to the policy maximum.",
          page: "p.2",
          confidence: "high"
        }
      ],
      financialTerms: { policyMaximum: [], deductible: [], coinsurance: [], outOfPocketMax: [], perIncidentLimit: [], benefitCaps: [] },
      medicalBenefits: { er: [], urgentCare: [], hospitalization: [], icu: [], ambulance: [], surgery: [], physician: [], diagnostics: [], prescriptionDrugs: [], dental: [], medicalEvacuation: [] },
      preExistingCondition: { summary: "", definition: "", exclusion: "", acuteOnset: "", stabilityRequirement: "", lookbackPeriod: "", waitingPeriod: "", ageLimits: [], coverageLimits: [], warnings: [] },
      accidentMedical: { er: [], hospitalization: [], surgery: [], ambulance: [], separateBilling: [], medicalEvacuation: [], exclusions: [] },
      exclusions: { alcoholDrug: [], hazardousActivity: [], pregnancy: [], routineCare: [], mentalHealth: [], sports: [], residenceCountry: [], general: [] },
      claimPreparation: [],
      deadlines: [],
      manualReview: { required: true, reasons: [] },
      qualityGate: { status: "needs_review", missingCriticalFields: ["claim notice / proof-of-loss deadline"], manualReviewReasons: ["Confirm claim deadline."] },
      missingInformation: [],
      nextSteps: [],
      citations: []
    }, null, 2)
  },
  {
    id: "bad_json_repair",
    title: "Bad JSON repair",
    category: "bad_json",
    description: "Missing quotes/trailing comma style output for jsonrepair and best-effort tests.",
    rawOutput: `{
  documentSummary: {
    carrier: "Example Carrier",
    productName: "Broken JSON Policy",
    summary: "This intentionally omits quotes around keys",
  },
  coverageHighlights: [
    { finding: "ER covered", confidence: "medium", sourceText: "Emergency room treatment" },
  ],
}`
  },
  {
    id: "partial_json",
    title: "Partial JSON recovery",
    category: "partial_json",
    description: "Truncated object to test partial-json recovery and section diagnostics.",
    rawOutput: `{
  "documentSummary": {
    "carrier": "Example Carrier",
    "productName": "Partial Output Plan",
    "summary": "The model was truncated after several sections.",
    "confidence": "medium"
  },
  "coverageHighlights": [
    {
      "finding": "Hospital benefit found",
      "detail": "Hospitalization appears covered subject to limits.",
      "whyItMatters": "Hospital bills can be the largest exposure.",
      "userAction": "Confirm limits and deductible.",
      "sourceText": "Hospital room and board",
      "page": "p.5",
      "confidence": "medium",
      "manualReviewRequired": true
    }
  ],
  "financialTerms": {
    "policyMaximum": [
      { "finding": "USD 100,000", "confidence": "high"`
  },
  {
    id: "markdown_fallback",
    title: "Markdown fallback",
    category: "markdown",
    description: "Non-JSON markdown output used only when no structured object can be recovered.",
    rawOutput: [
      "### Summary",
      "- Carrier: Example Carrier",
      "- Product: Markdown Only Plan",
      "",
      "### Manual Review",
      "- Pre-existing condition wording is unclear.",
      "- Claim deadline is missing."
    ].join("\n")
  },
  {
    id: "max_tokens",
    title: "MAX_TOKENS truncation",
    category: "max_tokens",
    description: "Output containing a truncation marker and provider finish reason metadata.",
    rawOutput: `{
  "documentSummary": {
    "carrier": "Example Carrier",
    "productName": "Long Output Plan",
    "summary": "The provider stopped because maxOutputTokens was too low.",
    "confidence": "medium"
  },
  "medicalBenefits": {
    "er": [
      {
        "finding": "Emergency room treatment",
        "detail": "Covered subject to deductible and exclusions.",
        "whyItMatters": "ER care is a common visitor medical scenario.",
        "userAction": "Check ER copay and prior authorization rules.",
        "sourceText": "Emergency room treatment",
        "page": "p.8",
        "confidence": "medium",
        "manualReviewRequired": true
      }
    ]
  }
}...[truncated 16013 chars]`
  }
];

function listDebugFixtures() {
  return debugFixtures.map(({ rawOutput, ...fixture }) => ({
    ...fixture,
    rawOutputLength: rawOutput.length
  }));
}

function getDebugFixture(id) {
  return debugFixtures.find((fixture) => fixture.id === id) || null;
}

module.exports = {
  debugFixtures,
  listDebugFixtures,
  getDebugFixture
};
