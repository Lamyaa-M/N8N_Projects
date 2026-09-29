const when_clicking_Execute_workflow = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'When clicking \u2018Execute workflow\u2019' }
});

const hTTP_Request1 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'HTTP Request1', parameters: { url: 'https://dummyjson.com/carts', options: {} }, position: [0, 208] }
});

const code_in_JavaScript1 = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Code in JavaScript1', parameters: { jsCode: 'const carts = $input.first().json.carts;\n\nconst result = [];\n\nfor (const cart of carts) {\n  for (const product of cart.products) {\n    result.push({\n      json: {\n        productId: product.id,\n        quantity: product.quantity,\n        cartId: cart.id\n      }\n    });\n  }\n}\n\nreturn result;' }, position: [224, 208] }
});

const code_in_JavaScript2 = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Code in JavaScript2', parameters: { jsCode: 'const items = $input.all();\n\nconst counts = {};\n\nfor (const item of items) {\n  const productId = item.json.productId;\n  const cartId = item.json.cartId;\n\n  if (!counts[productId]) {\n    counts[productId] = new Set();\n  }\n\n  counts[productId].add(cartId);\n}\n\nreturn Object.entries(counts).map(([productId, cartIds]) => ({\n  json: {\n    id: Number(productId),\n    cartCount: cartIds.size\n  }\n}));' }, position: [448, 208] }
});

const merge_node = merge({
  version: 3.2,
  config: { name: 'Merge', parameters: { mode: 'combineBySql', query: 'SELECT *\nFROM input1\nLEFT JOIN input2\nON input1.id = input2.id', options: {} }, position: [784, 240] }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 100 }, position: [1120, 0] }
});

const hTTP_Request = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'HTTP Request', parameters: { url: 'https://dummyjson.com/products?limit=0', options: {} }, position: [224, 0] }
});

const code_in_JavaScript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Code in JavaScript', parameters: { jsCode: 'const products = $input.first().json.products;\n\nreturn products.map(product => ({\n  json: {\n    id: Number(product.id),\n    idType: typeof Number(product.id),\n    title: product.title,\n    price: Number(product.price)\n  }\n}));' }, position: [448, 0] }
});

const edit_Fields = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Edit Fields', parameters: { mode: 'raw', jsonOutput: expr('{\n  "id": "{{ Number($json.id) }}",\n  "Product Name": "{{$json.title}}",\n  "Price": "{{ $json.price }}",\n  "DiscountPercentage%": "{{$json.discountPercentage}}",\n  "Brand": "{{$json.brand}}",\n  "Category": "{{$json.category}}",\n  "Stock": "{{$json.stock}}"\n}'), options: {} }, position: [672, 0] }
});

const filter = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: { name: 'Filter', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: '52387424-4d4f-4b15-9eef-be8c80531719', leftValue: expr('{{ $json.Price.toNumber() }}'), rightValue: 2, operator: { type: 'number', operation: 'gt' } }, { id: 'df8c8fdc-3483-4699-aa51-8f21f9101d59', leftValue: expr('{{ $json.id.toNumber() }}'), rightValue: '', operator: { type: 'number', operation: 'notEmpty', singleValue: true } }], combinator: 'and' }, options: {} }, position: [896, 0] }
});

const wf = workflow('cRbJwqO7Tgpys43G', 'Exercice 1', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(when_clicking_Execute_workflow
  .to([
    hTTP_Request1
    .to(code_in_JavaScript1)
    .to(code_in_JavaScript2),
    hTTP_Request
    .to(code_in_JavaScript)
    .to(edit_Fields)
    .to(filter)
    .to(limit)]))
  .add(code_in_JavaScript2.to(merge_node.input(1)))
  .add(limit.to(merge_node.input(0)))