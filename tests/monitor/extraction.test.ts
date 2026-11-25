import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSfraProduct, familyIdFromColorSkus, publicProductUrlFromImage } from "../../prototype/monitor/adapters/sfra";
import type { ExtractedFamily } from "../../services/monitor/extractedFamily";
import { parseSolusquareProduct } from "../../services/monitor/solusquareProduct";
import {
  chooseClothingCategory,
  lengthGroupKey,
  prioritizeLengthPairs,
  scoreClothingCategory,
} from "../../prototype/monitor/discover";
import { applyVariationThreshold, collapseByFamilyId, matchingFamilies } from "../../prototype/monitor/filter";
import { MONITOR_LIMITS } from "../../prototype/monitor/limits";
import { assertDocumentAllowed, isHardDeniedUrl, isRobotsAllowed, resolveSupportedTarget } from "../../prototype/monitor/safety";
import { isPathAllowedByRobots, parseRobotsTxt } from "../../services/websiteLearning/deepScrape/robots";
import { assertPublicHostname } from "../../services/websiteLearning/deepScrape/urlSafety";

const OBSERVED = "2026-11-24T12:00:00.000Z";

function family(partial: Partial<ExtractedFamily> & Pick<ExtractedFamily, "productFamilyId" | "distinctVariationCount">): ExtractedFamily {
  return {
    sourceWebsite: "breal.net",
    brand: "Bréal",
    productName: "Jean",
    category: "Jeans",
    productUrl: "https://www.breal.net/jean.html",
    imageUrl: null,
    price: 39.99,
    currency: "EUR",
    colorPatternNames: ["A", "B", "C", "D"].slice(0, partial.distinctVariationCount),
    colorPatternIds: ["1", "2", "3", "4"].slice(0, partial.distinctVariationCount),
    sizeOptions: ["36"],
    lengthOptions: null,
    observedAt: OBSERVED,
    ...partial,
  };
}

const SFRA_HTML = `
<html><head>
<link rel="canonical" href="/jean-test-noir-femme-36125188430060100.html" />
<meta property="og:site_name" content="Bréal" />
<script type="application/ld+json">
{"@type":"Product","name":"Jean coupe droite taille haute","image":"https://www.breal.net/jean.jpg","offers":{"@type":"Offer","price":"39.99","priceCurrency":"EUR"}}
</script>
</head><body>
<div class="product-detail product-wrapper" data-pid="3612511476037">
  <button class="btn color-attribute" title="NOIR"><span data-attr-value="100" data-attr-display-value="NOIR" style="background-image: url(https://www.breal.net/img/jean-test-noir-femme-vue11-36125188430060100.jpg)"></span></button>
  <button class="btn color-attribute" title="DENIM BRUT"><span data-attr-value="308" data-attr-display-value="DENIM BRUT" style="background-image: url(https://www.breal.net/img/jean-test-denim-brut-femme-vue11-36125188430060308.jpg)"></span></button>
  <button class="btn color-attribute" title="BLANC"><span data-attr-value="200" data-attr-display-value="BLANC" style="background-image: url(https://www.breal.net/img/jean-test-blanc-femme-vue11-36125188430060200.jpg)"></span></button>
  <button class="btn color-attribute" title="MARRON CLAIR"><span data-attr-value="5137" data-attr-display-value="MARRON CLAIR" style="background-image: url(https://www.breal.net/img/jean-test-marron-femme-vue11-36125188430065137.jpg)"></span></button>
  <button class="btn color-attribute" title="Longueur 34"><span data-attr-value="34" data-attr-display-value="Longueur 34"></span></button>
  <button class="size-attribute">36</button>
  <button class="size-attribute">38</button>
  <button class="size-attribute">36</button>
</div>
<nav class="breadcrumb"><a>Accueil</a><a>Jeans femme</a><a>Jean coupe droite taille haute</a></nav>
</body></html>`;

const SFRA_OTHER_COLOR = SFRA_HTML.replace('data-pid="3612511476037"', 'data-pid="3612511315305"').replace(
  "/jean-test-noir-femme-36125188430060100.html",
  "/jean-test-denim-brut-femme-36125188430060308.html",
);

const SOLUSQUARE_HTML = `
<html><head>
<link rel="canonical" href="https://www.toscane-boutique.fr/fr/pantalons/toscane/tregging-uni-p-9330-coul-12.htm" />
<meta property="og:site_name" content="Toscane" />
<meta property="product:brand" content="Toscane" />
<meta property="og:image" content="https://cdn.toscane-boutique.fr/products_images/prod_9330/front.jpg" />
<script type="application/ld+json">
{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil"},{"@type":"ListItem","position":2,"name":"Pantalons"},{"@type":"ListItem","position":3,"name":"Tregging uni"}]}
</script>
<script type="application/ld+json">
{"@type":"Product","name":"Tregging uni","offers":{"@type":"Offer","price":"59.95","priceCurrency":"EUR"}}
</script>
</head><body>
<div data-params="{ prodID: 9330, colorID: 12 }" data-gtm_item_name="Tregging uni" data-gtm_item_brand="Toscane"></div>
<ul>
  <li id="p9330-52" data-params="{ colorLbl: 'CAMEL', colorID: '52', price: 59.95 }"></li>
  <li id="p9330-12" data-params="{ colorLbl: 'ANTHRACITE', colorID: '12', price: 59.95 }"></li>
  <li id="p9330-2" data-params="{ colorLbl: 'NOIR', colorID: '2', price: 59.95 }"></li>
  <li id="p9330-14" data-params="{ colorLbl: 'MARINE', colorID: '14', price: 59.95 }"></li>
  <li data-cid="12">1</li><li data-cid="12">2</li><li data-cid="12">3</li><li data-cid="12">4</li><li data-cid="12">5</li>
  <li data-cid="2">1</li><li data-cid="2">2</li><li data-cid="2">3</li><li data-cid="2">4</li><li data-cid="2">5</li>
</ul>
</body></html>`;

describe("variation threshold", () => {
  it("filters one extracted set at two thresholds without changing counts", () => {
    const extracted = [
      family({ productFamilyId: "a", distinctVariationCount: 5 }),
      family({ productFamilyId: "b", distinctVariationCount: 4 }),
      family({ productFamilyId: "c", distinctVariationCount: 2 }),
    ];
    const atFour = applyVariationThreshold(extracted, 4);
    const atFive = applyVariationThreshold(extracted, 5);
    assert.deepEqual(extracted.map((item) => item.distinctVariationCount), [5, 4, 2]);
    assert.equal(matchingFamilies(atFour).length, 2);
    assert.equal(matchingFamilies(atFive).length, 1);
    assert.equal(atFour[2]?.thresholdMatch, false);
    assert.equal(atFive[1]?.thresholdMatch, false);
  });

  it("rejects a non-positive threshold", () => {
    assert.throws(() => applyVariationThreshold([], 0), /INVALID_THRESHOLD/);
  });
});

describe("SFRA family identity", () => {
  it("derives one prefix when every color sku ends in its padded color id", () => {
    const key = familyIdFromColorSkus([
      { id: "100", sku: "36125188430060100" },
      { id: "308", sku: "36125188430060308" },
      { id: "5243", sku: "36125188430065243" },
      { id: "245", sku: "36125281151050245" },
    ]);
    assert.equal(key, null);
    const breal = familyIdFromColorSkus([
      { id: "100", sku: "36125188430060100" },
      { id: "308", sku: "36125188430060308" },
      { id: "5243", sku: "36125188430065243" },
    ]);
    assert.deepEqual(breal, { familyId: "3612518843006", suffixWidth: 4 });
    const bonobo = familyIdFromColorSkus([
      { id: "245", sku: "36125281151050245" },
      { id: "4301", sku: "36125281151054301" },
    ]);
    assert.equal(bonobo?.familyId, "3612528115105");
  });

  it("keeps two color pages as one family when data-pid differs", () => {
    const noir = parseSfraProduct(SFRA_HTML, "https://www.breal.net/jean-test-noir-femme-36125188430060100.html", OBSERVED);
    const brut = parseSfraProduct(
      SFRA_OTHER_COLOR,
      "https://www.breal.net/jean-test-denim-brut-femme-36125188430060308.html",
      OBSERVED,
    );
    assert.equal(noir.colorLevelDataPid, "3612511476037");
    assert.equal(brut.colorLevelDataPid, "3612511315305");
    assert.notEqual(noir.colorLevelDataPid, brut.colorLevelDataPid);
    assert.equal(noir.family.productFamilyId, "3612518843006");
    assert.equal(brut.family.productFamilyId, noir.family.productFamilyId);
    assert.equal(noir.family.distinctVariationCount, 4);
    assert.deepEqual(noir.family.sizeOptions, ["36", "38"]);
    assert.deepEqual(noir.family.lengthOptions, ["Longueur 34"]);
    assert.equal(noir.family.colorPatternNames.includes("Longueur 34"), false);
    assert.equal(noir.family.price, 39.99);
    assert.equal(noir.family.currency, "EUR");
    const collapsed = collapseByFamilyId([noir.family, brut.family]);
    assert.equal(collapsed.families.length, 1);
    assert.equal(collapsed.duplicatesRemoved, 1);
    assert.equal(
      publicProductUrlFromImage(
        "https://www.breal.net/img/jean-test-denim-brut-femme-vue11-36125188430060308.jpg",
        "https://www.breal.net/jean.html",
      ),
      "https://www.breal.net/jean-test-denim-brut-femme-36125188430060308.html",
    );
  });

  it("stores a name length outside the color count", () => {
    const html = SFRA_HTML.replace("Jean coupe droite taille haute", "Jeans large longueur 32 en coton");
    const parsed = parseSfraProduct(html, "https://www.bonoboplanet.com/jeans-large-longueur-32-36125281151054301.html", OBSERVED);
    assert.deepEqual(parsed.family.lengthOptions, ["Longueur 34", "32"]);
    assert.equal(parsed.family.distinctVariationCount, 4);
    assert.equal(parsed.family.colorPatternNames.some((name) => /longueur/i.test(name)), false);
  });
});

describe("Solusquare prodID", () => {
  it("groups four colors and five sizes under the page prodID", () => {
    const parsed = parseSolusquareProduct(
      SOLUSQUARE_HTML,
      "https://www.toscane-boutique.fr/fr/pantalons/toscane/tregging-uni-p-9330-coul-12.htm",
      OBSERVED,
    );
    assert.equal(parsed.htmlProdId, "9330");
    assert.equal(parsed.urlProdId, "9330");
    assert.equal(parsed.family.productFamilyId, "9330");
    assert.equal(parsed.family.distinctVariationCount, 4);
    assert.deepEqual(parsed.family.colorPatternNames, ["CAMEL", "ANTHRACITE", "NOIR", "MARINE"]);
    assert.deepEqual(parsed.family.sizeOptions, ["1", "2", "3", "4", "5"]);
    assert.equal(parsed.family.price, 59.95);
    assert.equal(parsed.family.currency, "EUR");
    assert.equal(parsed.family.category, "Pantalons");
    assert.equal(parsed.family.brand, "Toscane");
  });
});

describe("discovery and access limits", () => {
  it("prefers a clothing category over a gift-card URL", () => {
    const html = `
      <a href="/e-carte-cadeau-36125109990590100.html">Carte cadeau</a>
      <a href="/pantalons-femme-sc_010600">Pantalons</a>
      <a href="/jeans-femme-sc_010300">Jeans femme</a>
      <a href="https://www.breal.net/on/demandware.store/Product-Variation?dwvar_1_color=1">Variation</a>
    `;
    const chosen = chooseClothingCategory(html, "https://www.breal.net/");
    assert.equal(chosen, "https://www.breal.net/jeans-femme-sc_010300");
    assert.ok(scoreClothingCategory("https://www.breal.net/jeans-femme-sc_010300", "Jeans") > 0);
  });

  it("orders two lengths of one model ahead of the other listing URLs", () => {
    const urls = [
      "https://www.bonoboplanet.com/pull-36125200000000001.html",
      "https://www.bonoboplanet.com/jeans-large-longueur-32-denim-brut-homme-36125281151054301.html",
      "https://www.bonoboplanet.com/jeans-large-longueur-30-denim-brut-homme-36125281151030001.html",
    ];
    const ordered = prioritizeLengthPairs(urls);
    assert.equal(lengthGroupKey(urls[1] ?? ""), lengthGroupKey(urls[2] ?? ""));
    assert.match(ordered[0] ?? "", /longueur-32/);
    assert.match(ordered[1] ?? "", /longueur-30/);
  });

  it("rejects private hosts, unsupported sites, and disallowed variation URLs", async () => {
    assert.equal(MONITOR_LIMITS.maxFamilies, 20);
    assert.equal(MONITOR_LIMITS.maxConcurrency, 1);
    assert.throws(() => resolveSupportedTarget("https://127.0.0.1/"), /INVALID_URL/);
    assert.throws(() => resolveSupportedTarget("https://example.com/"), /UNSUPPORTED_SITE/);
    assert.throws(() => resolveSupportedTarget("http://www.breal.net/"), /HTTPS_REQUIRED/);
    await assert.rejects(() => assertPublicHostname("127.0.0.1"), /IP_LITERAL_REJECTED/);
    assert.equal(
      isHardDeniedUrl("https://www.breal.net/on/demandware.store/Sites-BRL_FR_SFRA-Site/fr_FR/Product-Variation?dwvar_1_color=100"),
      true,
    );
    await assert.rejects(
      () =>
        assertDocumentAllowed({
          url: "https://www.breal.net/on/demandware.store/Sites-BRL_FR_SFRA-Site/fr_FR/Product-Variation?dwvar_1_color=100",
          registrableDomain: "breal.net",
          robots: null,
        }),
      /DISALLOWED_PATH/,
    );
    const rules = parseRobotsTxt(
      [
        "User-agent: *",
        "Disallow: /*?dwvar*=*",
        "Disallow: /on/demandware.store/*",
        "Disallow: /*variation*",
      ].join("\n"),
      "*",
    );
    assert.equal(isRobotsAllowed("https://www.breal.net/jeans-femme-sc_010300?page=2", rules), true);
    assert.equal(
      isPathAllowedByRobots("/on/demandware.store/Sites-BRL_FR_SFRA-Site/fr_FR/Product-Variation", rules),
      false,
    );
  });
});
