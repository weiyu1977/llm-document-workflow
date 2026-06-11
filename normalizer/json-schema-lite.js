function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function pathJoin(base, key) {
  if (!base) return String(key);
  if (String(key).startsWith("[")) return `${base}${key}`;
  return `${base}.${key}`;
}

function validateType(value, expected) {
  const actual = typeOf(value);
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

function validateJsonSchema(value, schema, options = {}) {
  const errors = [];
  const maxErrors = Number(options.maxErrors || 100);
  const visit = (node, rule, path) => {
    if (!rule || errors.length >= maxErrors) return;
    if (rule.$refLocal) {
      const local = schema.$defsLocal?.[rule.$refLocal];
      if (!local) {
        errors.push(`${path || "$"} references unknown local schema: ${rule.$refLocal}.`);
        return;
      }
      visit(node, local, path);
      return;
    }
    if (rule.anyOf) {
      const branchErrors = rule.anyOf.map((branch) => {
        const before = errors.length;
        visit(node, branch, path);
        return errors.splice(before);
      });
      if (branchErrors.some((branch) => branch.length === 0)) return;
      errors.push(`${path || "$"} must match at least one allowed schema.`);
      return;
    }
    if (rule.type && !validateType(node, rule.type)) {
      errors.push(`${path || "$"} must be ${Array.isArray(rule.type) ? rule.type.join("|") : rule.type}; got ${typeOf(node)}.`);
      return;
    }
    if (rule.enum && !rule.enum.includes(node)) {
      errors.push(`${path || "$"} must be one of: ${rule.enum.join(", ")}.`);
      return;
    }
    if (rule.type === "object" || rule.properties) {
      if (typeOf(node) !== "object") {
        errors.push(`${path || "$"} must be object; got ${typeOf(node)}.`);
        return;
      }
      (rule.required || []).forEach((key) => {
        if (node[key] === undefined) errors.push(`${pathJoin(path || "$", key)} is required.`);
      });
      Object.entries(rule.properties || {}).forEach(([key, childRule]) => {
        if (node[key] !== undefined) visit(node[key], childRule, pathJoin(path || "$", key));
      });
      if (rule.additionalProperties === false) {
        Object.keys(node).forEach((key) => {
          if (!rule.properties || !Object.prototype.hasOwnProperty.call(rule.properties, key)) {
            errors.push(`${pathJoin(path || "$", key)} is not allowed.`);
          }
        });
      }
    }
    if (rule.type === "array" || rule.items) {
      if (!Array.isArray(node)) {
        errors.push(`${path || "$"} must be array; got ${typeOf(node)}.`);
        return;
      }
      if (rule.minItems !== undefined && node.length < rule.minItems) {
        errors.push(`${path || "$"} must include at least ${rule.minItems} item(s).`);
      }
      if (rule.maxItems !== undefined && node.length > rule.maxItems) {
        errors.push(`${path || "$"} must include at most ${rule.maxItems} item(s).`);
      }
      if (rule.items) node.forEach((item, index) => visit(item, rule.items, pathJoin(path || "$", `[${index}]`)));
    }
  };
  visit(value, schema, "$");
  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  validateJsonSchema
};
