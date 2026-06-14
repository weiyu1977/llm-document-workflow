const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseJsonFromText } = require("../normalizer/json-extractor");
const { runDocumentWorkflowToReport } = require("../workflow-runner");
const { createPolicyAnalysisNormalizer } = require("../normalizer/policy-analysis-normalizer");
const { markdownFallbackReport } = require("../normalizer/markdown-fallback");
const { normalizePolicyAnalysisReport, validatePolicyAnalysisReport } = require("../normalizer/schema-validator");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

function testFencedPolicyReport() {
  const result = parseJsonFromText(fixture("fenced-policy-report.txt"));
  assert.ok(result.parsed, "fenced policy report should parse");
  const normalized = normalizePolicyAnalysisReport(result.parsed, { fileName: "fallback.pdf" });
  assert.equal(normalized.validation.ok, true, normalized.validation.errors.join("; "));
  assert.equal(normalized.report.documentSummary.carrier, "Example Carrier");
  assert.equal(normalized.report.coverageHighlights.length, 1);
}

function testNullFallback() {
  const result = parseJsonFromText(fixture("fenced-policy-report.txt"));
  const normalized = normalizePolicyAnalysisReport(result.parsed, null);
  assert.equal(normalized.validation.ok, true, normalized.validation.errors.join("; "));
}

function testAnswersOutput() {
  const result = parseJsonFromText(fixture("answers-output.txt"));
  assert.ok(result.parsed, "answers output should parse");
  const normalized = normalizePolicyAnalysisReport(result.parsed, { fileName: "answers.pdf" });
  assert.equal(normalized.validation.ok, true, normalized.validation.errors.join("; "));
  assert.match(normalized.report.documentSummary.summary, /visitor medical/i);
  assert.ok(normalized.report.claimPreparation.length >= 1, "claimPreparation should be derived from answers");
  assert.ok(normalized.report.manualReview.reasons.length >= 1, "manual review should be derived from answers/warnings");
}

function testMarkdownFallback() {
  const report = markdownFallbackReport(fixture("markdown-bullets.txt"), { fileName: "raw-output.txt" });
  const validation = validatePolicyAnalysisReport(report);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.ok(report.claimPreparation.length >= 2, "claim bullets should be classified");
  assert.ok(report.manualReview.reasons.length >= 2, "manual review bullets should be classified");
}

function testProsePlusJson() {
  const result = parseJsonFromText(fixture("prose-plus-json.txt"));
  assert.ok(result.parsed, "prose plus JSON should parse via balanced JSON extraction");
  const normalized = normalizePolicyAnalysisReport(result.parsed, { fileName: "mixed-output.pdf" });
  assert.equal(normalized.validation.ok, true, normalized.validation.errors.join("; "));
  assert.match(normalized.report.documentSummary.summary, /visitor medical/i);
}

function testTruncatedJsonFallback() {
  const result = parseJsonFromText(fixture("truncated-json.txt"));
  assert.ok(result.parsed, "truncated JSON should recover partial object");
  assert.equal(result.isPartial, true, "truncated JSON should be marked partial");
  assert.equal(result.truncationDetected, true, "truncated JSON should report truncation");
  assert.ok(["jsonrepair", "partial_json", "best_effort_json"].includes(result.method), `unexpected parse method: ${result.method}`);
  const normalized = normalizePolicyAnalysisReport(result.parsed, { fileName: "truncated.pdf" });
  assert.equal(normalized.validation.ok, true, normalized.validation.errors.join("; "));
  assert.match(normalized.report.documentSummary.summary, /truncated/i);
  assert.ok(normalized.report.coverageHighlights.length >= 1, "partial coverage highlight should be recovered");
}

async function testWorkflowPartialDoesNotMarkdownFallback() {
  const normalizer = createPolicyAnalysisNormalizer();
  const provider = {
    async generate() {
      return {
        providerId: "fixture",
        mode: "analysis",
        model: "fixture",
        statusCode: 200,
        finishReason: "MAX_TOKENS",
        maxOutputTokens: 128,
        rawText: fixture("truncated-json.txt")
      };
    }
  };
  const workflow = {
    workflowId: "policy_analysis",
    version: "test",
    providerId: "fixture",
    model: "fixture",
    parserStrategy: "policy_report_json_v2",
    outputSchema: {},
    maxOutputTokens: 128
  };
  const result = await runDocumentWorkflowToReport({
    workflow,
    provider,
    normalizer,
    text: "sample",
    fileName: "truncated.pdf",
    fallbackAnalysis: { fileName: "truncated.pdf", summary: "fallback" }
  });
  assert.notEqual(result.diagnostics.parseMethod, "markdown_fallback", "partial JSON should not use markdown fallback");
  assert.equal(result.diagnostics.truncationDetected, true, "MAX_TOKENS should mark truncation");
  assert.ok(result.diagnostics.recoveredSections.length >= 1, "recoveredSections should be populated");
  assert.ok(Array.isArray(result.diagnostics.failedSections), "failedSections should be populated");
  assert.equal(result.normalizedReport.qualityGate.status, "partial");
}

function testNestedBulletsFallback() {
  const report = markdownFallbackReport(fixture("nested-bullets.txt"), { fileName: "nested-bullets.txt" });
  const validation = validatePolicyAnalysisReport(report);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.ok(report.claimPreparation.length >= 3, "nested claim bullets should be classified");
  assert.ok(report.manualReview.reasons.length >= 3, "nested review bullets should be classified");
}

testFencedPolicyReport();
testNullFallback();
testAnswersOutput();
testMarkdownFallback();
testProsePlusJson();
testTruncatedJsonFallback();
testNestedBulletsFallback();

testWorkflowPartialDoesNotMarkdownFallback()
  .then(() => console.log("llm-document-workflow fixture tests passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
