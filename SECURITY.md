# Security Policy

## Supported Versions

This package is pre-1.0. Security fixes target the latest published version.

## Reporting a Vulnerability

Please report vulnerabilities privately to the project maintainers before public disclosure.

Do not include real customer documents, insurance policies, protected health information, or credentials in reports. Use synthetic fixtures whenever possible.

## Security Expectations

- Provider credentials should live outside package source code.
- Applications should encrypt sensitive workflow inputs and outputs at rest.
- Applications should audit administrative prompt, schema, provider, and workflow changes.
- Uploaded files should be scanned and size-limited by the host application.
- Model outputs should be treated as untrusted input and validated before rendering.
