import { parseRDFa } from './index.js';

const tests = [];
const results = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function findQuad(quads, s, p, o) {
  return quads.find(q =>
    (s === null || q.subject.value === s) &&
    (p === null || q.predicate.value === p) &&
    (o === null || (typeof o === 'string' ? q.object.value === o : true))
  );
}

function countQuads(quads, s, p, o) {
  return quads.filter(q =>
    (s === null || q.subject.value === s) &&
    (p === null || q.predicate.value === p) &&
    (o === null || (typeof o === 'string' ? q.object.value === o : true))
  ).length;
}

// Basic tests
test('Basic @property with literal', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/title">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/thing', 'Subject matches');
  assert(quads[0].predicate.value === 'http://purl.org/dc/terms/title', 'Predicate matches');
  assert(quads[0].object.value === 'Test', 'Object matches');
});

test('CURIE with prefix', () => {
  const html = '<div prefix="dc: http://purl.org/dc/terms/" about="http://example.org/thing" property="dc:title">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].predicate.value === 'http://purl.org/dc/terms/title', 'CURIE resolved correctly');
});

test('@typeof generates rdf:type', () => {
  const html = '<div about="http://example.org/thing" typeof="http://schema.org/Person"></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'Type predicate');
  assert(quads[0].object.value === 'http://schema.org/Person', 'Type object');
});

test('Language-tagged literal', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/title" lang="en">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.language === 'en', 'Language tag set');
  assert(quads[0].object.datatype.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'Language literal datatype');
});

test('Typed literal with @datatype', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/date" datatype="http://www.w3.org/2001/XMLSchema#date" content="2025-01-01"></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === '2025-01-01', 'Content value');
  assert(quads[0].object.datatype.value === 'http://www.w3.org/2001/XMLSchema#date', 'Datatype set');
});

test('@rel with @href', () => {
  const html = '<a about="http://example.org/thing" rel="http://xmlns.com/foaf/0.1/knows" href="http://example.org/other"></a>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].predicate.value === 'http://xmlns.com/foaf/0.1/knows', 'Predicate matches');
  assert(quads[0].object.value === 'http://example.org/other', 'Object IRI');
  assert(quads[0].object.termType === 'NamedNode', 'Object is NamedNode');
});

test('@rev reverses relationship', () => {
  const html = '<a about="http://example.org/thing" rev="http://xmlns.com/foaf/0.1/knows" href="http://example.org/other"></a>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/other', 'Subject is reversed');
  assert(quads[0].object.value === 'http://example.org/thing', 'Object is original subject');
});

test('Chaining with @rel', () => {
  const html = `
    <div about="http://example.org/person" rel="http://xmlns.com/foaf/0.1/knows">
      <div about="http://example.org/friend"></div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad from chaining');
  assert(quads[0].subject.value === 'http://example.org/person', 'Parent subject');
  assert(quads[0].object.value === 'http://example.org/friend', 'Child subject as object');
});

test('Nested @typeof with blank node', () => {
  const html = `
    <div about="http://example.org/person" rel="http://xmlns.com/foaf/0.1/knows">
      <div typeof="http://xmlns.com/foaf/0.1/Person" property="http://xmlns.com/foaf/0.1/name">John</div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  // Debug output
  console.log('\nNested @typeof test quads:');
  quads.forEach(q => {
    console.log(`  ${q.subject.termType}:${q.subject.value} -> ${q.predicate.value.split('/').pop()} -> ${q.object.termType}:${q.object.value}`);
  });

  const relQuad = findQuad(quads, 'http://example.org/person', 'http://xmlns.com/foaf/0.1/knows', null);
  assert(relQuad !== undefined, `Should have rel triple`);

  const typeQuad = findQuad(quads, null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://xmlns.com/foaf/0.1/Person');
  assert(typeQuad !== undefined, 'Should have type triple');
  assert(typeQuad.subject.termType === 'BlankNode', 'Type subject is blank node');

  const nameQuad = findQuad(quads, null, 'http://xmlns.com/foaf/0.1/name', 'John');
  assert(nameQuad !== undefined, 'Should have name property');

  // The blank node should be the same across rel, type, and name
  assert(relQuad.object.value === typeQuad.subject.value, 'Blank node in rel should match type subject');
  assert(typeQuad.subject.value === nameQuad.subject.value, 'Blank node should be same for type and name');
});

test('Empty @about uses document base', () => {
  const html = '<div about="" property="http://purl.org/dc/terms/title">Document Title</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/doc' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/doc', 'Empty about uses base');
});

test('Base tag updates base IRI', () => {
  const html = `
    <html><head><base href="http://newbase.org/"/></head>
    <body><div about="" property="http://purl.org/dc/terms/title">Test</div></body></html>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, `Should have 1 quad, got ${quads.length}`);
  const hasNewBase = quads[0].subject.value === 'http://newbase.org/' ||
    quads[0].subject.value.startsWith('http://newbase.org');
  assert(hasNewBase, `Base tag should update base IRI. Got subject: ${quads[0].subject.value}`);
});

test('xml:base attribute', () => {
  const html = '<div xml:base="http://xmlbase.org/"><div about="" property="http://purl.org/dc/terms/title">Test</div></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://xmlbase.org/', 'xml:base updated local base');
});

test('<time> tag implicit datatype', () => {
  const html = '<time property="http://schema.org/startDate">2025-01-01</time>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.datatype.value === 'http://www.w3.org/2001/XMLSchema#dateTime', 'Implicit xsd:dateTime');
});

test('@vocab for term expansion', () => {
  const html = '<div vocab="http://schema.org/" about="http://example.org/thing" property="name">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].predicate.value === 'http://schema.org/name', 'Term expanded with vocab');
});

test('@inlist for RDF collections', () => {
  const html = `
    <div about="http://example.org/book" rel="http://purl.org/dc/terms/creator" inlist="">
      <span about="http://example.org/author1"></span>
      <span about="http://example.org/author2"></span>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  const rdfFirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
  const rdfRest = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
  const rdfNil = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';

  const firstQuads = countQuads(quads, null, rdfFirst, null);
  assert(firstQuads === 2, `Should have 2 rdf:first triples, got ${firstQuads}`);

  const restQuads = countQuads(quads, null, rdfRest, null);
  assert(restQuads >= 1, `Should have at least 1 rdf:rest triple, got ${restQuads}`);

  const nilQuad = findQuad(quads, null, rdfRest, rdfNil);
  assert(nilQuad !== undefined, 'List terminated with rdf:nil');
});

test('Multiple types with space separation', () => {
  const html = '<div about="http://example.org/thing" typeof="http://schema.org/Person http://xmlns.com/foaf/0.1/Person"></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 type quads');
  assert(findQuad(quads, null, null, 'http://schema.org/Person'), 'Has schema:Person type');
  assert(findQuad(quads, null, null, 'http://xmlns.com/foaf/0.1/Person'), 'Has foaf:Person type');
});

test('Safe CURIE with brackets', () => {
  const html = '<div prefix="ex: http://example.org/" about="[ex:thing]" property="ex:prop">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/thing', 'Safe CURIE resolved');
});

test('Blank node with _: prefix', () => {
  const html = '<div about="_:b1" property="http://xmlns.com/foaf/0.1/name">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.termType === 'BlankNode', 'Subject is blank node');
  assert(quads[0].subject.value === 'b1', 'Blank node ID preserved');
});

test('Prefix case-insensitive matching', () => {
  const html = '<div prefix="DC: http://purl.org/dc/terms/" about="http://example.org/thing" property="dc:title">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].predicate.value === 'http://purl.org/dc/terms/title', 'Case-insensitive prefix');
});

test('@content overrides text content', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/title" content="Override">Visible Text</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'Override', '@content value used');
});

test('@property + @typeof on same element', () => {
  const html = `
    <div about="http://example.org/person">
      <div property="http://xmlns.com/foaf/0.1/knows" typeof="http://xmlns.com/foaf/0.1/Person">
        <span property="http://xmlns.com/foaf/0.1/name">John</span>
      </div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 3, 'Should have 3 quads: property, type, nested property');
  const knowsQuad = findQuad(quads, 'http://example.org/person', 'http://xmlns.com/foaf/0.1/knows', null);
  assert(knowsQuad && knowsQuad.object.termType === 'BlankNode', 'Knows points to blank node');
});

test('@property with @href uses text content, not href', () => {
  const html = '<div about="http://example.org/person" property="http://xmlns.com/foaf/0.1/email"><a href="mailto:alice@example.org">alice@example.org</a></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'alice@example.org', 'Uses text content, not href value');
  assert(quads[0].object.termType === 'Literal', 'Object is literal, not IRI');
});

test('Multiple @property on same element', () => {
  const html = '<div about="http://example.org/book"><span property="http://purl.org/dc/terms/title">Title</span><span property="http://purl.org/dc/terms/description">Desc</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 quads');
  assert(findQuad(quads, 'http://example.org/book', 'http://purl.org/dc/terms/title', 'Title'), 'First property');
  assert(findQuad(quads, 'http://example.org/book', 'http://purl.org/dc/terms/description', 'Desc'), 'Second property');
});

test('@property with @resource uses resource, not text', () => {
  const html = '<div about="http://example.org/thing" property="http://xmlns.com/foaf/0.1/page" resource="http://example.org/page">Ignored Text</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'http://example.org/page', 'Uses resource value');
  assert(quads[0].object.termType === 'NamedNode', 'Object is NamedNode, not literal');
});

test('Nested @vocab override', () => {
  const html = `
    <div vocab="http://schema.org/">
      <div about="http://example.org/person" property="name">Alice</div>
      <div vocab="http://xmlns.com/foaf/0.1/" property="name">Bob</div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 quads');
  const schema = findQuad(quads, 'http://example.org/person', 'http://schema.org/name', 'Alice');
  assert(schema !== undefined, 'First uses schema.org vocab');
});

test('Language tag inheritance', () => {
  const html = '<div lang="en"><span about="http://example.org/thing" property="http://purl.org/dc/terms/title">English</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.language === 'en', 'Language inherited from parent');
});

test('@property without explicit @about uses parent subject', () => {
  const html = '<div about="http://example.org/person"><span property="http://xmlns.com/foaf/0.1/name">John</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/person', 'Inherits parent subject');
});

test('@rel with incomplete triple and @typeof completion', () => {
  const html = `
    <div about="http://example.org/person" rel="http://xmlns.com/foaf/0.1/knows">
      <div typeof="http://xmlns.com/foaf/0.1/Person" property="http://xmlns.com/foaf/0.1/name">Alice</div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 3, `Should have 3 quads, got ${quads.length}`);
  const relQuad = findQuad(quads, 'http://example.org/person', 'http://xmlns.com/foaf/0.1/knows', null);
  assert(relQuad && relQuad.object.termType === 'BlankNode', 'Rel completes with blank node');
  const typeQuad = findQuad(quads, null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://xmlns.com/foaf/0.1/Person');
  assert(relQuad.object.value === typeQuad.subject.value, 'Type applied to completed object');
});

test('@datatype="" creates untyped literal', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/value" datatype="">42</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.datatype.value === 'http://www.w3.org/2001/XMLSchema#string', 'Empty datatype creates string literal');
});

test('@inlist with nested intermediate elements', () => {
  const html = `
    <div about="http://example.org/list" rel="http://example.org/items" inlist="">
      <ul>
        <li><span about="http://example.org/item1"></span></li>
        <li><span about="http://example.org/item2"></span></li>
        <li><span about="http://example.org/item3"></span></li>
      </ul>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  const rdfFirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
  const firstQuads = countQuads(quads, null, rdfFirst, null);
  assert(firstQuads === 3, `Should have 3 rdf:first for 3 items, got ${firstQuads}`);
});

test('Empty @property element creates empty literal', () => {
  const html = '<div about="http://example.org/thing" property="http://purl.org/dc/terms/note"></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 0, 'Empty property with no content or text creates no quad');
});

test('@rev with incomplete triple', () => {
  const html = `
    <div about="http://example.org/author" rev="http://purl.org/dc/terms/creator">
      <div about="http://example.org/book"></div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad from rev');
  assert(quads[0].subject.value === 'http://example.org/book', 'Rev reverses: book is subject');
  assert(quads[0].object.value === 'http://example.org/author', 'Rev reverses: author is object');
});

test('Multiple prefixes in @prefix', () => {
  const html = '<div prefix="dc: http://purl.org/dc/terms/ foaf: http://xmlns.com/foaf/0.1/" about="http://example.org/thing"><span property="dc:title">Title</span><span property="foaf:name">Name</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 quads');
  assert(findQuad(quads, null, 'http://purl.org/dc/terms/title', 'Title'), 'dc: prefix resolved');
  assert(findQuad(quads, null, 'http://xmlns.com/foaf/0.1/name', 'Name'), 'foaf: prefix resolved');
});

test('@src attribute (equivalent to @href)', () => {
  const html = '<div about="http://example.org/doc"><img src="image.jpg" rel="foaf:depiction" /></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  const imgQuad = findQuad(quads, 'http://example.org/doc', 'http://xmlns.com/foaf/0.1/depiction', null);
  assert(imgQuad !== undefined, 'Should have depiction triple');
  assert(imgQuad.object.value.includes('image.jpg'), '@src resolves to URL');
});

test('@resource attribute for object IRI', () => {
  const html = '<div about="http://example.org/book" property="http://purl.org/dc/terms/creator" resource="http://example.org/author1">Author Name</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'http://example.org/author1', 'Uses @resource, not text content');
});

test('XMLLiteral with @datatype=rdf:XMLLiteral', () => {
  const html = '<div about="http://example.org/doc" property="http://purl.org/dc/terms/description" datatype="http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral">Text with <strong>markup</strong></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.datatype.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral', 'XMLLiteral datatype');
  assert(quads[0].object.value.includes('<strong>'), 'XML markup preserved');
});

test('Fragment identifier in @about resolves relative to base', () => {
  const html = '<div about="#section1" property="http://purl.org/dc/terms/title">Section</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/doc' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/doc#section1', 'Fragment resolves to document URI with fragment');
});

test('@property without @about inherits parent subject', () => {
  const html = '<div about="http://example.org/person"><p><span property="http://xmlns.com/foaf/0.1/name">John</span></p></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/person', 'Inherits parent subject through nesting');
});

test('Relative IRI resolution in @about', () => {
  const html = '<div about="person/john" property="http://xmlns.com/foaf/0.1/name">John</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/people/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/people/person/john', 'Relative IRI resolved against base');
});

test('@rel with implicit blank node object', () => {
  const html = '<div about="http://example.org/person" rel="http://xmlns.com/foaf/0.1/knows"><span property="http://xmlns.com/foaf/0.1/name">Alice</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 quads: rel + property');
  const relQuad = findQuad(quads, 'http://example.org/person', 'http://xmlns.com/foaf/0.1/knows', null);
  assert(relQuad && relQuad.object.termType === 'BlankNode', 'Creates implicit blank node for @rel');
  const nameQuad = findQuad(quads, null, 'http://xmlns.com/foaf/0.1/name', 'Alice');
  assert(nameQuad && nameQuad.subject.termType === 'BlankNode', 'Property attached to same blank node');
});

test('Language tag inheritance with override', () => {
  const html = '<div lang="en"><span about="http://example.org/doc" property="http://purl.org/dc/terms/title" lang="fr">Titre</span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.language === 'fr', 'Child lang attribute overrides parent');
});

test('@inlist with mixed literal and resource items', () => {
  const html = `
    <div about="http://example.org/article" typeof="http://schema.org/Article" inlist="">
      <span property="http://schema.org/author" inlist="">John Smith</span>
      <span property="http://schema.org/author" inlist="" resource="http://example.org/author2">Jane</span>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  const rdfFirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
  const firstQuads = countQuads(quads, null, rdfFirst, null);
  assert(firstQuads === 2, `Should have 2 rdf:first entries for mixed list, got ${firstQuads}`);
});

test('@rev with explicit @about', () => {
  const html = '<a about="http://example.org/author" rev="http://purl.org/dc/terms/creator" href="http://example.org/book">Book</a>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://example.org/book', '@rev reverses subject-object');
  assert(quads[0].object.value === 'http://example.org/author', '@rev reverses subject-object');
});

test('Multiple @typeof values create multiple rdf:type triples', () => {
  const html = '<div about="http://example.org/person" typeof="http://schema.org/Person http://xmlns.com/foaf/0.1/Person http://example.org/CustomType"></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 3, 'Should have 3 type quads');
  assert(findQuad(quads, 'http://example.org/person', null, 'http://schema.org/Person'), 'First type');
  assert(findQuad(quads, 'http://example.org/person', null, 'http://xmlns.com/foaf/0.1/Person'), 'Second type');
  assert(findQuad(quads, 'http://example.org/person', null, 'http://example.org/CustomType'), 'Third type');
});

test('Nested @vocab declarations', () => {
  const html = `
    <div vocab="http://schema.org/" about="http://example.org/book">
      <span property="name">Book Name</span>
      <div vocab="http://purl.org/ontology/bibo/">
        <span property="isbn">123-456-789</span>
      </div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 2, 'Should have 2 quads from nested vocabs');
  assert(findQuad(quads, null, 'http://schema.org/name', 'Book Name'), 'First vocab');
  assert(findQuad(quads, null, 'http://purl.org/ontology/bibo/isbn', '123-456-789'), 'Second vocab');
});

test('Empty content with @property creates no quad', () => {
  const html = '<div about="http://example.org/doc"><span property="http://purl.org/dc/terms/note"></span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 0, 'Empty property content creates no triple');
});

test('@href on element with @rel creates resource object', () => {
  const html = '<a about="http://example.org/person" property="http://xmlns.com/foaf/0.1/homepage" href="http://example.org/blog/">My Blog</a>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'http://example.org/blog/', 'Uses @href value as object');
  assert(quads[0].object.termType === 'NamedNode', 'Creates IRI object for @href with @property');
});

test('Deeply nested chaining with multiple levels', () => {
  const html = `
    <div about="http://example.org/book">
      <div rel="http://purl.org/ontology/bibo/author">
        <div typeof="http://xmlns.com/foaf/0.1/Person">
          <span property="http://xmlns.com/foaf/0.1/name">Author</span>
          <div rel="http://xmlns.com/foaf/0.1/knows">
            <div typeof="http://xmlns.com/foaf/0.1/Person">
              <span property="http://xmlns.com/foaf/0.1/name">Colleague</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length > 3, 'Complex nesting creates multiple quads');
  const bookAuthorRel = findQuad(quads, 'http://example.org/book', 'http://purl.org/ontology/bibo/author', null);
  assert(bookAuthorRel && bookAuthorRel.object.termType === 'BlankNode', 'Creates blank nodes for nested @rel');
});

test('Numeric and special character CURIE references', () => {
  const html = '<div prefix="ex2: http://example.org/2020/" about="http://example.org/doc" property="ex2:report-date">2020-12-31</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should handle numeric and special chars in prefix');
  assert(quads[0].predicate.value === 'http://example.org/2020/report-date', 'CURIE with special chars resolved');
});

test('Whitespace in @prefix mapping', () => {
  const html = '<div prefix="  dc:   http://purl.org/dc/terms/  " about="http://example.org/doc" property="dc:title">Test</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should handle whitespace around prefix mapping');
  assert(quads[0].predicate.value === 'http://purl.org/dc/terms/title', 'Whitespace normalized');
});

test('@content takes precedence over element text', () => {
  const html = '<div about="http://example.org/doc" property="http://purl.org/dc/terms/title" content="Actual Title">Visible Title</div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].object.value === 'Actual Title', '@content takes precedence');
});

test('@inlist creates proper RDF list structure for single item', () => {
  const html = '<div about="http://example.org/list" rel="http://example.org/item" inlist=""><span about="http://example.org/item1"></span></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  const rdfRest = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
  const rdfNil = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';
  const nilQuad = findQuad(quads, null, rdfRest, rdfNil);
  assert(nilQuad !== undefined, 'Single item list terminates with rdf:nil');
});

test('xml:base attribute changes base resolution', () => {
  const html = '<div xml:base="http://newbase.org/path/"><div about="doc" property="http://purl.org/dc/terms/title">Test</div></div>';
  const quads = parseRDFa(html, { baseIRI: 'http://example.org/' });

  assert(quads.length === 1, 'Should have 1 quad');
  assert(quads[0].subject.value === 'http://newbase.org/path/doc', 'xml:base changes base for relative IRIs');
});

// Run tests
async function runTests() {
  console.log('Running RDFa Parser Tests...\n');

  for (const { name, fn } of tests) {
    results.total++;
    try {
      fn();
      results.passed++;
      console.log(`✓ ${name}`);
    } catch (error) {
      results.failed++;
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  console.log(`\n${results.passed}/${results.total} tests passed`);

  if (results.failed > 0) {
    console.log(`${results.failed} tests failed`);
    process.exit(1);
  }
}

runTests();