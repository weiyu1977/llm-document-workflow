# Test Manual: llm-document-workflow

Use this manual before reusing the module in another project or before changing prompt, schema, provider, or normalizer code.

## 1. Automated Checks

From repository root:

```powershell
npm run check
```

Expected output includes:

```text
llm-document-workflow self-test passed
llm-document-workflow fixture tests passed
```

From module directory:

```powershell
npm run check
npm test
```

## 2. What Automated Tests Cover

`test/self-test.js` covers:

- module import
- default workflow load
- workflow save/read
- mock provider run
- `runToReport()`
- legacy `run()`
- custom provider registration
- diagnostics presence

`test/fixture-test.js` covers:

- fenced JSON with trailing text
- `answers[]` style model output
- markdown/bullet fallback output
- report schema validation

Fixtures live in:

```text
test/fixtures/
```

## 3. Manual Test: Prompt Studio

Prerequisites:

- Optional host application running locally if you want to test a real upload UI
- Admin user logged in

Steps:

1. Open the app.
2. Go to `LLM管理`.
3. Open `Policy Prompt`.
4. Confirm these fields are visible:
   - provider
   - model
   - system prompt
   - business context
   - task prompt
   - repair prompt
   - questions JSON
   - output schema JSON
   - display config JSON
5. Click `Fill system defaults`.
6. Click `Save Policy Prompt Studio`.

Expected:

- Save succeeds.
- Result JSON returns `ok: true`.
- Workflow config contains `workflowId: policy_analysis`.

## 4. Manual Test: Workflow Test Console

Steps:

1. In `LLM管理 > Policy Prompt`, find `Workflow Test Console`.
2. Paste sample policy-like text:

```text
This visitor medical insurance certificate has a $100,000 policy maximum.
Claims must be submitted within 90 days with itemized bills and diagnosis records.
Pre-existing conditions and acute onset wording require manual review.
```

3. Click `Run workflow test`.

Expected:

- API returns `ok: true`.
- Response includes:
  - `normalizedReport`
  - `diagnostics`
  - `rawOutput`
  - `parsedOutput`
- `diagnostics.parseMethod` is one of:
  - `direct_json`
  - `balanced_json`
  - `repair:direct_json`
  - `repair:balanced_json`
  - `markdown_fallback`

## 5. Manual Test: PDF Upload Through Insurance Page

Steps:

1. Open `保单分析`.
2. Upload a PDF policy.
3. Click `分析保单`.

Expected:

- Button disables while analysis is running.
- Page shows structured report sections.
- Raw model output is not the primary user-facing view.
- Record is saved under policy history.
- Stored `backendAnalysis` includes:
  - `normalizedReport`
  - `workflow.diagnostics`
  - `rawOutput` preview/truncated data

## 6. Manual Test: Bad Model Output Fallback

Use Workflow Test Console text input with this content:

```text
* Any official documents related to the event, such as death certificate, police report, or airline confirmation for delays.
* Communication records with the Assistance Company, including approval codes.
* What requires human review: the full General Conditions of the Policy and Policy Certificate.
* The broad exclusion of pre-existing disease requires careful review.
```

Expected:

- Output still includes `normalizedReport`.
- Claim-related bullets appear under `claimPreparation`.
- Review bullets appear under `manualReview.reasons`.
- `diagnostics.parseMethod` may be `markdown_fallback`.

## 7. Provider Adapter Test Checklist

When adding a new provider:

1. Register provider through `engine.registerProvider`.
2. Add a self-test case using a fake response.
3. Confirm provider returns:
   - `providerId`
   - `mode`
   - `model`
   - `statusCode`
   - `finishReason`
   - `rawText`
4. Confirm `engine.listProviders()` includes it.
5. Confirm `runToReport()` works with the provider.

## 8. Regression Checklist

Run this before merge or deployment:

- `npm run check`
- Upload PDF in insurance UI
- Run Workflow Test Console with text
- Check server error log
- Confirm diagnostics are stored
- Confirm raw output is hidden from normal user view

## 9. Known Limitations

- JSON schema validation is implemented without external dependencies.
- The built-in schema is currently policy-analysis specific.
- Gemini repair uses the same provider adapter; a future version may support a separate repair provider.
- No OpenAI/Anthropic provider is bundled yet, but provider registry supports them.
