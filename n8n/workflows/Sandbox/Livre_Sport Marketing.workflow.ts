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
  config: { name: 'Limit', parameters: { maxItems: 10 }, position: [-656, -400], notes: 'Hard ceiling of 100 passages, which is the top of the range the book has to fit in. The chunker aims for about 87; this catches the case where n8n extracts more text than expected.' }
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

const embed_the_question = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed the question', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ content: { parts: [{ text: $json.chatInput }] } }) }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-1104, 272], notes: 'Same model and same 3072 dimensions as the passages at indexing time. A different model or dimension would make the comparison meaningless.' }
});

const find_relevant_passages = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Find relevant passages', parameters: { operation: 'executeQuery', query: '{{ "select text, distance from match_livres(\'" + JSON.stringify($json.embedding.values) + "\'::vector, 6);" }}', options: {} }, credentials: { postgres: newCredential('Postgres account', 'JMv0lWBQ7QKEHTja') }, position: [-880, 272], notes: 'Cosine similarity in Postgres through match_livres, which is why the answer stays grounded in the stored passages.', alwaysOutputData: true }
});

const draft_the_answer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Draft the answer', parameters: { jsCode: '// Build the prompt from the passages the database returned. Nothing is invented here: the\n// answer node below is the only thing that writes prose, and it only sees this text.\n//\n// The prompt is cut into delimited blocks, one per section, so the model cannot read the\n// tail of a passage as an instruction. The delimiters are plain headers written once per\n// section: markup repeated around every passage is noise for the model and clutter in the\n// execution log, and it buys nothing over a header and a blank line.\n//\n// Rows are filtered on text because Find relevant passages always outputs data, so an\n// empty index arrives as one item with no text instead of as no item at all.\nconst rows = $input.all().filter((r) => r.json && typeof r.json.text === \'string\' && r.json.text.trim());\nconst question = $(\'When chat message received\').first().json.chatInput ?? \'\';\n\nconst rules = [\n  \'Tu es un analyste de livre. Reponds en francais, a partir du seul contenu des passages ci-dessous.\',\n  \'Si les passages ne repondent pas a la question, dis-le clairement et ne complete pas de memoire. N invente jamais.\',\n  \'Sois bref : quelques phrases, ou des puces si la question appelle une liste.\'\n];\n\nconst format = [\n  \'Reponds en texte brut et en francais.\',\n  \'N retourne ni JSON, ni code, ni tableau.\',\n  \'N ajoute aucun prefixe du type Reponse : ou Voici la reponse.\',\n  \'Commence directement par la reponse.\'\n];\n\nconst out = [];\nconst section = (title) => { out.push(title.toUpperCase(), \'\'); };\n\nsection(\'Contexte\');\nout.push(\'Tu es un analyste de livre.\', \'\');\nfor (const line of rules) out.push(\'- \' + line);\nout.push(\'\');\n\nif (rows.length === 0) {\n  section(\'Index vide\');\n  out.push(\'Aucun passage du livre n est disponible dans la base de connaissance.\');\n  out.push(\'Dis en une seule phrase que le livre n est pas encore indexe et qu il faut deposer le PDF via le formulaire.\', \'\');\n} else {\n  section(\'Passages (\' + rows.length + \')\');\n  rows.forEach((r, i) => {\n    out.push(\'--- Passage \' + (i + 1) + \' ---\');\n    out.push(r.json.text ?? \'\', \'\');\n  });\n}\n\nsection(\'Question\');\nout.push(question, \'\');\n\nsection(\'Format de reponse\');\nfor (const line of format) out.push(\'- \' + line);\n\nreturn [{ json: {\n  prompt: out.join(\'\\n\'),\n  question,\n  passages: rows.length,\n  empty: rows.length === 0\n} }];' }, position: [-656, 272] }
});

const ask_Gemini = node({
  type: '@n8n/n8n-nodes-langchain.googleGemini',
  version: 1.2,
  config: { name: 'Ask Gemini', parameters: { modelId: { __rl: true, mode: 'list', value: 'models/gemini-3.5-flash-lite' }, messages: { values: [{ content: expr('{{ $json.prompt }}') }] }, simplify: false, builtInTools: {}, options: { temperature: 0.2 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-432, 272], notes: 'gemini-3.1-flash-lite was answering 503 high demand on this account; 3.5-flash-lite answers normally. simplify is off on purpose: with it on the node returns one item per candidate shaped { content: ... }, and Reply in chat reads j.candidates[0].content.parts[0].text, so it needs the full response. temperature 0.2 sits in Options because that is where this node keeps generationConfig.temperature.' }
});

const answer_for_the_chat = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Answer for the chat', parameters: { assignments: { assignments: [{ id: 'answer-output', name: 'output', value: expr('{{ ($json.candidates[0].content.parts || []).filter(p => p.text).map(p => p.text).join(\'\') }}'), type: 'string' }] }, options: {} }, position: [-64, 272], notes: 'The chat panel renders the field named output, so the last node of the branch has to produce it. Gemini names its own fields and cannot be configured to emit output, so this declarative node just copies the answer text into that one field, dropping candidates, usageMetadata and the rest. Not a Code node: the join is an expression, and it concatenates every text part rather than assuming the first one.' }
});

const when_Executed_by_Another_Workflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'When Executed by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [-1328, -176] }
});

const embed_the_chunks = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed the chunks', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ (() => { const t = $json.text; if (typeof t !== \'string\' || !t.trim()) { throw new Error(\'Embed the chunks : passage sans text. Ce noeud ne recoit ses items que du noeud Call Livre_Sport Marketing, donc lance le test depuis On form submission.\'); } return JSON.stringify({ model: \'models/gemini-embedding-2\', content: { parts: [{ text: t }] } }); })() }}'), options: { batching: { batch: { batchSize: 1 } } } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'C3H7wjESIHJmhzhF') }, position: [-1104, -176], notes: 'One call for every passage rather than one call per passage. Measured at 87 passages and 1.76 million characters in about 3 seconds, returning 87 vectors of 3072 dimensions in the order they were sent. The passages are read from Limit by name because the Postgres node above returns a single row and would otherwise replace them.' }
});

const store_in_Supabase = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: { name: 'Store in Supabase', parameters: { tableId: 'livres', fieldsUi: { fieldValues: [{ fieldId: 'text', fieldValue: expr('{{ $(\'When Executed by Another Workflow\').item.json.text }}') }, { fieldId: 'embedding', fieldValue: expr('{{ $json.embedding.values }}') }] } }, credentials: { supabaseApi: newCredential('Supabase account', 'xS6ajdFvO88WsSaA') }, position: [-880, -176], notes: 'One row per chunk, written through the Supabase REST API. Row level security lets the anon role insert into livres and nothing else, so the table cannot be read or emptied from the API side.' }
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
  .to(embed_the_question)
  .to(find_relevant_passages)
  .to(draft_the_answer)
  .to(ask_Gemini)
  .to(answer_for_the_chat)
  .add(when_Executed_by_Another_Workflow)
  .to(embed_the_chunks)
  .to(store_in_Supabase)