const { createGeminiProvider } = require("./provider-adapters/gemini-provider");
const { createMockProvider } = require("./provider-adapters/mock-provider");
const { createProviderRegistry } = require("./provider-adapters/provider-registry");
const { createPromptStore } = require("./prompt-store");
const { runDocumentWorkflowToReport, composePrompt } = require("./workflow-runner");
const { defaultPolicyAnalysisWorkflow } = require("./workflows/policy-analysis-default");
const { parseJsonFromText } = require("./normalizer/json-extractor");
const { normalizePolicyAnalysisReport, validatePolicyAnalysisReport } = require("./normalizer/schema-validator");
const { createNormalizerRegistry, createJsonPassthroughNormalizer } = require("./normalizer/normalizer-registry");
const { createPolicyAnalysisNormalizer } = require("./normalizer/policy-analysis-normalizer");
const { reportToVisitorInsuranceLegacyAnalysis } = require("./adapters/visitor-insurance-legacy");

const legacyAdapters = {
  visitor_insurance: reportToVisitorInsuranceLegacyAnalysis
};

function createDocumentWorkflowEngine(deps = {}) {
  const promptStore = createPromptStore({
    getSecret: deps.getSecret,
    setSecret: deps.setSecret
  });
  const providerRegistry = createProviderRegistry({
    gemini: createGeminiProvider({
      google: deps.google,
      extractText: deps.extractText,
      fetchJson: deps.fetchJson
    }),
    mock: createMockProvider()
  });
  Object.values(deps.providers || {}).forEach((provider) => providerRegistry.register(provider));
  const normalizerRegistry = createNormalizerRegistry({
    policy_analysis: createPolicyAnalysisNormalizer(),
    ...(deps.normalizers || {})
  });
  const resolveNormalizer = (workflow) => normalizerRegistry.get(workflow.normalizerId || workflow.workflowId || "json_passthrough");
  const resolveLegacyAdapter = (workflow) => {
    if (!workflow.legacyAdapterId) return null;
    return legacyAdapters[workflow.legacyAdapterId] || deps.legacyAdapters?.[workflow.legacyAdapterId] || null;
  };
  return {
    promptStore,
    providers: providerRegistry.entries(),
    normalizers: normalizerRegistry.entries(),
    registerProvider(provider) {
      providerRegistry.register(provider);
      this.providers = providerRegistry.entries();
      return provider;
    },
    registerNormalizer(normalizer) {
      normalizerRegistry.register(normalizer);
      this.normalizers = normalizerRegistry.entries();
      return normalizer;
    },
    getDefaultWorkflow(workflowId = "policy_analysis") {
      if (workflowId === "policy_analysis") return defaultPolicyAnalysisWorkflow();
      return promptStore.defaultWorkflow(workflowId);
    },
    getWorkflow(workflowId = "policy_analysis") {
      return promptStore.readWorkflow(workflowId);
    },
    saveWorkflow(workflowId, config, updatedBy = "") {
      return promptStore.saveWorkflow(workflowId, config, updatedBy);
    },
    listWorkflows() {
      return promptStore.listWorkflows();
    },
    listProviders() {
      return providerRegistry.list();
    },
    listNormalizers() {
      return normalizerRegistry.list();
    },
    inspectWorkflow(workflowId = "policy_analysis") {
      const workflow = promptStore.readWorkflow(workflowId);
      const defaults = this.getDefaultWorkflow(workflowId);
      const promptPackKeys = workflow.promptPack && typeof workflow.promptPack === "object" ? Object.keys(workflow.promptPack) : [];
      return {
        workflow,
        defaults,
        summary: {
          workflowId: workflow.workflowId,
          version: workflow.version,
          providerId: workflow.providerId,
          model: workflow.model,
          normalizerId: workflow.normalizerId || workflow.workflowId,
          parserStrategy: workflow.parserStrategy || "",
          promptPackKeys,
          questionCount: Array.isArray(workflow.questions) ? workflow.questions.length : 0,
          hasOutputSchema: Boolean(workflow.outputSchema && Object.keys(workflow.outputSchema).length),
          hasRepairPrompt: Boolean(workflow.repairPrompt)
        }
      };
    },
    composeWorkflowPrompt({ workflowId = "policy_analysis", inputLabel = "document" } = {}) {
      const workflow = promptStore.readWorkflow(workflowId);
      const prompt = composePrompt(workflow, inputLabel);
      return {
        workflowId: workflow.workflowId,
        version: workflow.version,
        providerId: workflow.providerId,
        model: workflow.model,
        inputLabel,
        prompt,
        promptLength: prompt.length,
        promptPackKeys: workflow.promptPack && typeof workflow.promptPack === "object" ? Object.keys(workflow.promptPack) : []
      };
    },
    parseRawOutput(rawOutput = "") {
      return parseJsonFromText(rawOutput);
    },
    normalizeParsedOutput({ workflowId = "policy_analysis", parsed, fallbackAnalysis = null } = {}) {
      const workflow = promptStore.readWorkflow(workflowId);
      const normalizer = resolveNormalizer(workflow);
      const normalized = normalizer.normalize(parsed, fallbackAnalysis, { workflow });
      return {
        workflowId: workflow.workflowId,
        version: workflow.version,
        normalizerId: workflow.normalizerId || workflow.workflowId,
        normalizedReport: normalized.report,
        validation: normalized.validation
      };
    },
    validatePolicyAnalysisReport(report) {
      return validatePolicyAnalysisReport(report);
    },
    async runToReport({ workflowId = "policy_analysis", files = [], text = "", fileName = "", fallbackAnalysis = null }) {
      const workflow = promptStore.readWorkflow(workflowId);
      return runDocumentWorkflowToReport({
        workflow,
        provider: providerRegistry.get(workflow.providerId),
        normalizer: resolveNormalizer(workflow),
        files,
        text,
        fileName,
        fallbackAnalysis
      });
    },
    async run({ workflowId = "policy_analysis", files = [], text = "", fileName = "", fallbackAnalysis = null }) {
      const workflow = promptStore.readWorkflow(workflowId);
      const result = await runDocumentWorkflowToReport({
        workflow,
        provider: providerRegistry.get(workflow.providerId),
        normalizer: resolveNormalizer(workflow),
        files,
        text,
        fileName,
        fallbackAnalysis
      });
      const legacyAdapter = resolveLegacyAdapter(workflow);
      if (!legacyAdapter) return result;
      return legacyAdapter({
        report: result.normalizedReport,
        workflow,
        providerResult: result.providerResult,
        rawOutput: result.rawOutput,
        parsedOutput: result.parsedOutput,
        diagnostics: result.diagnostics,
        fallbackAnalysis
      });
    },
    composePrompt,
    parseJsonFromText,
    normalizePolicyAnalysisReport
  };
}

module.exports = {
  createDocumentWorkflowEngine,
  createJsonPassthroughNormalizer,
  createNormalizerRegistry,
  createPolicyAnalysisNormalizer,
  defaultPolicyAnalysisWorkflow,
  parseJsonFromText,
  normalizePolicyAnalysisReport,
  validatePolicyAnalysisReport,
  reportToVisitorInsuranceLegacyAnalysis
};
