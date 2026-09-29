const schedule_Trigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Schedule Trigger', parameters: { rule: { interval: [{}] } } }
});

const message_a_model = node({
  type: '@n8n/n8n-nodes-langchain.googleGemini',
  version: 1.2,
  config: { name: 'Message a model', parameters: { modelId: { __rl: true, value: 'models/gemini-3.1-flash-lite', mode: 'list', cachedResultName: 'models/gemini-3.1-flash-lite' }, messages: { values: [{ content: 'Tu es mon assistant personnel de veille quotidienne sur l\u2019intelligence artificielle.\n\nOBJECTIF\n\nChaque jour, analyse les informations et actualités IA disponibles et produis une synthèse courte, claire et intéressante. Cette synthèse sera envoyée directement par email.\n\nSUJETS À SURVEILLER\n\n- OpenAI / ChatGPT\n- Google / Gemini\n- Anthropic / Claude\n- Meta / Llama\n- Microsoft / Copilot\n- nouveaux modèles d\u2019IA\n- nouveaux benchmarks et performances\n- agents IA et automatisation\n- nouveaux outils et fonctionnalités IA\n- startups et entreprises spécialisées dans l\u2019IA\n- recherche et avancées technologiques\n- investissements, acquisitions et partenariats importants\n- réglementation ayant un impact important sur l\u2019IA\n\nSÉLECTION\n\nSélectionne les informations les plus intéressantes et utiles.\n\nÉvite :\n- les doublons\n- les informations trop anciennes\n- les informations insignifiantes\n- les contenus purement promotionnels\n- les rumeurs ou spéculations lorsqu\'elles ne présentent pas d\'intérêt particulier\n\nPRIORITÉ\n\nPrivilégie les informations les plus récentes disponibles, en particulier celles publiées au cours des dernières 24 heures.\n\nSi plusieurs informations parlent du même événement, regroupe-les en une seule actualité.\n\nNOMBRE D\u2019ACTUALITÉS\n\nPrésente entre 5 et 7 actualités maximum.\n\nFORMAT DE CHAQUE ACTUALITÉ\n\nPour chaque actualité, utilise cette structure :\n\n📰 TITRE\n\nRésumé :\nExplique l\'information en 2 ou 3 phrases simples.\n\n💡 Pourquoi c\'est important :\nExplique en 1 ou 2 phrases ce que cette information peut changer pour les utilisateurs, les développeurs ou les entreprises.\n\n🔗 Lien :\nAjoute le lien disponible dans les données fournies lorsque celui-ci existe.\n\nÀ LA FIN\n\nAjoute une section :\n\n🔥 LES 3 CHOSES À RETENIR\n\nPrésente les 3 informations les plus importantes de la journée sous forme de liste.\n\nRÈGLES\n\n- Réponds uniquement en français.\n- Sois clair, concis et facile à comprendre.\n- Ne répète pas les mêmes informations.\n- Ne crée pas de liens qui ne sont pas présents dans les données fournies.\n- Utilise uniquement les informations disponibles dans les données reçues.\n- Ne fais pas de longs paragraphes.\n- Utilise quelques emojis pour rendre l\'email agréable à lire.\n- Ne commence pas par "Bonjour".\n- Ne termine pas par une formule de politesse.\n- Le résultat doit être directement utilisable dans un email.\n\nIMPORTANT : FORMAT DE SORTIE\n\nLa réponse doit être UNIQUEMENT en HTML.\n\nN\'utilise pas de Markdown.\nN\'utilise pas de ```html.\nN\'ajoute aucune explication avant ou après le HTML.\n\nUtilise uniquement des balises HTML simples comme :\n<h1>, <h2>, <h3>, <p>, <strong>, <ul>, <li>, <a>.\n\nLe HTML doit être propre, lisible et adapté à un email.' }] }, builtInTools: { googleSearch: true }, options: {} }, position: [224, 0] }
});

const send_a_message = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Send a message', parameters: { sendTo: 'lmarzouq@eugeniaschool.com', subject: '🤖 La veille IA du jour', message: expr('{{ $json.content.parts[0].text }}'), options: {} }, credentials: { gmailOAuth2: newCredential('Gmail account', '5njRrGfhRROcnBe4') }, position: [592, 0], webhookId: '445c1720-20c3-48b0-b5a0-f509179b4c82' }
});

const wf = workflow('Jdgaro3JiDvw1Keb', 'WorkflowTest', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(schedule_Trigger)
  .to(message_a_model)
  .to(send_a_message)