# Contributing

Thanks for helping improve `llm-document-workflow`.

## Development

Run the package checks from the repository root:

```bash
npm run check
npm test
```

## Design Principles

- Keep the workflow runner domain-neutral.
- Put domain logic in presets, normalizers, or legacy adapters.
- Keep provider adapters small and testable.
- Prefer fixtures for every new normalizer behavior.
- Do not commit secrets, uploaded documents, PHI, PII, or model credentials.

## Pull Requests

1. Add or update fixtures for parser/normalizer changes.
2. Include clear diagnostics for failure paths.
3. Keep public APIs backward-compatible where possible.
4. Update `README.md`, `docs/DEVELOPER_GUIDE.md`, and `CHANGELOG.md` when behavior changes.
