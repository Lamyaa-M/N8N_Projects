const chaque_lundi_06_00 = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Chaque lundi 06:00', parameters: { rule: { interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 6 }] } }, position: [0, 96] }
});

const collecter_les_produits_Firecrawl = node({
  type: '@mendable/n8n-nodes-firecrawl.firecrawl',
  version: 1,
  config: { name: 'Collecter les produits (Firecrawl)', parameters: { operation: 'scrape', url: 'https://www.boulanger.com/c/refrigerateur', scrapeOptions: { options: { formats: { format: [{ prompt: 'Extract every refrigerator product listing on this page (French retailer Boulanger). For each product return: brand, productName, reference, currentPrice, oldPrice, discountPercent, isOnPromotion, url. Price rules: prices appear like 1849,00 EUR with a comma as decimal separator and a space as thousands separator - always convert to a plain number with a dot as decimal separator (1849.00). Ignore monthly payment mentions such as des 108,40 EUR /mois en 20x. oldPrice is only the crossed-out former price, discountPercent only when an explicit percentage is shown, isOnPromotion true only when an explicit promo flag or a crossed-out price is present. url must be the absolute product link starting with https://www.boulanger.com/ref/. Ignore all non-product content: navigation, filters, brand lists, Revendre votre appareil, Pensez a la location, sponsored blocks, ads. If a value is not present on the page use null, never guess. Return { products: [...] }', schema: { type: 'object', properties: { products: { type: 'array', items: { type: 'object', properties: { brand: { type: ['string', 'null'] }, productName: { type: ['string', 'null'] }, reference: { type: ['string', 'null'] }, currentPrice: { type: ['number', 'null'] }, oldPrice: { type: ['number', 'null'] }, discountPercent: { type: ['number', 'null'] }, isOnPromotion: { type: ['boolean', 'null'] }, url: { type: ['string', 'null'] } } } } } }, type: 'json' }] }, headers: {}, onlyMainContent: false, actions: { items: [{ type: 'scroll' }, { type: 'scroll' }, { milliseconds: 2000 }] }, location: { settings: { country: 'FR', languages: { language: [{ code: 'fr' }] } } }, storeInCache: false, waitFor: 3000 } }, requestOptions: {} }, position: [224, 96], onError: 'continueErrorOutput' }
});

const normaliser_les_produits = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Normaliser les produits', parameters: { jsCode: 'const out = []; const errors = [];\nlet pagesOk = 0; let pagesFailed = 0;\nfor (const item of $input.all()) {\n  const data = item.json;\n  if (data.error) { pagesFailed += 1; errors.push(String(data.error).slice(0, 300)); continue; }\n  const payload = data.json || data.data || data;\n  const products = payload && Array.isArray(payload.products) ? payload.products : [];\n  if (products.length > 0) pagesOk += 1;\n  for (const p of products) {\n    const price = typeof p.currentPrice === \'number\' ? p.currentPrice : null;\n    const oldPrice = typeof p.oldPrice === \'number\' ? p.oldPrice : null;\n    let discount = typeof p.discountPercent === \'number\' ? p.discountPercent : null;\n    if (discount === null && price && oldPrice && oldPrice > price) { discount = Math.round(((oldPrice - price) / oldPrice) * 1000) / 10; }\n    out.push({\n      marque: (p.brand || \'\').toString().trim(),\n      nomProduit: (p.productName || \'\').toString().trim(),\n      reference: (p.reference || \'\').toString().trim(),\n      prixActuel: price, ancienPrix: oldPrice, reduction: discount,\n      enPromotion: p.isOnPromotion === true || (discount !== null && discount > 0),\n      url: (p.url || \'\').toString().trim(),\n      dateCollecte: new Date().toISOString().slice(0, 10)\n    });\n  }\n}\nreturn [{ json: { produits: out, pagesOk, pagesFailed, erreurs } }];' }, position: [448, 96], executeOnce: true }
});

const supprimer_les_doublons = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Supprimer les doublons', parameters: { jsCode: 'const data = $input.first().json;\nconst seen = new Set(); const produits = []; let doublons = 0;\nfor (const p of data.produits || []) {\n  const key = (p.reference || p.url || (p.nomProduit + \'|\' + p.prixActuel)).toString().trim().toLowerCase();\n  if (key && seen.has(key)) { doublons += 1; continue; }\n  seen.add(key); produits.push(p);\n}\nreturn [{ json: { ...data, produits, doublonsRetires: doublons } }];' }, position: [672, 96], executeOnce: true }
});

const des_produits_ont_ete_collectes = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { name: 'Des produits ont ete collectes ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, combinator: 'and', conditions: [{ id: 'count-check', leftValue: expr('{{ $json.produits.length }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } }] }, options: {} }, position: [896, 96] }
});

const definir_le_statut_de_collecte = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Definir le statut de collecte', parameters: { jsCode: 'const c = $input.first().json;\nconst p = c.produits || [];\nconst echecs = c.pagesFailed || 0;\nlet statut = \'Echec\';\nif (p.length > 0 && echecs === 0) statut = \'Collecte complete\';\nelse if (p.length > 0) statut = \'Collecte partielle\';\nreturn [{ json: {\n  dateCollecte: new Date().toISOString().slice(0, 10),\n  enseigne: \'Boulanger\', produits: p, statut: statut,\n  pagesOk: c.pagesOk || 0, pagesEchouees: echecs,\n  doublonsRetires: c.doublonsRetires || 0, erreurs: c.erreurs || []\n} }];' }, position: [1120, 96], executeOnce: true }
});

const lire_historique_Sheets = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Lire historique (Sheets)', parameters: { operation: 'create', documentId: { __rl: true, value: '1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M', mode: 'list', cachedResultName: 'veille concurentielle', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M/edit?usp=drivesdk' }, options: {} }, credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'a5oq4k4olyDNfNVb') }, position: [1344, 96] }
});

const comparer_avec_la_semaine_precedente = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Comparer avec la semaine precedente', parameters: { jsCode: 'const d = $input.first().json;\nconst cur = d.produits || []; const hist = d.historique || [];\nconst key = (p) => (p.reference || p.url || (p.nomProduit + \'\')).toString().trim().toLowerCase();\nconst curMap = new Map();\nfor (const p of cur) curMap.set(key(p), p);\nconst runs = new Map();\nfor (const h of hist) {\n  if (!runs.has(h.dateCollecte)) runs.set(h.dateCollecte, new Map());\n  runs.get(h.dateCollecte).set(key(h), h);\n}\nconst prevDate = Array.from(runs.keys()).filter((x) => x !== d.dateCollecte).sort().pop() || null;\nconst prevMap = prevDate ? runs.get(prevDate) : new Map();\nconst nouveaux = []; const disparus = []; const changements = [];\nconst nouvellesPromos = []; const promosTerminees = [];\nfor (const entry of curMap) {\n  const p = entry[1];\n  if (!prevMap.has(entry[0])) { nouveaux.push(p.nomProduit || p.reference); continue; }\n  const old = prevMap.get(entry[0]);\n  if (typeof p.prixActuel === \'number\' && typeof old.prixActuel === \'number\' && p.prixActuel !== old.prixActuel) {\n    changements.push({ produit: p.nomProduit, ancienPrix: old.prixActuel, nouveauPrix: p.prixActuel });\n  }\n  if (p.enPromotion === true && old.enPromotion !== true) nouvellesPromos.push(p.nomProduit);\n  if (p.enPromotion !== true && old.enPromotion === true) promosTerminees.push(p.nomProduit);\n}\nfor (const entry of prevMap) {\n  if (!curMap.has(entry[0])) disparus.push(entry[1].nomProduit || entry[1].reference);\n}\nreturn [{ json: { ...d, semainePrecedente: prevDate, nouveaux, disparus, changements, nouvellesPromos, promosTerminees } }];' }, position: [1568, 96], executeOnce: true }
});

const statistiques_par_marque = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Statistiques par marque', parameters: { jsCode: 'const d = $(\'Comparer avec la semaine precedente\').first().json;\nconst parMarque = {};\nfor (const p of d.produits || []) {\n  const m = (p.marque || \'Marque inconnue\').toString().trim();\n  if (!parMarque[m]) parMarque[m] = { produits: 0, promos: 0, reductions: [], prix: [] };\n  parMarque[m].produits += 1;\n  if (p.enPromotion === true) parMarque[m].promos += 1;\n  if (typeof p.reduction === \'number\') parMarque[m].reductions.push(p.reduction);\n  if (typeof p.prixActuel === \'number\') parMarque[m].prix.push(p.prixActuel);\n}\nconst moy = (a) => a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null;\nconst stats = Object.keys(parMarque).map((m) => {\n  const s = parMarque[m];\n  return {\n    marque: m, produits: s.produits, promotions: s.promos,\n    tauxPromo: s.produits ? Math.round((s.promos / s.produits) * 1000) / 10 : 0,\n    reductionMoyenne: moy(s.reductions),\n    reductionMax: s.reductions.length ? Math.max.apply(null, s.reductions) : null,\n    prixMoyen: moy(s.prix)\n  };\n});\nstats.sort((a, b) => b.produits - a.produits);\nreturn [{ json: {\n  dateCollecte: d.dateCollecte, enseigne: d.enseigne, statut: d.statut,\n  pagesEchouees: d.pagesEchouees, doublonsRetires: d.doublonsRetires, erreurs: d.erreurs,\n  totalProduits: (d.produits || []).length, stats: stats, semainePrecedente: d.semainePrecedente,\n  nouveaux: d.nouveaux, disparus: d.disparus, changements: d.changements,\n  nouvellesPromos: d.nouvellesPromos, promosTerminees: d.promosTerminees\n} }];' }, position: [1792, 0], executeOnce: true }
});

const analyse_IA = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 1.3,
  config: { name: 'Analyse IA', parameters: { modelId: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, messages: { values: [{ content: 'Tu es un analyste de veille concurrentielle. Tu analyses uniquement les donnees fournies, tu n inventes jamais de chiffre ni de marque, et tu signales explicitement toute information manquante. Tu reponds en francais, de facon concise et factuelle.', role: 'system' }, { content: 'Redige 4 a 6 phrases factuelles en francais : marques les plus presentes, marques avec le plus de promotions, reductions observees, evolution par rapport a la semaine precedente, changements importants. Donnees : {{ JSON.stringify($json) }}' }] }, options: {} }, position: [2016, 0] }
});

const construire_le_mail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Construire le mail', parameters: { jsCode: 'const d = $(\'Statistiques par marque\').first().json;\nconst st = d.stats || [];\nconst fmt = (v, u) => (v === null || v === undefined || v === \'\') ? \'-\' : String(v) + (u || \'\');\nconst rowsHtml = st.map((s) =>\n  \'<tr><td>\' + s.marque + \'</td><td>\' + s.produits + \'</td><td>\' + s.promotions + \'</td><td>\' +\n  fmt(s.tauxPromo, \' %\') + \'</td><td>\' + fmt(s.reductionMoyenne, \' %\') + \'</td><td>\' +\n  fmt(s.reductionMax, \' %\') + \'</td><td>\' + fmt(s.prixMoyen, \' EUR\') + \'</td></tr>\'\n).join(\'\');\nconst alertes = [];\nif (d.statut !== \'Collecte complete\') alertes.push(\'Statut de la collecte : \' + d.statut);\nif (d.pagesEchouees > 0) alertes.push(\'Pages non recuperees : \' + d.pagesEchouees);\nif (d.erreurs && d.erreurs.length) alertes.push(\'Erreurs : \' + d.erreurs.slice(0, 5).join(\' ; \'));\nconst analysis = $(\'Analyse IA\').first().json;\nconst texte = (analysis.content || (analysis.message && analysis.message.content) || \'\').toString().trim();\nconst html =\n  \'<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222">\' +\n  \'<h2>Veille concurrentielle - Refrigerateurs</h2>\' +\n  \'<p><strong>Date :</strong> \' + d.dateCollecte + \'<br>\' +\n  \'<strong>Enseigne :</strong> \' + d.enseigne + \'<br>\' +\n  \'<strong>Produits :</strong> \' + d.totalProduits + \'<br>\' +\n  \'<strong>Statut :</strong> \' + d.statut + \'</p>\' +\n  \'<h3>Statistiques par marque</h3>\' +\n  \'<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">\' +\n  \'<tr style="background:#eee"><th>Marque</th><th>Produits</th><th>Promotions</th><th>Taux promo</th>\' +\n  \'<th>Reduction moyenne</th><th>Reduction max</th><th>Prix moyen</th></tr>\' + rowsHtml + \'</table>\' +\n  \'<h3>Analyse</h3><p>\' + texte + \'</p>\' +\n  \'<h3>Alertes</h3>\' + (alertes.length ? \'<ul>\' + alertes.map((a) => \'<li>\' + a + \'</li>\').join(\'\') + \'</ul>\' : \'<p>Aucune.</p>\') +\n  \'</body></html>\';\nreturn [{ json: { html, alertes, statut: d.statut } }];' }, position: [2240, 0], executeOnce: true }
});

const envoyer_le_rapport_par_e_mail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Envoyer le rapport par e-mail', parameters: { sendTo: 'lmarzouq@eugeniaschool.com', subject: expr('{{ "Veille refrigerators - " + $json.statut + " - " + $now.toFormat("yyyy-LL-dd") }}'), message: expr('{{ $json.html }}'), options: {} }, credentials: { gmailOAuth2: newCredential('Gmail account', '5njRrGfhRROcnBe4') }, position: [2464, 0], webhookId: '87335f8e-23e2-48c4-b5ef-12282f2df25d' }
});

const preparer_lignes_Sheets = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparer lignes Sheets', parameters: { jsCode: 'const d = $(\'Comparer avec la semaine precedente\').first().json;\nconst rows = [];\nfor (const p of d.produits || []) {\n  rows.push({ json: {\n    dateCollecte: d.dateCollecte, enseigne: d.enseigne, marque: p.marque,\n    nomProduit: p.nomProduit, reference: p.reference, prixActuel: p.prixActuel,\n    ancienPrix: p.ancienPrix, reduction: p.reduction,\n    enPromotion: p.enPromotion, url: p.url\n  } });\n}\nreturn rows;' }, position: [1792, 192], executeOnce: true }
});

const enregistrer_collecte_Sheets = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Enregistrer collecte (Sheets)', parameters: { operation: 'append', documentId: { __rl: true, value: '1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M', mode: 'list', cachedResultName: 'veille concurentielle', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/1VJdL_YESrGaEWBKEd386113IpFdCiGJSe1OziNcJA3M/edit?usp=drivesdk' }, sheetName: { __rl: true, mode: 'list', value: 799076094 }, columns: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false }, options: {} }, credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'a5oq4k4olyDNfNVb') }, position: [2016, 192] }
});

const wf = workflow('CzZml3snTXdzITz4', 'Veille refrigerators - concurrent', { executionOrder: 'v1', availableInMCP: true, binaryMode: 'separate' });

export default wf
  .add(chaque_lundi_06_00)
  .to(collecter_les_produits_Firecrawl)
  .to(normaliser_les_produits)
  .to(supprimer_les_doublons)
  .to(des_produits_ont_ete_collectes.onTrue(definir_le_statut_de_collecte
    .to(lire_historique_Sheets)
    .to(comparer_avec_la_semaine_precedente
    .to([
      statistiques_par_marque
      .to(analyse_IA)
      .to(construire_le_mail)
      .to(envoyer_le_rapport_par_e_mail),
      preparer_lignes_Sheets
      .to(enregistrer_collecte_Sheets)]))))