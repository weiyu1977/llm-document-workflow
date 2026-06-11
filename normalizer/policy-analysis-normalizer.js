const { markdownFallbackReport } = require("./markdown-fallback");
const { normalizePolicyAnalysisReport } = require("./schema-validator");

function createPolicyAnalysisNormalizer() {
  return {
    id: "policy_analysis",
    name: "PolicyAnalysisReport",
    schemaId: "policy-analysis.schema.json",
    normalize(parsed, fallback = {}) {
      return normalizePolicyAnalysisReport(parsed, fallback);
    },
    fallback(rawOutput = "", fallback = {}) {
      return markdownFallbackReport(rawOutput, fallback);
    }
  };
}

module.exports = {
  createPolicyAnalysisNormalizer
};
