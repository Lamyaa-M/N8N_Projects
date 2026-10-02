const on_form_submission = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'On form submission', parameters: { formTitle: 'Analyse de livre', formDescription: 'Depose le PDF du livre a indexer (50 Mo maximum). Utilisez le fichier compresse, pas l original scanne : l original de 57 Mo est refuse par le formulaire. Un livre de 500 pages demande quelques minutes avant la confirmation.', formFields: { values: [{ fieldLabel: 'Livre (PDF)', fieldType: 'file', fieldName: 'data', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }, { fieldLabel: 'Titre du livre', fieldName: 'titre', placeholder: 'ex. Sport Marketing - Windy Dees' }] }, responseMode: 'lastNode', options: { buttonLabel: 'Indexer le livre' } }, position: [-1328, -400], webhookId: 'd791558e-ba66-498b-b7ba-6b24ecbb8bb7' }
});

const extract_from_File = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extract from File', parameters: { operation: 'pdf', options: {} }, position: [-1104, -400] }
});

const chunking = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Chunking', parameters: { jsCode: '// n8n Code node\n// Mode : Run Once for All Items\n\nconst CHUNK_SIZE = 800;     // taille approximative en tokens\nconst CHUNK_OVERLAP = 150;  // overlap approximatif\n\nfunction estimateTokens(text) {\n  return Math.ceil(text.length / 4);\n}\n\nfunction cleanText(text) {\n  return text\n    .replace(/\\r\\n/g, "\\n")\n    .replace(/[ \\t]+/g, " ")\n    .replace(/\\n{3,}/g, "\\n\\n")\n    // Réassemble les mots coupés en fin de ligne\n    .replace(/(\\w)-\\n(\\w)/g, "$1$2")\n    .trim();\n}\n\nfunction splitIntoWords(text) {\n  return text.split(/\\s+/).filter(Boolean);\n}\n\nfunction chunkText(text) {\n  const words = splitIntoWords(text);\n\n  const chunks = [];\n  let currentWords = [];\n\n  // Conversion approximative tokens -> mots\n  const maxWords = Math.floor(CHUNK_SIZE / 1.3);\n  const overlapWords = Math.floor(CHUNK_OVERLAP / 1.3);\n\n  let start = 0;\n\n  while (start < words.length) {\n    const end = Math.min(start + maxWords, words.length);\n\n    const chunkWords = words.slice(start, end);\n\n    chunks.push(chunkWords.join(" "));\n\n    if (end >= words.length) {\n      break;\n    }\n\n    start = end - overlapWords;\n\n    if (start < 0) {\n      start = 0;\n    }\n  }\n\n  return chunks;\n}\n\n// --------------------------------------------------\n// Récupération du texte depuis l\'input n8n\n// --------------------------------------------------\n\nconst input = $input.all();\n\nconst results = [];\n\nfor (const item of input) {\n\n  // Adapte ici selon la structure de ton JSON\n  const fullText =\n    item.json.text ||\n    item.json.content ||\n    item.json.data ||\n    "";\n\n  if (!fullText) {\n    continue;\n  }\n\n  // ------------------------------------------------\n  // Détection des pages :\n  // [Source page 1]\n  // [Source page 2]\n  // etc.\n  // ------------------------------------------------\n\n  const pageRegex = /\\[Source page\\s+(\\d+)\\]/g;\n\n  const pages = [];\n\n  let match;\n  let lastIndex = 0;\n  let currentPage = null;\n\n  while ((match = pageRegex.exec(fullText)) !== null) {\n\n    if (currentPage !== null) {\n      const pageText = fullText\n        .slice(lastIndex, match.index)\n        .trim();\n\n      pages.push({\n        page: currentPage,\n        text: pageText\n      });\n    }\n\n    currentPage = Number(match[1]);\n    lastIndex = pageRegex.lastIndex;\n  }\n\n  // Dernière page\n  if (currentPage !== null) {\n    pages.push({\n      page: currentPage,\n      text: fullText.slice(lastIndex).trim()\n    });\n  }\n\n  // Si aucune page n\'est détectée\n  if (pages.length === 0) {\n    pages.push({\n      page: null,\n      text: fullText\n    });\n  }\n\n  // ------------------------------------------------\n  // Chunking\n  // ------------------------------------------------\n\n  for (const page of pages) {\n\n    const cleaned = cleanText(page.text);\n\n    if (!cleaned) {\n      continue;\n    }\n\n    const chunks = chunkText(cleaned);\n\n    chunks.forEach((chunk, index) => {\n\n      results.push({\n        json: {\n          text: chunk,\n\n          metadata: {\n            source_page: page.page,\n            chunk_index: index,\n            estimated_tokens: estimateTokens(chunk),\n            document: "Sport Marketing - Fifth Edition"\n          }\n        }\n      });\n\n    });\n  }\n}\n\nreturn results;' }, position: [-880, -400] }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 4 }, position: [-656, -400], notes: 'Hard ceiling of 100 passages, which is the top of the range the book has to fit in. The chunker aims for about 87; this catches the case where n8n extracts more text than expected.' }
});

const call_Livre_Sport_Marketing = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Call \'Livre_Sport Marketing\'', parameters: { workflowId: { __rl: true, value: 'WBdTgHm5xuhZqWrF', mode: 'list', cachedResultUrl: '/workflow/WBdTgHm5xuhZqWrF', cachedResultName: 'Livre_Sport Marketing' }, workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true }, options: {} }, position: [-432, -400] }
});

const clear_previous_book = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Clear previous book', parameters: { operation: 'executeQuery', query: 'delete from livres;\ndelete from n8n_vector_collections;\nselect 1 as cleared;', options: {} }, credentials: { postgres: newCredential('Postgres account', 'JMv0lWBQ7QKEHTja') }, position: [-1328, 48], notes: 'Empties the collection so the new book is the only content in it. It sits between the passages and the embedding rather than next to the insert: a Postgres node returns its query result and throws away the items it received, so anywhere earlier or later in this chain it would either erase the passages or leave the insert with nothing to write.', executeOnce: true }
});

const when_chat_message_received = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.5,
  config: { name: 'When chat message received', parameters: { options: {} }, position: [-1328, 272], webhookId: '8994efa2-5ccd-4eb6-91b0-5af0d082686b' }
});

const read_the_question = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read the question', parameters: { jsCode: '// Both triggers land here. The chat trigger carries chatInput, the Execute Workflow\n// trigger carries the question workflow 1 passed. Reading the item rather than a named\n// trigger is what lets one chain serve both entries.\nconst j = $input.first().json ?? {};\nconst question = j.question ?? j.chatInput ?? \'\';\nif (!String(question).trim()) {\n  throw new Error(\'No question arrived. Expected question from the Execute Workflow call, or chatInput from the chat panel.\');\n}\nreturn [{ json: { question: String(question) } }];' }, position: [-1104, 272] }
});

const embed_the_question = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed the question', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ content: { parts: [{ text: $json.question }] } }) }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-880, 272], notes: 'Same model and same 3072 dimensions as the passages at indexing time. A different model or dimension would make the comparison meaningless.' }
});

const build_the_search = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build the search', parameters: { jsCode: '// Turns the question vector into a SQL call to match_livres. The literal is built here\n// rather than inline in the Postgres node so the 3072 numbers are quoted exactly once.\n// The HTTP node returns the raw Gemini body, so the vector sits at embedding.values;\n// the fallback keeps it working if that node is ever set to output a bare array.\nconst all = $input.all().map(i => i.json);\nconst j = all.find(x => x && x.embedding) || all[0] || {};\nconst vec = j.embedding && Array.isArray(j.embedding.values) ? j.embedding.values : j.embedding;\nif (!Array.isArray(vec)) {\n  throw new Error(\'No embedding found on the question item. Expected embedding.values from the Gemini call, got keys: \' + Object.keys(j).join(\', \'));\n}\nconst limit = 6;\nreturn [{ json: { sql: "select text, distance from match_livres(\'" + JSON.stringify(vec) + "\'::vector, " + limit + ");" } }];' }, position: [-656, 272] }
});

const find_relevant_passages = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Find relevant passages', parameters: { operation: 'executeQuery', query: '{{ $json.sql }}', options: {} }, credentials: { postgres: newCredential('Postgres account', 'JMv0lWBQ7QKEHTja') }, position: [-432, 272], notes: 'Cosine similarity in Postgres through match_livres, which is why the answer stays grounded in the stored passages.' }
});

const draft_the_answer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Draft the answer', parameters: { jsCode: '// Build the prompt from the passages the database returned. Nothing is invented here: the\n// answer node below is the only thing that writes prose, and it only sees this text.\nconst rows = $input.all();\nconst question = $(\'Read the question\').first().json.question ?? \'\';\nconst rules = [\n  \'Tu es un analyste de livre. Reponds en francais, a partir du seul contenu des passages ci-dessous.\',\n  \'Si les passages ne repondent pas a la question, dis-le clairement et ne complete pas de memoire. N invente jamais.\',\n  \'Sois bref : quelques phrases, ou des puces si la question appelle une liste.\'\n];\nif (rows.length === 0) {\n  // Nothing matched. Say so through the same answering node rather than calling the model\n  // with an empty prompt, so there is one path for every answer the chat panel shows.\n  return [{ json: {\n    question,\n    passages: 0,\n    empty: true,\n    prompt: [\n      rules[0],\n      \'La base de connaissance est vide : aucun passage du livre n est disponible.\',\n      \'Reponds en une phrase que le livre n est pas encore indexe et qu il faut deposer le PDF via le formulaire.\',\n      \'\',\n      \'QUESTION : \' + question\n    ].join(\'\\n\')\n  } }];\n}\nconst context = rows.map((r, i) => \'Passage \' + (i + 1) + \':\\n\' + (r.json.text ?? \'\')).join(\'\\n\\n\');\nconst prompt = [\n  ...rules,\n  \'\',\n  \'PASSAGES :\',\n  context,\n  \'\',\n  \'QUESTION : \' + question\n].join(\'\\n\');\nreturn [{ json: { prompt, question, passages: rows.length, empty: false } }];' }, position: [-208, 272] }
});

const ask_Gemini = node({
  type: '@n8n/n8n-nodes-langchain.googleGemini',
  version: 1.2,
  config: { name: 'Ask Gemini', parameters: { modelId: { __rl: true, mode: 'id', value: 'models/gemini-3.5-flash-lite' }, messages: { values: [{ content: expr('{{ $json.prompt }}') }] }, simplify: false, builtInTools: {}, options: { temperature: 0.2 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-48, 272], notes: 'gemini-3.1-flash-lite was answering 503 high demand on this account; 3.5-flash-lite answers normally. simplify is off on purpose: with it on the node returns one item per candidate shaped { content: ... }, and Reply in chat reads j.candidates[0].content.parts[0].text, so it needs the full response. temperature 0.2 sits in Options because that is where this node keeps generationConfig.temperature.' }
});

const reply_in_chat = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Reply in chat', parameters: { jsCode: '// The chat panel renders this node, so hand it plain text and nothing else.\nconst j = $input.first().json;\nconst text = j.candidates && j.candidates[0] && j.candidates[0].content &&\n  j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;\nif (!text) {\n  throw new Error(\'Gemini returned no text. Raw response: \' + JSON.stringify(j).slice(0, 300));\n}\nreturn [{ json: { output: text } }];' }, position: [240, 272] }
});

const when_Executed_by_Another_Workflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'When Executed by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [-1328, -176] }
});

const embed_the_chunks = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed the chunks', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ (() => { const items = $input.all(); const bad = items.findIndex(i => typeof (i.json && i.json.text) !== \'string\' || !i.json.text.trim()); if (items.length === 0 || bad >= 0) { throw new Error(\'Embed the chunks : aucun passage exploitable. \' + items.length + \' item(s) recu(s), premier item sans text en position \' + bad + \'. Ce noeud ne recoit ses items que du noeud Call Livre_Sport Marketing, donc lance le test depuis On form submission.\'); } return JSON.stringify({ requests: items.map(i => ({ model: \'models/gemini-embedding-2\', content: { parts: [{ text: i.json.text }] } })) }); })() }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-1104, -176], notes: 'One call for every passage rather than one call per passage. Measured at 87 passages and 1.76 million characters in about 3 seconds, returning 87 vectors of 3072 dimensions in the order they were sent. The passages are read from Limit by name because the Postgres node above returns a single row and would otherwise replace them.' }
});

const pair_texts_and_vectors = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Pair texts and vectors', parameters: { jsCode: '// The batch call returns one array of embeddings, in the order the passages were sent.\n// Zip it back onto the passages so every row carries its own text with its own vector.\n// The passages are read from the trigger by name: this runs inside the execution started by\n// Call Livre_Sport Marketing, so $input is the Gemini response, not the passages.\nconst items = $input.first().json.embeddings;\nif (!Array.isArray(items)) {\n  throw new Error(\'The embedding call did not return an embeddings array. Keys on the item: \' + Object.keys($input.first().json).join(\', \'));\n}\nconst texts = $(\'When Executed by Another Workflow\').all();\nif (items.length !== texts.length) {\n  throw new Error(\'Gemini returned \' + items.length + \' embeddings for \' + texts.length + \' passages. They must line up.\');\n}\nconst dims = items[0].values.length;\nreturn texts.map((t, i) => ({\n  json: { text: t.json.text, embedding: items[i].values, dims }\n}));' }, position: [-944, -176], notes: 'Zips the returned embeddings back onto the passages, one item per row, each carrying its own text and its own vector. Without it Store in Supabase receives the raw Gemini body, a single item holding an embeddings array, so text and embedding would both be undefined and the embedding column is NOT NULL. Fails loudly if the two counts disagree, which is the only way this pairing can go wrong.' }
});

const store_in_Supabase = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: { name: 'Store in Supabase', parameters: { tableId: 'livres', fieldsUi: { fieldValues: [{ fieldId: 'text', fieldValue: expr('{{ $json.text }}') }, { fieldId: 'embedding', fieldValue: expr('{{ $json.embedding }}') }] } }, credentials: { supabaseApi: newCredential('Supabase account', 'xS6ajdFvO88WsSaA') }, position: [-784, -176], notes: 'One row per chunk, written through the Supabase REST API. Row level security lets the anon role insert into livres and nothing else, so the table cannot be read or emptied from the API side.' }
});

const wf = workflow('WBdTgHm5xuhZqWrF', 'Livre_Sport Marketing', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(on_form_submission)
  .to(extract_from_File)
  .to(chunking)
  .to(limit)
  .to(call_Livre_Sport_Marketing)
  .add(clear_previous_book)
  .add(when_chat_message_received)
  .to(read_the_question)
  .to(embed_the_question)
  .to(build_the_search)
  .to(find_relevant_passages)
  .to(draft_the_answer)
  .to(ask_Gemini)
  .to(reply_in_chat)
  .add(when_Executed_by_Another_Workflow)
  .to(embed_the_chunks)
  .to(pair_texts_and_vectors)
  .to(store_in_Supabase)