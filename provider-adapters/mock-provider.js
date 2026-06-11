function createMockProvider() {
  return {
    id: "mock",
    name: "Mock provider",
    supportsPdf: false,
    supportsText: true,
    status: "fallback",
    async generate({ workflow = {} }) {
      const output = {
        documentSummary: {
          fileName: "",
          documentType: "insurance_policy",
          carrier: "Mock Carrier",
          productName: "Mock Visitor Medical",
          policyType: "unknown",
          summary: "Mock policy analysis output for development and tests.",
          confidence: "low"
        },
        coverageHighlights: [{ title: "Mock coverage", detail: "Upload a real document and configure Gemini for live extraction.", sourceText: "", page: "", confidence: "low" }],
        medicalBenefits: { er: [], urgentCare: [], hospitalization: [], ambulance: [], surgery: [] },
        preExistingCondition: { summary: "", acuteOnset: "", lookbackPeriod: "", ageLimits: [], warnings: [] },
        claimPreparation: [],
        deadlines: [],
        manualReview: { required: true, reasons: [{ title: "Manual review", detail: "Mock provider used.", sourceText: "", page: "", confidence: "low" }] },
        missingInformation: [],
        nextSteps: [{ title: "Configure provider", detail: "Configure Gemini ADC and project settings before production use.", sourceText: "", page: "", confidence: "low" }],
        citations: [],
        rawDebug: { providerId: workflow.providerId || "mock" }
      };
      return {
        providerId: "mock",
        mode: "mock-document-analysis",
        model: "mock",
        location: "local",
        statusCode: 200,
        finishReason: "MOCK",
        rawText: JSON.stringify(output),
        rawJson: output
      };
    }
  };
}

module.exports = {
  createMockProvider
};
