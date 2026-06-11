class DocumentWorkflowError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DocumentWorkflowError";
    this.code = details.code || "DOCUMENT_WORKFLOW_ERROR";
    this.details = details;
  }
}

class ProviderNotFoundError extends DocumentWorkflowError {
  constructor(providerId) {
    super(`Provider not found: ${providerId}`, {
      code: "PROVIDER_NOT_FOUND",
      providerId
    });
    this.name = "ProviderNotFoundError";
  }
}

class WorkflowConfigError extends DocumentWorkflowError {
  constructor(message, details = {}) {
    super(message, {
      code: "WORKFLOW_CONFIG_ERROR",
      ...details
    });
    this.name = "WorkflowConfigError";
  }
}

module.exports = {
  DocumentWorkflowError,
  ProviderNotFoundError,
  WorkflowConfigError
};
