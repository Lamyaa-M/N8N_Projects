const PROMPT_EXTRACTION = "Tu analyses des pages de vente de refrigerateurs du site Boulanger (https://www.boulanger.com). Pour chaque fiche produit visible sur la page, retourne un objet avec : marque (constructeur, ex: Samsung, Bosch, Whirlpool), nomProduit (libelle commercial exact), reference (reference fabricant si visible), prixActuel (nombre), ancienPrix (nombre, uniquement si un prix barre est affiche), reduction (nombre, uniquement si un pourcentage est explicitement affiche), enPromotion (boolean), url (lien produit absolu commencant par https://www.boulanger.com/ref/ si la page est une fiche produit, sinon null). Regles de prix : les prix apparaissent comme 1849,00 EUR avec une virgule decimale, convertis toujours en nombre avec un point decimal. Ignore les mentions de paiement mensuel (ex: des 108,40 EUR /mois en 20x). ancienPrix ne doit venir que d un prix barre. reduction uniquement si un pourcentage est affiche. enPromotion true uniquement si un badge promo ou un prix barre est present. Si une information n est pas visible sur la page, mets null. N invente jamais, n extrapole jamais, ne complete jamais une information manquante. Ignore tout ce qui n est pas un produit : navigation, filtres, listes de marques, bandeaux, publicites, services. Si aucune fiche produit n est presente, retourne un tableau products vide.";

const SCHEMA_PRODUITS = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          marque: { type: ['string', 'null'] },
          nomProduit: { type: ['string', 'null'] },
          reference: { type: ['string', 'null'] },
          prixActuel: { type: ['number', 'null'] },
          ancienPrix: { type: ['number', 'null'] },
          reduction: { type: ['number', 'null'] },
          enPromotion: { type: ['boolean', 'null'] },
          url: { type: ['string', 'null'] }
        }
      }
    }
  },
  required: ['products']
};

const COLONNES = {
  mappingMode: 'defineBelow',
  value: {
    date_collecte: expr('{{ $json.date_collecte }}'),
    enseigne: expr('{{ $json.enseigne }}'),
    marque: expr('{{ $json.marque }}'),
    nom_produit: expr('{{ $json.nom_produit }}'),
    reference: expr('{{ $json.reference }}'),
    prix_actuel: expr('{{ $json.prix_actuel }}'),
    ancien_prix: expr('{{ $json.ancien_prix }}'),
    reduction: expr('{{ $json.reduction }}'),
    en_promotion: expr('{{ $json.en_promotion }}'),
    url: expr('{{ $json.url }}'),
    statut_collecte: expr('{{ $json.statut_collecte }}')
  }
};

const chaque_lundi_06_00 = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Chaque lundi 06:00', parameters: { rule: { interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 6 }] } }, position: [0, 0] }
});

const declenchement_manuel = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Declenchement manuel', notes: 'Declencheur de test. Un scheduleTrigger ne peut pas etre execute manuellement depuis l API, ce noeud permet de lancer la collecte a la demande et de verifier le resultat avant le lundi.', notesInFlow: true, position: [0, 240] }
});

const collecter_les_refrigerateurs = node({
  type: '@mendable/n8n-nodes-firecrawl.firecrawl',
  version: 1,
  config: {
    name: 'Collecter les refrigerateurs (Firecrawl)',
    notes: "Spec section 4: le crawl parcourt les differentes pages de la categorie refrigerateurs. Pas de limite artificially imposee : limit est fixe au dessus du nombre d articles annonces par Boulanger (1041) pour que rien ne soit tronque. ATTENTION: les options Firecrawl doivent etre imbriquees dans scrapeOptions.options, sinon le format json n est jamais demande et la reponse ne contient que le markdown. En cas de collecte vide, verifier d abord que formats est bien sous options.",
    notesInFlow: true,
    parameters: {
      resource: 'Crawling',
      operation: 'crawl',
      url: 'https://www.boulanger.com/c/refrigerateur',
      limit: 1200,
      maxConcurrency: 15,
      delay: 200,
      includePaths: { items: [{ path: '/c/refrigerateur*' }, { path: '/ref/*' }] },
      excludePaths: { items: [] },
      crawlOptions: {
        ignoreSitemap: false,
        allowExternalLinks: false,
        allowSubdomains: false,
        scrapeOptions: {
          options: {
            formats: { format: [{ type: 'json', prompt: PROMPT_EXTRACTION, schema: SCHEMA_PRODUITS }] },
            onlyMainContent: true,
            blockAds: true,
            waitFor: 3000,
            storeInCache: false,
            timeout: 60000
          }
        }
      },
      requestOptions: {}
    },
    credentials: { firecrawlApi: newCredential('Firecrawl account') },
    position: [224, 0],
    onError: 'continueErrorOutput'
  }
});

const normaliser_et_controler = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normaliser et controler',
    notes: "Extrait les produits de la reponse Firecrawl. La forme observee est { success, data } ou data contient un objet par page crawl, chaque page portant l extraction structurée dans page.json. Si une page est recuperee mais sans extraction json, elle est comptee en page en echec pour que le statut devienne partiel et non complet.",
    notesInFlow: true,
    parameters: {
      jsCode: "const dateCollecte = new Date().toISOString().slice(0, 10);\n\nconst erreurs = [];\nconst produitsExtraits = [];\nconst urls vues = new Set();\nlet pagesOk = 0;\nlet pagesEchouees = 0;\nlet pagesSansExtraction = 0;\n\nfunction nombre(v) { return typeof v === 'number' && isFinite(v) ? v : null; }\nfunction texte(v) { return v === null || v === undefined ? '' : String(v).trim(); }\n\n// Firecrawl renvoie { success, data } avec data soit une page unique, soit un tableau de pages.\n// Chaque page peut porter l extraction structurée dans page.json.\nfor (const item of $input.all()) {\n  const enveloppe = item.json;\n  if (!enveloppe) continue;\n  if (enveloppe.error) { pagesEchouees += 1; erreurs.push(String(enveloppe.error).slice(0, 300)); continue; }\n\n  const pages = Array.isArray(enveloppe.data) ? enveloppe.data : [enveloppe.data];\n  for (const page of pages) {\n    if (!page || typeof page !== 'object') { pagesEchouees += 1; continue; }\n    const extraction = page.json;\n    if (!extraction || !Array.isArray(extraction.products)) {\n      // Page bien recuperee mais extraction absente : c est un echec partiel, pas une page ok.\n      pagesSansExtraction += 1;\n      pagesEchouees += 1;\n      const src = (page.metadata && page.metadata.sourceURL) || 'source inconnue';\n      erreurs.push('Extraction JSON absente pour ' + src);\n      continue;\n    }\n    pagesOk += 1;\n    for (const p of extraction.products) {\n      if (!p || typeof p !== 'object') continue;\n      const url = texte(p.url);\n      if (url) {\n        if (vues.has(url)) continue;\n        vues.add(url);\n      }\n      const nomProduit = texte(p.nomProduit);\n      if (!nomProduit && !url && nombre(p.prixActuel) === null) continue;\n      const prixActuel = nombre(p.prixActuel);\n      const ancienPrix = nombre(p.ancienPrix);\n      let reduction = nombre(p.reduction);\n      if (reduction === null && prixActuel !== null && ancienPrix !== null && ancienPrix > prixActuel && ancienPrix > 0) {\n        reduction = Math.round(((ancienPrix - prixActuel) / ancienPrix) * 1000) / 10;\n      }\n      produitsExtraits.push({\n        marque: texte(p.marque) || 'Marque inconnue',\n        nomProduit: nomProduit,\n        reference: texte(p.reference),\n        prixActuel: prixActuel,\n        ancienPrix: ancienPrix,\n        reduction: reduction,\n        enPromotion: p.enPromotion === true || (reduction !== null && reduction > 0),\n        url: url\n      });\n    }\n  }\n}\n\n// Section 7 de la spec: le statut ne repose que sur des faits constates.\nlet statut = 'Echec';\nif (produitsExtraits.length > 0 && pagesEchouees === 0) statut = 'Collecte complete';\nelse if (produitsExtraits.length > 0) statut = 'Collecte partielle';\n\nreturn [{ json: {\n  dateCollecte: dateCollecte,\n  enseigne: 'Boulanger',\n  produits: produitsExtraits,\n  statut: statut,\n  pagesOk: pagesOk,\n  pagesEchouees: pagesEchouees,\n  pagesSansExtraction: pagesSansExtraction,\n  erreurs: erreurs.slice(0, 20)\n} }];"
    },
    position: [448, 0],
    executeOnce: true
  }
});

const supprimer_les_doublons = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Supprimer les doublons',
    notes: 'Regle 2 de la spec: ne jamais compter deux fois le meme produit. Priorite de cle: reference fabricant, puis URL, puis nom et prix.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $input.first().json;\n\nfunction cle(p) {\n  const ref = (p.reference || '').toString().trim().toLowerCase();\n  if (ref) return 'ref:' + ref;\n  const url = (p.url || '').toString().trim().toLowerCase();\n  if (url) return 'url:' + url;\n  return 'nom:' + (p.nomProduit || '').toString().trim().toLowerCase() + '|' + String(p.prixActuel);\n}\n\nconst vus = new Set();\nconst uniques = [];\nlet doublonsRetires = 0;\nfor (const p of d.produits || []) {\n  const k = cle(p);\n  if (vus.has(k)) { doublonsRetires += 1; continue; }\n  vus.add(k);\n  uniques.push(p);\n}\n\nreturn [{ json: { ...d, produits: uniques, doublonsRetires: doublonsRetires } }];"
    },
    position: [672, 0],
    executeOnce: true
  }
});

const la_collecte_est_elle_exploitable = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'La collecte est-elle exploitable ?',
    notes: 'Section 8 de la spec: une collecte en echec ne declenche aucun email. La branche false enregistre la trace en base et s arrete la.',
    notesInFlow: true,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'statut-check', leftValue: expr('{{ $json.statut }}'), rightValue: 'Echec', operator: { type: 'string', operation: 'notEquals' } }],
        combinator: 'and'
      },
      options: {}
    },
    position: [896, 0]
  }
});

const enregistrer_les_erreurs = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer la trace d echec',
    notes: 'Conserve le statut d une collecte en echec sans envoyer d email. Une ligne de trace est ecrite meme si aucun produit n a pu etre recupere, avec le detail des erreurs dans le nom du produit.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $('Supprimer les doublons').first().json;\nconst lignes = (d.produits || []).map((p) => ({ json: {\n  date_collecte: d.dateCollecte, enseigne: d.enseigne, marque: p.marque,\n  nom_produit: p.nomProduit, reference: p.reference, prix_actuel: p.prixActuel,\n  ancien_prix: p.ancienPrix, reduction: p.reduction, en_promotion: p.enPromotion,\n  url: p.url, statut_collecte: d.statut\n} }));\nconst detail = (d.erreurs && d.erreurs.length) ? d.erreurs.slice(0, 2).join(' / ').slice(0, 180) : 'aucun detail';\nlignes.push({ json: {\n  date_collecte: d.dateCollecte, enseigne: d.enseigne, marque: '',\n  nom_produit: 'ECHEC - pages ok:' + (d.pagesOk || 0) + ' sans extraction:' + (d.pagesSansExtraction || 0) + ' - ' + detail,\n  reference: '', prix_actuel: null, ancien_prix: null, reduction: null,\n  en_promotion: false, url: '', statut_collecte: d.statut\n} });\nreturn lignes;"
    },
    position: [1120, 160]
  }
});

const enregistrer_echec_dans_la_base = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Enregistrer l echec (Data Table)',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'veille_refrigerateurs' },
      columns: COLONNES,
      options: { optimizeBulk: true }
    },
    position: [1344, 160]
  }
});

const lire_l_historique = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Lire historique (Data Table)',
    notes: 'Recupere toutes les collectes anterieures a la date du jour. Le filtre neq evite de relire l historique integral et de se melanger avec la collecte du jour.',
    notesInFlow: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'veille_refrigerateurs' },
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'date_collecte', condition: 'neq', keyValue: expr('{{ $json.dateCollecte }}') }] },
      returnAll: true
    },
    position: [1120, -64]
  }
});

const comparer_avec_la_semaine_precedente = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Comparer avec la semaine precedente',
    notes: 'Section 6 de la spec: nouveaux produits, produits disparus, changements de prix, nouvelles promotions et promotions terminees. La comparaison porte sur la seule collecte la plus recente anterieure. Reference explicite au noeud de deduplication car celui-ci recoit une ligne par produit de l historique.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $('Supprimer les doublons').first().json;\nconst historique = $input.all().map((i) => i.json);\n\nfunction cle(p) {\n  const ref = (p.reference || '').toString().trim().toLowerCase();\n  if (ref) return 'ref:' + ref;\n  const url = (p.url || '').toString().trim().toLowerCase();\n  if (url) return 'url:' + url;\n  return 'nom:' + (p.nomProduit || p.nom_produit || '').toString().trim().toLowerCase();\n}\n\nconst parDate = new Map();\nfor (const h of historique) {\n  if (!h || typeof h !== 'object') continue;\n  const date = (h.date_collecte || '').toString().trim();\n  if (!date || date === d.dateCollecte) continue;\n  if (!parDate.has(date)) parDate.set(date, new Map());\n  parDate.get(date).set(cle(h), h);\n}\nconst dates = Array.from(parDate.keys()).sort();\nconst semainePrecedente = dates.length ? dates[dates.length - 1] : null;\nconst precedent = semainePrecedente ? parDate.get(semainePrecedente) : new Map();\n\nconst courantMap = new Map();\nfor (const p of d.produits || []) courantMap.set(cle(p), p);\n\nconst nouveaux = [];\nconst disparus = [];\nconst changements = [];\nconst nouvellesPromos = [];\nconst promosTerminees = [];\n\nfor (const [k, p] of courantMap) {\n  const libelle = p.nomProduit || p.reference || '(sans nom)';\n  if (!precedent.has(k)) { nouveaux.push(libelle); continue; }\n  const old = precedent.get(k);\n  const prixAvant = typeof old.prix_actuel === 'number' ? old.prix_actuel : null;\n  const prixApres = typeof p.prixActuel === 'number' ? p.prixActuel : null;\n  if (prixAvant !== null && prixApres !== null && prixAvant > 0 && prixApres !== prixAvant) {\n    changements.push({\n      produit: libelle,\n      ancienPrix: prixAvant,\n      nouveauPrix: prixApres,\n      variationPourcent: Math.round(((prixApres - prixAvant) / prixAvant) * 1000) / 10\n    });\n  }\n  const promoAvant = old.en_promotion === true;\n  const promoApres = p.enPromotion === true;\n  if (promoApres && !promoAvant) nouvellesPromos.push(libelle);\n  if (!promoApres && promoAvant) promosTerminees.push(libelle);\n}\n\nfor (const [k, h] of precedent) {\n  if (!courantMap.has(k)) disparus.push(h.nom_produit || h.reference || '(sans nom)');\n}\n\nreturn [{ json: {\n  dateCollecte: d.dateCollecte, enseigne: d.enseigne, statut: d.statut,\n  produits: d.produits, pagesOk: d.pagesOk, pagesEchouees: d.pagesEchouees,\n  pagesSansExtraction: d.pagesSansExtraction, erreurs: d.erreurs,\n  doublonsRetires: d.doublonsRetires,\n  semainePrecedente: semainePrecedente, nbCollectesHistoriques: dates.length,\n  nouveaux: nouveaux, disparus: disparus, changements: changements,\n  nouvellesPromos: nouvellesPromos, promosTerminees: promosTerminees\n} }];"
    },
    position: [1344, -64],
    executeOnce: true
  }
});

const statistiques_par_marque = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Statistiques par marque',
    notes: 'Section 5 de la spec: nombre de produits, produits en promotion, reduction moyenne et reduction maximum. Ajoute le taux de promotion et le prix moyen demandes par le tableau de la section 10. Une statistique sans donnee source reste nulle, elle n est pas estimee.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $('Comparer avec la semaine precedente').first().json;\n\nconst regroupement = new Map();\nfor (const p of d.produits || []) {\n  const marque = (p.marque || '').toString().trim() || 'Marque inconnue';\n  if (!regroupement.has(marque)) regroupement.set(marque, { produits: 0, promos: 0, reductions: [], prix: [] });\n  const s = regroupement.get(marque);\n  s.produits += 1;\n  if (p.enPromotion === true) s.promos += 1;\n  if (typeof p.reduction === 'number') s.reductions.push(p.reduction);\n  if (typeof p.prixActuel === 'number') s.prix.push(p.prixActuel);\n}\n\nfunction moyenne(liste) {\n  return liste.length ? Math.round((liste.reduce((a, b) => a + b, 0) / liste.length) * 10) / 10 : null;\n}\n\nconst stats = [];\nfor (const [marque, s] of regroupement) {\n  stats.push({\n    marque: marque,\n    produits: s.produits,\n    promotions: s.promos,\n    tauxPromo: s.produits ? Math.round((s.promos / s.produits) * 1000) / 10 : null,\n    reductionMoyenne: moyenne(s.reductions),\n    reductionMax: s.reductions.length ? Math.max.apply(null, s.reductions) : null,\n    prixMoyen: moyenne(s.prix)\n  });\n}\nstats.sort((a, b) => b.produits - a.produits || a.marque.localeCompare(b.marque));\n\nreturn [{ json: {\n  dateCollecte: d.dateCollecte, enseigne: d.enseigne, statut: d.statut,\n  pagesOk: d.pagesOk, pagesEchouees: d.pagesEchouees, pagesSansExtraction: d.pagesSansExtraction,\n  erreurs: d.erreurs, doublonsRetires: d.doublonsRetires,\n  totalProduits: (d.produits || []).length,\n  stats: stats, semainePrecedente: d.semainePrecedente,\n  nbCollectesHistoriques: d.nbCollectesHistoriques,\n  nouveaux: d.nouveaux, disparus: d.disparus, changements: d.changements,\n  nouvellesPromos: d.nouvellesPromos, promosTerminees: d.promosTerminees\n} }];"
    },
    position: [1568, -64],
    executeOnce: true
  }
});

const analyse_IA = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 1.3,
  config: {
    name: 'Analyse IA',
    notes: 'Regle 6 de la spec: l IA analyse les donnees mais ne les invente pas. Le prompt impose de ne citer que des chiffres presents dans le JSON et d ecrire explicitement "donnee non disponible" sinon.',
    notesInFlow: true,
    parameters: {
      modelId: { __rl: true, mode: 'list', value: 'gpt-4o-mini' },
      messages: {
        values: [
          {
            role: 'system',
            content: 'Tu es analyste de veille concurrentielle pour des refrigerateurs en France. Regles absolues : 1) tu n inventes AUCUN chiffre, AUCUNE marque et AUCUN produit qui ne figure pas dans les donnees fournies ; 2) si une information manque, tu ecris exactement "donnee non disponible" ; 3) tu ne fais aucune supposition sur l evolution des prix ; 4) tu reponds en francais, de facon concise et factuelle, en 4 a 6 phrases ; 5) tu ne commentes que les donnees presentes.'
          },
          {
            role: 'user',
            content: expr('Statistiques par marque de la semaine : {{ JSON.stringify($json.stats) }}. Comparaison avec la collecte precedente du {{ $json.semainePrecedente || "aucune" }} : {{ JSON.stringify({ nouveaux: $json.nouveaux, disparus: $json.disparus, changements: $json.changements, nouvellesPromos: $json.nouvellesPromos, promosTerminees: $json.promosTerminees }) }}. Statut de la collecte : {{ $json.statut }}. Total produits : {{ $json.totalProduits }}. Redige l analyse en te basant strictement sur ces donnees.')
          }
        ]
      },
      options: {}
    },
    credentials: { openAiApi: newCredential('OpenAI account') },
    position: [1792, -160]
  }
});

const construire_le_mail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Construire le mail',
    notes: 'Produit le HTML du message selon la section 10 de la spec: resume, tableau des statistiques par marque, analyse IA et alertes. Reference explicite au noeud Analyse IA car celui-ci renvoie la reponse du modele et non les donnees collectees.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $('Statistiques par marque').first().json;\n\nfunction echapper(v) { return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }\nfunction cell(v, suffixe) { return (v === null || v === undefined || v === '') ? '-' : echapper(v) + (suffixe || ''); }\n\nconst lignesHtml = (d.stats || []).map((s) =>\n  '<tr><td style=\"padding:6px 10px;border:1px solid #ddd\"><strong>' + echapper(s.marque) + '</strong></td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + s.produits + '</td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + s.promotions + '</td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + cell(s.tauxPromo, ' %') + '</td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + cell(s.reductionMoyenne, ' %') + '</td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + cell(s.reductionMax, ' %') + '</td>' +\n  '<td style=\"padding:6px 10px;border:1px solid #ddd;text-align:right\">' + cell(s.prixMoyen, ' EUR') + '</td></tr>'\n).join('');\n\nconst alertes = [];\nif (d.statut === 'Collecte partielle') {\n  alertes.push('Collecte partielle : ' + (d.pagesEchouees || 0) + ' page(s) en echec sur ' + ((d.pagesOk || 0) + (d.pagesEchouees || 0)) + '. Les chiffres ci-dessous sont incomplets et ne doivent pas etre lus comme une collecte complete.');\n}\nif (d.pagesSansExtraction > 0) {\n  alertes.push(d.pagesSansExtraction + ' page(s) recuperee(s) sans extraction de donnees structurées.');\n}\nif (d.doublonsRetires > 0) alertes.push(d.doublonsRetires + ' doublon(s) retire(s) lors de la deduplication.');\nif (!d.semainePrecedente) {\n  alertes.push('Aucune collecte precedente trouvee : la comparaison hebdomadaire sera disponible a partir de la semaine prochaine.');\n} else {\n  alertes.push('Comparaison effectuee avec la collecte du ' + d.semainePrecedente + ' (' + d.nbCollectesHistoriques + ' collecte(s) dans l historique).');\n}\nif (d.erreurs && d.erreurs.length) alertes.push('Erreurs rencontrees : ' + d.erreurs.slice(0, 5).join(' | '));\n\nconst reponseIA = $('Analyse IA').first().json;\nconst texteAnalyse = ((reponseIA && (reponseIA.content || (reponseIA.message && reponseIA.message.content))) || 'Analyse indisponible.').toString().trim();\n\nconst html = '<html><body style=\"font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px\">' +\n'<h2 style=\"margin-bottom:4px\">Veille concurrentielle - Refrigerateurs</h2>' +\n'<p style=\"margin-top:0;color:#666\">Enseigne : ' + echapper(d.enseigne) + '</p>' +\n'<h3>Resume</h3>' +\n'<table cellpadding=\"4\" cellspacing=\"0\"><tr><td><strong>Date de collecte</strong></td><td>' + echapper(d.dateCollecte) + '</td></tr>' +\n'<tr><td><strong>Enseigne</strong></td><td>' + echapper(d.enseigne) + '</td></tr>' +\n'<tr><td><strong>Nombre de produits</strong></td><td>' + d.totalProduits + '</td></tr>' +\n'<tr><td><strong>Statut de la collecte</strong></td><td>' + echapper(d.statut) + '</td></tr></table>' +\n'<h3>Statistiques par marque</h3>' +\n'<table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse\">' +\n'<tr style=\"background:#f0f0f0\"><th style=\"padding:6px 10px;border:1px solid #ddd;text-align:left\">Marque</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Produits</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Promotions</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Taux promo</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Reduction moyenne</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Reduction max</th>' +\n'<th style=\"padding:6px 10px;border:1px solid #ddd\">Prix moyen</th></tr>' +\n(lignesHtml || '<tr><td colspan=\"7\" style=\"padding:8px\">Aucune donnee.</td></tr>') + '</table>' +\n'<h3>Analyse</h3><p>' + echapper(texteAnalyse).replace(/\\n/g, '<br>') + '</p>' +\n'<h3>Alertes</h3><ul>' + alertes.map((a) => '<li>' + echapper(a) + '</li>').join('') + '</ul>' +\n'<p style=\"color:#999;font-size:12px\">Genere automatiquement. Les informations absentes des sources restent vides et ne sont jamais estimees.</p>' +\n'</body></html>';\n\nreturn [{ json: { ...d, html: html, sujet: 'Veille refrigerateurs - ' + d.enseigne + ' - ' + d.statut + ' - ' + d.totalProduits + ' produits' } }];"
    },
    position: [2016, -64],
    executeOnce: true
  }
});

const envoyer_le_rapport = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Envoyer le rapport par e-mail',
    parameters: {
      sendTo: 'lmarzouq@eugeniaschool.com',
      subject: expr('{{ $json.sujet }}'),
      message: expr('{{ $json.html }}'),
      options: {}
    },
    credentials: { gmailOAuth2: newCredential('Gmail account', '5njRrGfhRROcnBe4') },
    position: [2240, -64],
    webhookId: 'a3f1c2d4-7b6e-4c1a-9e5f-2d8b4c6a1f30'
  }
});

const preparer_les_lignes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer les lignes',
    notes: 'Une ligne par produit pour la Data Table. Cette branche est independante de l analyse IA : si l IA echoue, la collecte reste enregistree.',
    notesInFlow: true,
    parameters: {
      jsCode: "const d = $('Comparer avec la semaine precedente').first().json;\nconst lignes = [];\nfor (const p of d.produits || []) {\n  lignes.push({ json: {\n    date_collecte: d.dateCollecte, enseigne: d.enseigne, marque: p.marque,\n    nom_produit: p.nomProduit, reference: p.reference, prix_actuel: p.prixActuel,\n    ancien_prix: p.ancienPrix, reduction: p.reduction, en_promotion: p.enPromotion,\n    url: p.url, statut_collecte: d.statut\n  } });\n}\nreturn lignes;"
    },
    position: [1568, 160]
  }
});

const enregistrer_la_collecte = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Enregistrer la collecte (Data Table)',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'veille_refrigerateurs' },
      columns: COLONNES,
      options: { optimizeBulk: true }
    },
    position: [1792, 160]
  }
});

const wf = workflow('8QQQfNSaGsFkLOXc', 'Veille concurrentielle - Refrigerateurs Boulanger', { executionOrder: 'v1', availableInMCP: true, binaryMode: 'separate' });

export default wf
  .add(chaque_lundi_06_00)
  .to(collecter_les_refrigerateurs)
  .to(normaliser_et_controler)
  .to(supprimer_les_doublons)
  .to(la_collecte_est_elle_exploitable
    .onTrue(lire_l_historique
      .to(comparer_avec_la_semaine_precedente
        .to([
          statistiques_par_marque
            .to(analyse_IA
              .to(construire_le_mail
                .to(envoyer_le_rapport))),
          preparer_les_lignes
            .to(enregistrer_la_collecte)
        ])))
    .onFalse(enregistrer_les_erreurs
      .to(enregistrer_echec_dans_la_base)))
  .add(declenchement_manuel.to(collecter_les_refrigerateurs));
