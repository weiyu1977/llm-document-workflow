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

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeObjectDefaults(defaults, override) {
  if (!isPlainObject(defaults)) return override === undefined ? defaults : override;
  if (!isPlainObject(override)) return defaults;
  const merged = { ...defaults };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = isPlainObject(value) && isPlainObject(defaults[key])
      ? mergeObjectDefaults(defaults[key], value)
      : value;
  });
  return merged;
}

function migrateLegacyPromptPack(promptPack = {}, defaults = {}) {
  const migrated = { ...promptPack };
  const legacyMappings = {
    summary: "document_identity_prompt",
    fileSummary: "document_identity_prompt",
    coverageHighlights: "medical_benefit_prompt",
    warnings: "manual_review_prompt",
    missingInfo: "final_report_prompt",
    claimPreparation: "claim_deadline_prompt",
    nextSteps: "final_report_prompt",
    exclusions: "exclusion_prompt",
    preExisting: "pre_existing_prompt",
    medicalBenefits: "medical_benefit_prompt",
    financialTerms: "financial_risk_prompt"
  };
  Object.entries(legacyMappings).forEach(([legacyKey, targetKey]) => {
    if (!migrated[legacyKey] || migrated[targetKey]) return;
    migrated[targetKey] = [
      defaults[targetKey],
      "",
      "Legacy admin prompt to preserve:",
      String(migrated[legacyKey])
    ].filter(Boolean).join("\n");
  });
  return mergeObjectDefaults(defaults, migrated);
}

function buildQuestionsFromPromptPack(promptPack = {}, defaults = []) {
  const byId = new Map((defaults || []).map((question) => [question.id, { ...question }]));
  Object.entries(promptPack || {}).forEach(([id, prompt]) => {
    const existing = byId.get(id);
    if (existing) {
      existing.prompt = prompt;
      byId.set(id, existing);
      return;
    }
    byId.set(id, {
      id,
      title: id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      prompt
    });
  });
  return Array.from(byId.values());
}

function normalizeWorkflowConfig(config = {}) {
  const baseFactory = DEFAULT_WORKFLOWS[config.workflowId] || DEFAULT_WORKFLOWS.policy_analysis;
  const defaults = baseFactory();
  const promptPack = migrateLegacyPromptPack(
    isPlainObject(config.promptPack) ? config.promptPack : defaults.promptPack,
    defaults.promptPack || {}
  );
  const questions = Array.isArray(config.questions) && config.questions.length
    ? buildQuestionsFromPromptPack(promptPack, config.questions)
    : buildQuestionsFromPromptPack(promptPack, defaults.questions);
  return {
    ...defaults,
    ...config,
    workflowId: String(config.workflowId || defaults.workflowId),
    version: String(config.version || defaults.version),
    providerId: String(config.providerId || defaults.providerId),
    model: String(config.model || defaults.model),
    normalizerId: String(config.normalizerId || defaults.normalizerId || config.workflowId || defaults.workflowId || "json_passthrough"),
    legacyAdapterId: String(config.legacyAdapterId ?? defaults.legacyAdapterId ?? ""),
    promptPack,
    questions,
    outputSchema: mergeObjectDefaults(defaults.outputSchema, isPlainObject(config.outputSchema) ? config.outputSchema : defaults.outputSchema),
    displayConfig: mergeObjectDefaults(defaults.displayConfig, isPlainObject(config.displayConfig) ? config.displayConfig : defaults.displayConfig)
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
      promptPack: read("promptPack", defaults.promptPack),
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
    ["promptPack", "questions", "outputSchema", "displayConfig"].forEach((field) => save(field, normalized[field]));
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
