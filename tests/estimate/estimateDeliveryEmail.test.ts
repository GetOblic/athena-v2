/**
 * EST-EMAIL-1B — delivery email contract on the existing Estimate generation call.
 */
import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildEstimateUserPrompt } from "../../services/ai/prompts/estimate/estimateUserPrompt";
import { ESTIMATE_SYSTEM_PROMPT } from "../../services/ai/prompts/estimate/estimateSystemPrompt";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type EstimateRequest,
} from "../../services/estimate/athenaEstimateTypes";
import {
  EstimateDeliveryEmailValidationError,
  validateEstimateDeliveryEmail,
} from "../../services/estimate/estimateDeliveryEmail";
import {
  EstimateGenerationPipelineError,
  runEstimateGenerationPipeline,
} from "../../services/estimate/estimateGenerationPipeline";
import { buildEstimateOutputLanguageInstruction } from "../../services/estimate/estimateOutputLanguage";
import {
  ORGANIZATION_LANGUAGES,
  organizationLanguageLabel,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const REQUEST: EstimateRequest = {
  projectNeed: "Rebuild the marketing site with CMS and analytics.",
  additionalContext: "Need staging and training.",
  timeframe: "1_3_months",
};

const METHODOLOGY = {
  configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  revisionId: "rev-estimate-email-001",
  instructionText: "Price for a bounded fixed-scope delivery.",
  configured: true as const,
  updatedAt: "2026-10-09T00:00:00.000Z",
  updatedBy: "super-admin",
};

const GEO = {
  geographyLabel: "United States" as string | null,
  currencyCode: "USD",
  currencyResolution: "derived" as const,
};

function packageJson(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation:
      "Marketing site rebuild with CMS migration and analytics setup.",
    pricingRationale:
      "The bounded scope supports a fixed delivery fee for this organization.",
    keyPriceDrivers: [
      "CMS migration volume",
      "Design and content scope",
      "Analytics setup",
    ],
    suggestedClientPositioning:
      "Present a fixed-scope launch with acceptance criteria.",
    risksAndAssumptions: [
      "Brand assets are available",
      "No custom checkout is included",
    ],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer: "model disclaimer that the server replaces",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "spoofed",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

const VALID_BODY = `Northwind, this note accompanies the proposed marketing site rebuild, including the CMS migration and analytics setup described for the project.

The work replaces the current site with a launch-ready property and clear acceptance criteria. That matters commercially because the scope is bounded and the fee reflects that delivery rather than an open-ended retainer.

The recommended investment is 18,000 USD. The next step is to confirm this scope so a formal proposal can be prepared.`;

function email(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "estimate_delivery_email_v1",
    language: "en",
    subject: "Website rebuild proposal for Northwind",
    body: VALID_BODY,
    ...overrides,
  };
}

async function generateOnce(model: Record<string, unknown>, options?: {
  outputLanguage?: OrganizationLanguage;
  outputLanguageInstruction?: string;
  calls?: { count: number };
}) {
  return runEstimateGenerationPipeline({
    organizationId: "org-1",
    request: REQUEST,
    methodology: METHODOLOGY,
    outputLanguage: options?.outputLanguage,
    outputLanguageInstruction: options?.outputLanguageInstruction,
    deps: {
      composeContext: async () => ({
        organizationId: "org-1",
        trusted: {} as never,
        composedTrustedContext: "TRUSTED ATHENA EVIDENCE\nNorthwind is a B2B firm.",
        operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nSite rebuild.",
        geoCurrency: GEO,
        meta: {} as never,
      }),
      generateReview: async () => {
        if (options?.calls) options.calls.count += 1;
        return JSON.stringify(model);
      },
    },
  });
}

describe("EST-EMAIL-1B delivery email", () => {
  it("accepts a valid package and a personalized email from one model call", async () => {
    const calls = { count: 0 };
    const result = await generateOnce(
      packageJson({ deliveryEmail: email() }),
      { calls },
    );

    assert.equal(calls.count, 1);
    assert.equal(result.package.schemaVersion, "estimate_v1");
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
    assert.equal(result.package.recommendedClientPrice.currencyCode, "USD");
    assert.equal("deliveryEmail" in result.package, false);
    assert.equal(result.deliveryEmail?.schemaVersion, "estimate_delivery_email_v1");
    assert.equal(result.deliveryEmail?.language, "en");
    assert.equal(result.deliveryEmail?.subject, "Website rebuild proposal for Northwind");
    assert.match(result.deliveryEmail?.body ?? "", /18,000 USD/);
  });

  it("keeps a valid package when the email is missing", async () => {
    const result = await generateOnce(packageJson());
    assert.equal(result.package.schemaVersion, "estimate_v1");
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
    assert.equal(result.deliveryEmail, null);
  });

  it("keeps a valid package when the email is malformed", async () => {
    const result = await generateOnce(
      packageJson({
        deliveryEmail: { subject: "Hello", body: VALID_BODY },
      }),
    );
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
    assert.equal(result.deliveryEmail, null);
  });

  it("keeps a valid package when the email exceeds its limits", async () => {
    const overlongBody = `${"Scope confirmation. ".repeat(120)}18,000 USD.`;
    assert.ok(overlongBody.length > 2000);
    const result = await generateOnce(
      packageJson({
        deliveryEmail: email({ body: overlongBody }),
      }),
    );
    assert.equal(result.deliveryEmail, null);
    assert.equal(result.package.schemaVersion, "estimate_v1");

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({ subject: "A".repeat(121) }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailValidationError &&
        /subject exceeds maximum length/.test(error.message),
    );
  });

  it("rejects fabricated prior discussion without changing the package", async () => {
    const discussed = email({
      body: "As we discussed on our last call, the recommended investment is 18,000 USD. The next step is to confirm scope.",
    });
    const result = await generateOnce(packageJson({ deliveryEmail: discussed }));
    assert.equal(result.deliveryEmail, null);
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
    assert.equal(result.package.recommendedClientPrice.currencyCode, "USD");

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({
            body: "Comme convenu lors de notre appel, l'investissement recommandé est 18 000 USD.",
          }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      /fabricated prior-discussion/,
    );
  });

  it("rejects a price mismatch and does not rewrite the package", async () => {
    const result = await generateOnce(
      packageJson({
        deliveryEmail: email({
          body: "Northwind, the recommended investment is 19,000 USD. The next step is to confirm scope.",
        }),
      }),
    );
    assert.equal(result.deliveryEmail, null);
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
  });

  it("rejects a currency mismatch after server currency normalization", async () => {
    const result = await generateOnce(
      packageJson({
        recommendedClientPrice: { amount: 18000, currencyCode: "EUR" },
        recommendedPriceRange: {
          low: { amount: 14000, currencyCode: "EUR" },
          high: { amount: 24000, currencyCode: "EUR" },
        },
        deliveryEmail: email({
          body: "Northwind, the recommended investment is 18,000 EUR. The next step is to confirm scope.",
        }),
      }),
    );
    assert.equal(result.package.recommendedClientPrice.currencyCode, "USD");
    assert.equal(result.package.recommendedClientPrice.amount, 18000);
    assert.equal(result.deliveryEmail, null);
  });

  it("rejects forbidden internal claims and invented contact details", async () => {
    const internal = await generateOnce(
      packageJson({
        deliveryEmail: email({
          body: "Our pricing methodology produces a licensee margin of 40 percent. The fee is 18,000 USD.",
        }),
      }),
    );
    assert.equal(internal.deliveryEmail, null);
    assert.equal(internal.package.schemaVersion, "estimate_v1");

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({
            body: "We conducted live market research. The recommended investment is 18,000 USD.",
          }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      /prohibited internal claim/,
    );

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({
            subject: "Athena proposal for Northwind",
          }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      /prohibited internal claim/,
    );

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({
            body: "The recommended investment is 18,000 USD. Write me at owner@northwind.example.",
          }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      /invented contact/,
    );

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({
            body: "The recommended investment is 18,000 USD. Call +1 415 555 0199 to proceed.",
          }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      /invented contact/,
    );
  });

  it("accepts localized price notation at ISO minor-unit precision", () => {
    const bodies = [
      "The recommended investment is 18,000 USD.",
      "The recommended investment is 18,000.00 USD.",
      "The recommended investment is USD 18,000.",
      "The recommended investment is $18,000.",
      "The recommended investment is 18.000 USD.",
      "The recommended investment is 18 000 USD.",
      `The recommended investment is 18\u202F000 USD.`,
      "The recommended investment is 18.000,00 USD.",
    ];
    for (const body of bodies) {
      const validated = validateEstimateDeliveryEmail({
        raw: email({ body }),
        language: "en",
        recommendedClientPriceAmount: 18000,
        currencyCode: "USD",
      });
      assert.equal(validated.body, body);
    }

    const euros = validateEstimateDeliveryEmail({
      raw: email({
        language: "fr",
        body: "L'investissement recommandé est 18.000,50 EUR.",
      }),
      language: "fr",
      recommendedClientPriceAmount: 18000.5,
      currencyCode: "EUR",
    });
    assert.equal(euros.language, "fr");

    validateEstimateDeliveryEmail({
      raw: email({
        language: "de",
        body: "Die empfohlene Investition beträgt €18,000.50.",
      }),
      language: "de",
      recommendedClientPriceAmount: 18000.5,
      currencyCode: "EUR",
    });
  });

  it("rejects extra precision and a rounded-away minor unit", () => {
    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({ body: "The recommended investment is 18,000.00 JPY." }),
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "JPY",
        }),
      /recommended price/,
    );

    validateEstimateDeliveryEmail({
      raw: email({ body: "The recommended investment is 18,000 JPY." }),
      language: "en",
      recommendedClientPriceAmount: 18000,
      currencyCode: "JPY",
    });

    validateEstimateDeliveryEmail({
      raw: email({ body: "The recommended investment is 18,000.01 USD." }),
      language: "en",
      recommendedClientPriceAmount: 18000.005,
      currencyCode: "USD",
    });

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: email({ body: "The recommended investment is 18,000.00 USD." }),
          language: "en",
          recommendedClientPriceAmount: 18000.005,
          currencyCode: "USD",
        }),
      /recommended price/,
    );
  });

  it("covers org-only and missing decision-maker instructions", () => {
    const orgOnly = buildEstimateUserPrompt({
      trustedContext: "TRUSTED ATHENA EVIDENCE\nNorthwind is a regional distributor.",
      operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nRebuild the site.",
      methodologyInstructionText: METHODOLOGY.instructionText,
      methodologyRevisionId: METHODOLOGY.revisionId,
      geoCurrency: GEO,
      request: REQUEST,
      outputLanguageCode: "en",
    });
    assert.match(orgOnly, /If there is no Prospect block, address the organization identity/);
    assert.match(orgOnly, /No Own Company identity is provided/);
    assert.match(orgOnly, /Do not imply a prior call/);
    assert.doesNotMatch(
      orgOnly,
      /PROSPECT COMMERCIAL TARGET INTELLIGENCE\n\(Trusted Athena evidence about the commercial target/,
    );

    const prospectWithoutDecisionMaker = buildEstimateUserPrompt({
      trustedContext: "TRUSTED ATHENA EVIDENCE\nNorthwind.",
      operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nRebuild the site.",
      methodologyInstructionText: METHODOLOGY.instructionText,
      methodologyRevisionId: METHODOLOGY.revisionId,
      geoCurrency: GEO,
      request: REQUEST,
      prospectCommercialTargetIntelligence:
        "PROSPECT COMMERCIAL TARGET INTELLIGENCE\nbusiness_name: Northwind Dental\nindustry: omitted-not-present",
      outputLanguageCode: "en",
    });
    assert.match(prospectWithoutDecisionMaker, /business_name: Northwind Dental/);
    assert.doesNotMatch(prospectWithoutDecisionMaker, /decision_maker:/);
    assert.match(
      prospectWithoutDecisionMaker,
      /Address the decision maker only when decision_maker is present/,
    );
    assert.match(prospectWithoutDecisionMaker, /Otherwise address the business/);

    const composer = read(
      "services/estimate/estimateProspectContextComposer.ts",
    );
    assert.match(composer, /contact_information/);
    assert.match(composer, /decision_maker/);
    assert.doesNotMatch(composer, /deliveryEmail/);
  });

  it("enforces the six-language output contract", () => {
    assert.deepEqual([...ORGANIZATION_LANGUAGES], [
      "en",
      "fr",
      "es",
      "it",
      "de",
      "pt",
    ]);

    for (const language of ORGANIZATION_LANGUAGES) {
      const instruction = buildEstimateOutputLanguageInstruction(language);
      assert.match(instruction, new RegExp(organizationLanguageLabel(language)));
      assert.match(
        instruction,
        new RegExp(`Set deliveryEmail\\.language to "${language}"`),
      );

      const prompt = buildEstimateUserPrompt({
        trustedContext: "TRUSTED ATHENA EVIDENCE\nNorthwind.",
        operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nRebuild the site.",
        methodologyInstructionText: METHODOLOGY.instructionText,
        methodologyRevisionId: METHODOLOGY.revisionId,
        geoCurrency: GEO,
        request: REQUEST,
        outputLanguageInstruction: instruction,
        outputLanguageCode: language,
      });
      assert.match(prompt, new RegExp(`"language": "${language}"`));
      assert.match(prompt, new RegExp(`language must be exactly "${language}"`));

      const validated = validateEstimateDeliveryEmail({
        raw: email({ language, body: "The recommended investment is 18,000 USD." }),
        language,
        recommendedClientPriceAmount: 18000,
        currencyCode: "USD",
      });
      assert.equal(validated.language, language);

      assert.throws(
        () =>
          validateEstimateDeliveryEmail({
            raw: email({
              language: language === "en" ? "fr" : "en",
              body: "The recommended investment is 18,000 USD.",
            }),
            language,
            recommendedClientPriceAmount: 18000,
            currencyCode: "USD",
          }),
        /deliveryEmail\.language must be/,
      );
    }
  });

  it("leaves estimate_v1 unchanged and still fails an invalid package", async () => {
    const types = read("services/estimate/athenaEstimateTypes.ts");
    assert.match(types, /estimate_v1/);
    assert.doesNotMatch(types, /deliveryEmail|estimate_delivery_email/);

    const result = await generateOnce(packageJson({ deliveryEmail: email() }));
    assert.deepEqual(Object.keys(result.package).sort(), [
      "competitorQuotesFabricated",
      "currencyResolution",
      "geographyLabel",
      "guidanceDisclaimer",
      "instructionProvenance",
      "keyPriceDrivers",
      "marketResearchClaimed",
      "pricingRationale",
      "recommendedClientPrice",
      "recommendedPriceRange",
      "risksAndAssumptions",
      "schemaVersion",
      "scopeInterpretation",
      "suggestedClientPositioning",
    ]);

    await assert.rejects(
      () =>
        generateOnce(
          packageJson({
            recommendedClientPrice: { amount: 0, currencyCode: "USD" },
            deliveryEmail: email(),
          }),
        ),
      (error: unknown) =>
        error instanceof EstimateGenerationPipelineError &&
        error.code === "ESTIMATE_VALIDATION_FAILED" &&
        error.retryable === true,
    );
  });

  it("does not add a second model call, worker entrypoint, or quote persistence", () => {
    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");
    assert.equal(pipeline.match(/await generate\(/g)?.length, 1);
    assert.match(pipeline, /acceptDeliveryEmail/);
    assert.match(ESTIMATE_SYSTEM_PROMPT, /deliveryEmail sibling/);
    assert.doesNotMatch(ESTIMATE_SYSTEM_PROMPT, /generateReview/);

    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /deliveryEmail|estimateDeliveryEmail/);

    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(executor, /packageJson: result\.package/);
    assert.match(executor, /persistGeneratedEstimateDeliveryEmailIfAbsent/);
    assert.doesNotMatch(executor, /generateReview/);

    for (const file of [
      "services/clientQuote/clientQuoteSeed.ts",
      "services/clientQuote/pdf/clientQuotePdfFormat.ts",
      "app/licensee/quote/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /estimate_delivery_email|deliveryEmail/);
    }
  });

  it("resolves Master language from the existing instruction when no explicit code is passed", async () => {
    const instruction = buildEstimateOutputLanguageInstruction("es");
    const result = await generateOnce(
      packageJson({
        deliveryEmail: email({
          language: "es",
          subject: "Propuesta de renovación del sitio",
          body: "La inversión recomendada es 18,000 USD. El siguiente paso es confirmar el alcance.",
        }),
      }),
      { outputLanguageInstruction: instruction },
    );
    assert.equal(result.deliveryEmail?.language, "es");
    assert.equal(result.package.schemaVersion, "estimate_v1");
  });
});
