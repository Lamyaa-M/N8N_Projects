const when_clicking_Execute_workflow = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'When clicking \u2018Execute workflow\u2019' }
});

const scrape = node({
  type: '@mendable/n8n-nodes-firecrawl.firecrawl',
  version: 1,
  config: { name: '/scrape', parameters: { operation: 'scrape', url: 'https://www.boulanger.com/c/refrigerateur', parsers: ['pdf'], requestOptions: {} }, position: [176, 0] }
});

const r_cup_ration_produits = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Récupération produits', parameters: { jsCode: 'const text =\n  $input.first().json.markdown ||\n  $input.first().json.data?.markdown ||\n  $input.first().json.content ||\n  \'\';\n\nif (!text) {\n  throw new Error(\'Aucun contenu Markdown trouvé dans Firecrawl\');\n}\n\nconst products = [];\n\nconst brands = [\n  \'DE DIETRICH\',\n  \'H.KOENIG\',\n  \'ESSENTIELB\',\n  \'SAMSUNG\',\n  \'LIEBHERR\',\n  \'WHIRLPOOL\',\n  \'ELECTROLUX\',\n  \'HISENSE\',\n  \'HAIER\',\n  \'SIEMENS\',\n  \'GORENJE\',\n  \'BOSCH\',\n  \'BEKO\',\n  \'LISTO\',\n  \'INDESIT\',\n  \'PROLINE\',\n  \'SMEG\',\n  \'LG\',\n  \'TCL\',\n  \'AEG\',\n  \'MIELE\',\n  \'CANDY\',\n  \'SCHNEIDER\',\n  \'BRANDT\',\n  \'HOTPOINT\',\n  \'NEFF\',\n  \'ASKO\',\n  \'AMICA\',\n  \'CHIQ\',\n  \'FRIGELUX\',\n  \'KLARSTEIN\',\n  \'ROSIERES\'\n];\n\nconst productRegex =\n  /\\[\\*\\*((?:Réfrigérateur|Mini réfrigérateur|Petit réfrigérateur)[^\\]]*?)\\*\\*\\]\\((https?:\\/\\/www\\.boulanger\\.com\\/ref\\/[^)#]+)\\)/gi;\n\nconst matches = Array.from(text.matchAll(productRegex));\n\nfunction parsePrice(value) {\n  if (!value) return null;\n\n  const normalized = value\n    .replace(/\\s/g, \'\')\n    .replace(\',\', \'.\');\n\n  const number = parseFloat(normalized);\n\n  return Number.isFinite(number) ? number : null;\n}\n\nfunction detectBrand(name) {\n  const upperName = name.toUpperCase();\n\n  for (const brand of brands) {\n    if (\n      upperName.includes(` ${brand} `) ||\n      upperName.includes(` ${brand}-`) ||\n      upperName.endsWith(` ${brand}`) ||\n      upperName.includes(` ${brand},`) ||\n      upperName.includes(` ${brand}.`)\n    ) {\n      return brand;\n    }\n  }\n\n  return null;\n}\n\nfor (let i = 0; i < matches.length; i++) {\n  const match = matches[i];\n\n  const name = match[1]\n    .replace(/\\*\\*/g, \'\')\n    .replace(/\\s+/g, \' \')\n    .trim();\n\n  const url = match[2].trim();\n\n  const reference = url.split(\'/ref/\')[1];\n\n  const nextMatch = matches[i + 1];\n\n  const start = match.index;\n  const end = nextMatch ? nextMatch.index : text.length;\n\n  const block = text.substring(start, end);\n\n  let price = null;\n  let old_price = null;\n  let discount_percent = null;\n  let is_promotion = false;\n\n  const brand = detectBrand(name);\n\n  const priceSectionMatch = block.match(\n    /(?:Prix de référence|Ancien prix)[\\s\\S]*?(?=!\\[Classe énergétique|Fiche d\'information sur le produit|Ajouter au panier)/i\n  );\n\n  if (priceSectionMatch) {\n    const priceSection = priceSectionMatch[0];\n\n    const oldPriceMatch = priceSection.match(\n      /oldPrice\\s*([\\d\\s.,]+)\\s*€/\n    );\n\n    if (oldPriceMatch) {\n      old_price = parsePrice(oldPriceMatch[1]);\n    }\n\n    const discountMatch = priceSection.match(\n      /-\\s*(\\d+)\\s*%/\n    );\n\n    if (discountMatch) {\n      discount_percent = parseInt(\n        discountMatch[1],\n        10\n      );\n\n      is_promotion = true;\n\n      const afterDiscount = priceSection.substring(\n        discountMatch.index + discountMatch[0].length\n      );\n\n      const currentPriceMatch = afterDiscount.match(\n        /(\\d[\\d\\s.,]*)\\s*€/\n      );\n\n      if (currentPriceMatch) {\n        price = parsePrice(currentPriceMatch[1]);\n      }\n    } else if (oldPriceMatch) {\n      const afterOldPrice = priceSection.substring(\n        oldPriceMatch.index + oldPriceMatch[0].length\n      );\n\n      const currentPriceMatch = afterOldPrice.match(\n        /(\\d[\\d\\s.,]*)\\s*€/\n      );\n\n      if (currentPriceMatch) {\n        price = parsePrice(currentPriceMatch[1]);\n      }\n    } else {\n      const currentPriceMatches = Array.from(\n        priceSection.matchAll(\n          /(\\d[\\d\\s.,]*)\\s*€/g\n        )\n      );\n\n      if (currentPriceMatches.length > 0) {\n        const lastMatch =\n          currentPriceMatches[currentPriceMatches.length - 1];\n\n        price = parsePrice(lastMatch[1]);\n      }\n    }\n  }\n\n  if (price === null) {\n    const beforeEnergy = block.split(\n      /!\\[Classe énergétique/i\n    )[0];\n\n    const cleanBeforeEnergy = beforeEnergy\n      .replace(\n        /\\d[\\d\\s.,]*\\s*€\\s*\\/\\s*mois/gi,\n        \'\'\n      )\n      .replace(\n        /\\d[\\d\\s.,]*\\s*€\\s*par\\s*mois/gi,\n        \'\'\n      )\n      .replace(\n        /\\*\\*\\d[\\d\\s.,]*\\s*€\\*\\*\\s*dès/gi,\n        \'\'\n      );\n\n    const priceMatches = Array.from(\n      cleanBeforeEnergy.matchAll(\n        /(\\d[\\d\\s.,]*)\\s*€/g\n      )\n    );\n\n    const validPrices = [];\n\n    for (const priceMatch of priceMatches) {\n      const value = parsePrice(priceMatch[1]);\n\n      if (\n        value !== null &&\n        value >= 100 &&\n        value !== old_price\n      ) {\n        validPrices.push(value);\n      }\n    }\n\n    if (validPrices.length > 0) {\n      price = validPrices[validPrices.length - 1];\n    }\n  }\n\n  if (\n    old_price !== null &&\n    price !== null &&\n    old_price > price\n  ) {\n    is_promotion = true;\n\n    if (discount_percent === null) {\n      discount_percent = Math.round(\n        ((old_price - price) / old_price) * 100\n      );\n    }\n  }\n\n  products.push({\n    name,\n    brand,\n    reference,\n    url,\n    price,\n    old_price,\n    discount_percent,\n    is_promotion\n  });\n}\n\nconst unique = [];\nconst seen = new Set();\n\nfor (const product of products) {\n  if (!seen.has(product.reference)) {\n    seen.add(product.reference);\n    unique.push(product);\n  }\n}\n\nreturn unique.map(product => ({\n  json: product\n}));' }, position: [336, 0] }
});

const code_in_JavaScript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Code in JavaScript', parameters: { jsCode: 'return [\n  {\n    json: {\n      sheetName: "Veille_" + $now.toFormat("yyyy-MM-dd")\n    }\n  }\n];' }, position: [560, 0] }
});

const create_sheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Create sheet', parameters: { operation: 'create', documentId: { __rl: true, value: '1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M', mode: 'list', cachedResultName: 'veille concurentielle', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M/edit?usp=drivesdk' }, title: expr('{{ $json.sheetName }}'), options: {} }, credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'a5oq4k4olyDNfNVb') }, position: [736, 0] }
});

const calcul = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Calcul', parameters: { jsCode: '// Loop over input items and add a new field called \'myNewField\' to the JSON of each one\nfor (const item of $input.all()) {\n  item.json.myNewField = 1;\n}\n\nreturn $input.all();' }, position: [912, 0] }
});

const comparaison = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'comparaison', parameters: { jsCode: '// Loop over input items and add a new field called \'myNewField\' to the JSON of each one\nfor (const item of $input.all()) {\n  item.json.myNewField = 1;\n}\n\nreturn $input.all();' }, position: [1072, 0] }
});

const analyse = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 2.3,
  config: { name: 'Analyse', parameters: { modelId: { __rl: true, mode: 'list', value: '' }, responses: { values: [{}] }, builtInTools: {}, options: {} }, position: [1264, 0] }
});

const envoie_de_mail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Envoie de mail', parameters: { options: {} }, credentials: { gmailOAuth2: newCredential('Gmail account', '5njRrGfhRROcnBe4') }, position: [1568, 0], webhookId: '94e6f8af-9e09-40a6-a826-5e542aad3ba3' }
});

const wf = workflow('WxTvcbvhLA7bAPHq', 'Exercice2', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(sticky('**Objectif**\n\nAutomatiser chaque semaine une veille concurrentielle sur les réfrigérateurs d\u2019une enseigne afin de collecter les produits, prix et promotions. Les données sont historisées, comparées à la collecte précédente, puis synthétisées par marque dans un e-mail avec une courte analyse.\n\n**Affirmations**\n1. La collecte est effectuée 1 fois par semaine.\n2. Les données collectées sont : marque, produit, référence, prix, ancien prix, réduction, promotion, URL, date de collecte.\n3. Aucune donnée n\u2019est inventée : si une information est absente, elle reste vide.\n4. Toutes les pages nécessaires doivent être parcourues pour récupérer les produits.\nUn même produit ne doit pas être compté plusieurs fois.\n5. Chaque collecte est conservée pour permettre la comparaison avec la précédente.\n6. Les statistiques sont calculées par marque.\n7. Une collecte est complète, partielle ou en échec.\n8. Une collecte partielle doit être clairement signalée et ne doit pas être présentée comme complète.\n9. Si la collecte est partielle → e-mail envoyé avec une alerte.\n10. Si la collecte échoue → aucun e-mail de veille n\u2019est envoyé.\n11. L\u2019IA produit uniquement une analyse à partir des données collectées et ne doit rien inventer.\n', [], { name: 'Sticky Note', width: 464, height: 208, position: [-192, -256] }))
  .add(when_clicking_Execute_workflow)
  .to(scrape)
  .to(r_cup_ration_produits)
  .to(code_in_JavaScript)
  .to(create_sheet)
  .to(calcul)
  .to(comparaison)
  .to(analyse)
  .to(envoie_de_mail)