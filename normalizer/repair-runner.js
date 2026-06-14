const { parseJsonFromText } = require("./json-extractor");

function buildRepairPrompt({ workflow, rawOutput, validationErrors }) {
  return [
    workflow.repairPrompt || "Repair the model output into the required JSON schema. Return strict JSON only.",
    "Required output schema:",
    JSON.stringify(workflow.outputSchema || {}, null, 2),
    validationErrors?.length ? `Validation errors:\n${validationErrors.join("\n")}` : "",
    "Raw model output to repair:",
    String(rawOutput || "").slice(0, 24000)
  ].filter(Boolean).join("\n\n");
}

async function repairWithProvider({ provider, workflow, rawOutput, validationErrors }) {
  if (!provider || !rawOutput) return { parsed: null, rawText: "", diagnostics: { repaired: false, reason: "no_provider_or_raw_output" } };
  const prompt = buildRepairPrompt({ workflow, rawOutput, validationErrors });
  const result = await provider.generate({ workflow: { ...workflow, maxOutputTokens: Math.max(Number(workflow.maxOutputTokens || 8192), 8192) }, prompt, mode: "repair" });
  const parsedResult = parseJsonFromText(result.rawText);
  return {
    parsed: parsedResult.parsed,
    rawText: result.rawText,
    providerResult: result,
    diagnostics: {
      repaired: Boolean(parsedResult.parsed),
      repairParseMethod: parsedResult.method,
      repairError: parsedResult.error || "",
      isPartial: Boolean(parsedResult.isPartial),
      truncationDetected: Boolean(parsedResult.truncationDetected),
      recoveredSections: parsedResult.recoveredSections || [],
      repairedJson: parsedResult.repairedJson || "",
      partialJson: parsedResult.partialJson || ""
    }
  };
}

module.exports = {
  buildRepairPrompt,
  repairWithProvider
};
