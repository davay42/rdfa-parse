import { RDFaParser } from './index.js';

function formatQuad(quad) {
  const formatTerm = (t) => {
    if (!t) return 'null';
    if (t.termType === 'NamedNode') return `<${t.value}>`;
    if (t.termType === 'BlankNode') return `_:${t.value}`;
    if (t.termType === 'Literal') {
      let lit = `"${t.value}"`;
      if (t.language) lit += `@${t.language}`;
      else if (t.datatype?.value && t.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
        lit += `^^<${t.datatype.value}>`;
      }
      return lit;
    }
    return t.termType;
  };
  return `${formatTerm(quad.subject)} ${formatTerm(quad.predicate)} ${formatTerm(quad.object)} .`;
}

function test(name, html, expectedQuads, options = {}) {
  const parser = new RDFaParser({
    baseIRI: 'http://localhost:5500/demo.html',
    ...options
  });
  parser.write(html);
  parser.end();
  const quads = parser.getQuads();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Expected: ${expectedQuads.length} quads`);
  console.log(`Got: ${quads.length} quads`);

  let pass = true;
  const found = new Set();
  const missing = [];

  expectedQuads.forEach((expected, idx) => {
    const formatted = quads
      .map(q => formatQuad(q))
      .find(q => q === expected);

    if (formatted) {
      found.add(expected);
      console.log(`✓ [${idx}] ${expected}`);
    } else {
      missing.push(expected);
      console.log(`✗ [${idx}] MISSING: ${expected}`);
      pass = false;
    }
  });

  // Check for unexpected quads
  quads.forEach(q => {
    const formatted = formatQuad(q);
    if (!found.has(formatted)) {
      console.log(`! [EXTRA] ${formatted}`);
      pass = false;
    }
  });

  console.log(`\nResult: ${pass ? '✓ PASS' : '✗ FAIL'}`);
  return pass;
}

let passCount = 0;
let totalTests = 0;

// Test 1: Basic vocab + typeof + property
totalTests++;
if (test('Basic vocab + typeof + property', `
  <html vocab="http://schema.org/">
  <div about="#jane" typeof="Person">
    <span property="name">Jane Doe</span>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#jane> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '<http://localhost:5500/demo.html#jane> <http://schema.org/name> "Jane Doe" .'
])) {
  passCount++;
}

// Test 2: Property on element with @href
totalTests++;
if (test('Property with @href', `
  <html vocab="http://schema.org/">
  <div about="#jane" typeof="Person">
    <a property="email" href="mailto:jane@example.org">jane@example.org</a>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#jane> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '<http://localhost:5500/demo.html#jane> <http://schema.org/email> <mailto:jane@example.org> .'
])) {
  passCount++;
}

// Test 3: Nested resource with chaining
totalTests++;
if (test('Nested resource with chaining', `
  <html vocab="http://schema.org/">
  <div about="#john" typeof="Person">
    <span property="name">John Smith</span> works at
    <span property="worksFor" typeof="Organization">
      <span property="name">Acme Corp</span>
    </span>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#john> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '<http://localhost:5500/demo.html#john> <http://schema.org/name> "John Smith" .',
  '<http://localhost:5500/demo.html#john> <http://schema.org/worksFor> _:b0 .',
  '_:b0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Organization> .',
  '_:b0 <http://schema.org/name> "Acme Corp" .'
])) {
  passCount++;
}

// Test 4: @rel with @href
totalTests++;
if (test('@rel with @href', `
  <html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <p about="#jane">
    <a rel="foaf:knows" href="#john">John</a>
  </p>
  </html>
`, [
  '<http://localhost:5500/demo.html#jane> <http://xmlns.com/foaf/0.1/knows> <http://localhost:5500/demo.html#john> .'
])) {
  passCount++;
}

// Test 5: @rev with @href
totalTests++;
if (test('@rev with @href', `
  <html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <p about="#jane">
    <a rev="foaf:knows" href="#alice">Alice</a>
  </p>
  </html>
`, [
  '<http://localhost:5500/demo.html#alice> <http://xmlns.com/foaf/0.1/knows> <http://localhost:5500/demo.html#jane> .'
])) {
  passCount++;
}

// Test 6: Incomplete triple with chaining (@rel + @typeof)
totalTests++;
if (test('Incomplete triple - @rel + @typeof', `
  <html vocab="http://schema.org/" prefix="foaf: http://xmlns.com/foaf/0.1/">
  <div about="#jane">
    <div rel="foaf:knows" typeof="Person">
      <span property="name">Bob</span>
    </div>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#jane> <http://xmlns.com/foaf/0.1/knows> _:b0 .',
  '_:b0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '_:b0 <http://schema.org/name> "Bob" .'
])) {
  passCount++;
}

// Test 7: Typed literal with @datatype
totalTests++;
if (test('Typed literal with @datatype', `
  <html vocab="http://schema.org/" prefix="xsd: http://www.w3.org/2001/XMLSchema#">
  <div about="#event" typeof="Event">
    <span property="startDate" content="2025-06-15" datatype="xsd:date">June 15, 2025</span>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#event> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Event> .',
  '<http://localhost:5500/demo.html#event> <http://schema.org/startDate> "2025-06-15"^^<http://www.w3.org/2001/XMLSchema#date> .'
])) {
  passCount++;
}

// Test 8: Language tagged literal
totalTests++;
if (test('Language tagged literal', `
  <html vocab="http://schema.org/">
  <div about="#article" typeof="Article">
    <p property="headline" lang="en">Semantic Web</p>
    <p property="headline" lang="es">Web Semántico</p>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#article> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Article> .',
  '<http://localhost:5500/demo.html#article> <http://schema.org/headline> "Semantic Web"@en .',
  '<http://localhost:5500/demo.html#article> <http://schema.org/headline> "Web Semántico"@es .'
])) {
  passCount++;
}

// Test 9: Empty @about (document)
totalTests++;
if (test('Empty @about (document subject)', `
  <html prefix="dc: http://purl.org/dc/terms/">
  <div about="" property="dc:title">My Document</div>
  </html>
`, [
  '<http://localhost:5500/demo.html> <http://purl.org/dc/terms/title> "My Document" .'
])) {
  passCount++;
}

// Test 10: Multiple @typeof
totalTests++;
if (test('Multiple @typeof', `
  <html vocab="http://schema.org/">
  <div about="#person" typeof="Person CreativeWork">
    <span property="name">Jane</span>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#person> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '<http://localhost:5500/demo.html#person> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/CreativeWork> .',
  '<http://localhost:5500/demo.html#person> <http://schema.org/name> "Jane" .'
])) {
  passCount++;
}

// Test 11: @resource attribute
totalTests++;
if (test('@resource attribute', `
  <html vocab="http://schema.org/">
  <div about="#photo" typeof="ImageObject">
    <span property="author" resource="#jane">Jane</span>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#photo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/ImageObject> .',
  '<http://localhost:5500/demo.html#photo> <http://schema.org/author> <http://localhost:5500/demo.html#jane> .'
])) {
  passCount++;
}

// Test 12: @src attribute
totalTests++;
if (test('@src attribute', `
  <html vocab="http://schema.org/">
  <div about="#photo" typeof="ImageObject">
    <img property="contentUrl" src="https://example.org/photo.jpg" />
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#photo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/ImageObject> .',
  '<http://localhost:5500/demo.html#photo> <http://schema.org/contentUrl> <https://example.org/photo.jpg> .'
])) {
  passCount++;
}

// Test 13: Deep relationship chaining
totalTests++;
if (test('Deep relationship chaining', `
  <html prefix="schema: http://schema.org/ foaf: http://xmlns.com/foaf/0.1/">
  <div about="#library" typeof="schema:SoftwareSourceCode">
    <div rel="schema:author">
      <div typeof="schema:Person">
        <span property="schema:name">Lead Dev</span>
        <div rel="foaf:knows">
          <div typeof="schema:Person">
            <span property="schema:name">Contributor</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#library> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/SoftwareSourceCode> .',
  '_:b0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '<http://localhost:5500/demo.html#library> <http://schema.org/author> _:b0 .',
  '_:b0 <http://schema.org/name> "Lead Dev" .',
  '_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '_:b0 <http://xmlns.com/foaf/0.1/knows> _:b1 .',
  '_:b1 <http://schema.org/name> "Contributor" .'
])) {
  passCount++;
}

// Test 14: Multiple incomplete triples (list)
totalTests++;
if (test('Multiple incomplete triples', `
  <html vocab="http://schema.org/" prefix="foaf: http://xmlns.com/foaf/0.1/">
  <div about="#jane">
    <ul>
      <li rel="foaf:knows" typeof="Person"><span property="name">Bob</span></li>
      <li rel="foaf:knows" typeof="Person"><span property="name">Carol</span></li>
    </ul>
  </div>
  </html>
`, [
  '<http://localhost:5500/demo.html#jane> <http://xmlns.com/foaf/0.1/knows> _:b0 .',
  '_:b0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '_:b0 <http://schema.org/name> "Bob" .',
  '<http://localhost:5500/demo.html#jane> <http://xmlns.com/foaf/0.1/knows> _:b1 .',
  '_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
  '_:b1 <http://schema.org/name> "Carol" .'
])) {
  passCount++;
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log(`SUMMARY: ${passCount}/${totalTests} tests passed`);
console.log(`${'='.repeat(60)}`);
process.exit(passCount === totalTests ? 0 : 1);
