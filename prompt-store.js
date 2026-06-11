const { defaultPolicyAnalysisWorkflow } = require("./workflows/policy-analysis-default");
const { WorkflowConfigError } = require("./errors");

const DEFAULT_WORKFLOWS = {
  policy_analysis: defaultPolicyAnalysisWorkflow
};

function safeJson(text, fallback) {
  if (text === undefined || text === null || text === "") return fallback;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeWorkflowConfig(config = {}) {
  const baseFactory = DEFAULT_WORKFLOWS[config.workflowId] || DEFAULT_WORKFLOWS.policy_analysis;
  const defaults = baseFactory();
  const questions = Array.isArray(config.questions) && config.questions.length ? config.questions : defaults.questions;
  return {
    ...defaults,
    ...config,
    workflowId: String(config.workflowId || defaults.workflowId),
    version: String(config.version || defaults.version),
    providerId: String(config.providerId || defaults.providerId),
    model: String(config.model || defaults.model),
    normalizerId: String(config.normalizerId || defaults.normalizerId || config.workflowId || defaults.workflowId || "json_passthrough"),
    legacyAdapterId: String(config.legacyAdapterId ?? defaults.legacyAdapterId ?? ""),
    questions,
    outputSchema: config.outputSchema && typeof config.outputSchema === "object" ? config.outputSchema : defaults.outputSchema,
    displayConfig: config.displayConfig && typeof config.displayConfig === "object" ? config.displayConfig : defaults.displayConfig
  };
}

function validateWorkflowConfig(config = {}) {
  const errors = [];
  if (!config.workflowId) errors.push("workflowId is required.");
  if (!config.version) errors.push("version is required.");
  if (!config.providerId) errors.push("providerId is required.");
  if (!config.model) errors.push("model is required.");
  if (!config.normalizerId) errors.push("normalizerId is required.");
  if (!config.systemPrompt) errors.push("systemPrompt is required.");
  if (!config.taskPrompt) errors.push("taskPrompt is required.");
  if (!Array.isArray(config.questions) || !config.questions.length) errors.push("questions must be a non-empty array.");
  (config.questions || []).forEach((question, index) => {
    if (!question.id) errors.push(`questions[${index}].id is required.`);
    if (!question.prompt) errors.push(`questions[${index}].prompt is required.`);
  });
  if (!config.outputSchema || typeof config.outputSchema !== "object") errors.push("outputSchema must be an object.");
  return { ok: errors.length === 0, errors };
}

function createPromptStore({ getSecret, setSecret }) {
  const integrationId = "document_workflow";
  const secretName = (workflowId, field) => `${workflowId}:${field}`;
  const defaultWorkflow = (workflowId = "policy_analysis") => {
    const factory = DEFAULT_WORKFLOWS[workflowId] || DEFAULT_WORKFLOWS.policy_analysis;
    return factory();
  };
  const readWorkflow = (workflowId = "policy_analysis") => {
    const defaults = defaultWorkflow(workflowId);
    const read = (field, fallback) => {
      const value = getSecret?.(integrationId, secretName(workflowId, field));
      if (typeof fallback === "object") return safeJson(value, fallback);
      return value === undefined || value === null || value === "" ? fallback : value;
    };
    return normalizeWorkflowConfig({
      workflowId,
      version: read("version", defaults.version),
      providerId: read("providerId", defaults.providerId),
      model: read("model", defaults.model),
      normalizerId: read("normalizerId", defaults.normalizerId),
      legacyAdapterId: read("legacyAdapterId", defaults.legacyAdapterId || ""),
      parserStrategy: read("parserStrategy", defaults.parserStrategy),
      systemPrompt: read("systemPrompt", defaults.systemPrompt),
      businessContext: read("businessContext", defaults.businessContext),
      taskPrompt: read("taskPrompt", defaults.taskPrompt),
      questions: read("questions", defaults.questions),
      outputSchema: read("outputSchema", defaults.outputSchema),
      repairPrompt: read("repairPrompt", defaults.repairPrompt),
      displayConfig: read("displayConfig", defaults.displayConfig),
      maxOutputTokens: Number(read("maxOutputTokens", 8192)),
      timeoutMs: Number(read("timeoutMs", 90000))
    });
  };
  const saveWorkflow = (workflowId, config = {}, updatedBy = "") => {
    const normalized = normalizeWorkflowConfig({ ...config, workflowId });
    const validation = validateWorkflowConfig(normalized);
    if (!validation.ok) {
      throw new WorkflowConfigError("Invalid document workflow configuration", {
        workflowId,
        errors: validation.errors
      });
    }
    const save = (field, value) => setSecret?.({
      integrationId,
      secretName: secretName(workflowId, field),
      secretValue: typeof value === "string" ? value : JSON.stringify(value || ""),
      updatedBy
    });
    ["version", "providerId", "model", "normalizerId", "legacyAdapterId", "parserStrategy", "systemPrompt", "businessContext", "taskPrompt", "repairPrompt", "maxOutputTokens", "timeoutMs"].forEach((field) => save(field, normalized[field]));
    ["questions", "outputSchema", "displayConfig"].forEach((field) => save(field, normalized[field]));
    return readWorkflow(workflowId);
  };
  return {
    defaultWorkflow,
    readWorkflow,
    saveWorkflow,
    listWorkflows() {
      return Object.keys(DEFAULT_WORKFLOWS).map((workflowId) => readWorkflow(workflowId));
    }
  };
}

module.exports = {
  createPromptStore,
  normalizeWorkflowConfig,
  validateWorkflowConfig
};
