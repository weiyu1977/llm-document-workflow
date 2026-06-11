function assertNormalizer(normalizer) {
  if (!normalizer || typeof normalizer !== "object") {
    throw new TypeError("Normalizer must be an object.");
  }
  if (!normalizer.id || typeof normalizer.id !== "string") {
    throw new TypeError("Normalizer id is required.");
  }
  if (typeof normalizer.normalize !== "function") {
    throw new TypeError(`Normalizer ${normalizer.id} must expose normalize(parsed, fallback, context).`);
  }
}

function createJsonPassthroughNormalizer() {
  return {
    id: "json_passthrough",
    name: "JSON passthrough",
    schemaId: "none",
    normalize(parsed, fallback = {}) {
      const report = parsed && typeof parsed === "object" ? parsed : { value: parsed };
      return {
        report,
        validation: { ok: true, errors: [] },
        fallback
      };
    },
    fallback(rawOutput = "", fallback = {}) {
      return {
        kind: "raw_text",
        rawOutput: String(rawOutput || ""),
        fallback
      };
    }
  };
}

function createNormalizerRegistry(initialNormalizers = {}) {
  const normalizers = new Map();

  const register = (normalizer) => {
    assertNormalizer(normalizer);
    normalizers.set(normalizer.id, normalizer);
    return normalizer;
  };

  register(createJsonPassthroughNormalizer());
  Object.values(initialNormalizers || {}).forEach(register);

  return {
    register,
    get(id = "json_passthrough") {
      const normalizer = normalizers.get(id);
      if (!normalizer) {
        throw new Error(`Unknown document workflow normalizer: ${id}`);
      }
      return normalizer;
    },
    has(id) {
      return normalizers.has(id);
    },
    list() {
      return Array.from(normalizers.values()).map((normalizer) => ({
        id: normalizer.id,
        name: normalizer.name || normalizer.id,
        schemaId: normalizer.schemaId || ""
      }));
    },
    entries() {
      return Object.fromEntries(normalizers.entries());
    }
  };
}

module.exports = {
  createJsonPassthroughNormalizer,
  createNormalizerRegistry
};
