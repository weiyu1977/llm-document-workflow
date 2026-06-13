export interface WorkflowQuestion {
  id: string;
  title?: string;
  prompt: string;
}

export interface DocumentWorkflowConfig {
  workflowId: string;
  version: string;
  providerId: string;
  model: string;
  normalizerId?: string;
  legacyAdapterId?: string;
  parserStrategy?: string;
  systemPrompt: string;
  businessContext?: string;
  taskPrompt: string;
  promptPack?: Record<string, string>;
  questions: WorkflowQuestion[];
  outputSchema: Record<string, unknown>;
  repairPrompt?: string;
  displayConfig?: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface ProviderGenerateInput {
  workflow: DocumentWorkflowConfig;
  files?: Array<Record<string, unknown>>;
  text?: string;
  prompt: string;
  mode?: string;
}

export interface ProviderGenerateResult {
  providerId: string;
  mode?: string;
  model?: string;
  location?: string;
  statusCode?: number;
  finishReason?: string;
  rawText: string;
}

export interface DocumentProvider {
  id: string;
  name?: string;
  supportsFiles?: boolean;
  supportsText?: boolean;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult>;
}

export interface NormalizerResult<TReport = unknown> {
  report: TReport;
  validation: { ok: boolean; errors: string[] };
}

export interface DocumentNormalizer<TReport = unknown> {
  id: string;
  name?: string;
  schemaId?: string;
  normalize(parsed: unknown, fallback?: unknown, context?: { workflow: DocumentWorkflowConfig }): NormalizerResult<TReport>;
  fallback?(rawOutput: string, fallback?: unknown, context?: { workflow: DocumentWorkflowConfig }): TReport;
}

export interface DocumentWorkflowRunResult<TReport = unknown> {
  workflow: {
    workflowId: string;
    version: string;
    providerId: string;
    model: string;
  };
  normalizedReport: TReport;
  rawOutput: string;
  parsedOutput: unknown;
  diagnostics: Record<string, unknown>;
  providerResult: ProviderGenerateResult;
}

export interface DocumentWorkflowEngine {
  registerProvider(provider: DocumentProvider): DocumentProvider;
  registerNormalizer<TReport = unknown>(normalizer: DocumentNormalizer<TReport>): DocumentNormalizer<TReport>;
  getDefaultWorkflow(workflowId?: string): DocumentWorkflowConfig;
  getWorkflow(workflowId?: string): DocumentWorkflowConfig;
  saveWorkflow(workflowId: string, config: Partial<DocumentWorkflowConfig>, updatedBy?: string): DocumentWorkflowConfig;
  listWorkflows(): DocumentWorkflowConfig[];
  listProviders(): Array<Record<string, unknown>>;
  listNormalizers(): Array<{ id: string; name: string; schemaId: string }>;
  runToReport<TReport = unknown>(input: { workflowId?: string; files?: Array<Record<string, unknown>>; text?: string; fileName?: string; fallbackAnalysis?: unknown }): Promise<DocumentWorkflowRunResult<TReport>>;
  run(input: { workflowId?: string; files?: Array<Record<string, unknown>>; text?: string; fileName?: string; fallbackAnalysis?: unknown }): Promise<unknown>;
}

export interface CreateDocumentWorkflowEngineOptions {
  getSecret?: (integrationId: string, secretName: string) => string | undefined;
  setSecret?: (input: { integrationId: string; secretName: string; secretValue: string; updatedBy?: string }) => void;
  providers?: Record<string, DocumentProvider>;
  normalizers?: Record<string, DocumentNormalizer>;
  legacyAdapters?: Record<string, Function>;
  google?: unknown;
  extractText?: Function;
  fetchJson?: (url: string, payload: unknown, timeoutMs?: number, headers?: Record<string, string>) => Promise<{ statusCode: number; body?: string; json?: unknown }>;
}

export function createDocumentWorkflowEngine(options?: CreateDocumentWorkflowEngineOptions): DocumentWorkflowEngine;
export function defaultPolicyAnalysisWorkflow(): DocumentWorkflowConfig;
export function parseJsonFromText(text: string): { parsed: unknown; method: string; error?: string };
export function createJsonPassthroughNormalizer(): DocumentNormalizer;
export function createPolicyAnalysisNormalizer(): DocumentNormalizer;
export function createNormalizerRegistry(initialNormalizers?: Record<string, DocumentNormalizer>): unknown;
export function normalizePolicyAnalysisReport(parsed: unknown, fallback?: unknown): NormalizerResult;
export function reportToVisitorInsuranceLegacyAnalysis(input: Record<string, unknown>): unknown;
