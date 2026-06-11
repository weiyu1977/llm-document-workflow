const { ProviderNotFoundError } = require("../errors");

function createProviderRegistry(initialProviders = {}) {
  const providers = new Map();
  Object.values(initialProviders).forEach((provider) => {
    if (provider?.id) providers.set(provider.id, provider);
  });
  return {
    register(provider) {
      if (!provider?.id || typeof provider.generate !== "function") {
        throw new ProviderNotFoundError(provider?.id || "invalid_provider");
      }
      providers.set(provider.id, provider);
      return provider;
    },
    get(providerId, { fallbackId = "mock" } = {}) {
      if (providers.has(providerId)) return providers.get(providerId);
      if (fallbackId && providers.has(fallbackId)) return providers.get(fallbackId);
      throw new ProviderNotFoundError(providerId);
    },
    list() {
      return Array.from(providers.values()).map((provider) => ({
        id: provider.id,
        name: provider.name || provider.id,
        supportsPdf: Boolean(provider.supportsPdf),
        supportsText: provider.supportsText !== false,
        status: provider.status || "registered"
      }));
    },
    entries() {
      return Object.fromEntries(providers.entries());
    }
  };
}

module.exports = {
  createProviderRegistry
};
