# Examples

## Basic Mock

Runs the built-in policy workflow with the mock provider:

```bash
node examples/basic-mock/index.js
```

## Custom Normalizer

Shows how to register a custom provider and a domain-specific normalizer:

```bash
node examples/custom-normalizer/index.js
```

Use this pattern when adding a new domain such as lease review, invoice extraction, loan document review, or medical record summarization.
