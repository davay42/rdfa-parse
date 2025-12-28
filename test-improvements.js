import { RDFaParser } from './index.js';

console.log('=== Testing Low-Hanging Fruit Improvements ===\n');

// Test 1: <base> tag support
console.log('1. <base> tag support:');
const baseTest = `
<html>
  <head><base href="https://example.com/docs/"></head>
  <body about="page1" typeof="schema:Page">
    <span property="schema:name">My Page</span>
  </body>
</html>
`;
const baseParser = new RDFaParser();
baseParser.write(baseTest);
baseParser.end();
const baseQuads = baseParser.getQuads();
console.log(`✓ Parsed ${baseQuads.length} quads`);
console.log(`✓ Base IRI after: ${baseParser.options.baseIRI}`);
const baseSubject = baseQuads[0]?.subject.value;
console.log(`✓ Subject resolved to: ${baseSubject}`);
console.log(`✓ Contains base from <base> tag: ${baseSubject?.includes('example.com/docs/') ? '✓' : '✗'}\n`);

// Test 2: xml:base attribute support
console.log('2. xml:base attribute support:');
const xmlBaseTest = `
<div about="item1" typeof="schema:Product" xml:base="https://shop.example.com/">
  <span property="schema:name">Widget</span>
</div>
`;
const xmlBaseParser = new RDFaParser({ baseIRI: 'https://example.com/' });
xmlBaseParser.write(xmlBaseTest);
xmlBaseParser.end();
const xmlBaseQuads = xmlBaseParser.getQuads();
console.log(`✓ Parsed ${xmlBaseQuads.length} quads`);
const xmlBaseSubject = xmlBaseQuads[0]?.subject.value;
console.log(`✓ Subject resolved to: ${xmlBaseSubject}`);
console.log(`✓ Uses xml:base context: ${xmlBaseSubject?.includes('shop.example.com/') ? '✓' : '✗'}\n`);

// Test 3: <time> tag implicit datatype
console.log('3. <time> tag implicit xsd:dateTime:');
const timeTest = `
<div about="event1" typeof="schema:Event">
  <time property="schema:startDate">2025-06-15T10:30:00Z</time>
</div>
`;
const timeParser = new RDFaParser({ baseIRI: 'https://example.com/' });
timeParser.write(timeTest);
timeParser.end();
const timeQuads = timeParser.getQuads();
console.log(`✓ Parsed ${timeQuads.length} quads`);
const timeTriple = timeQuads.find(q => q.predicate.value.includes('startDate'));
if (timeTriple) {
  console.log(`✓ Property value: "${timeTriple.object.value}"`);
  console.log(`✓ Datatype: ${timeTriple.object.datatype?.value}`);
  console.log(`✓ Is xsd:dateTime: ${timeTriple.object.datatype?.value?.includes('dateTime') ? '✓' : '✗'}\n`);
}

// Test 4: Safe CURIE bracket handling
console.log('4. Safe CURIE bracket handling:');
const safeCURIETest = `
<div about="[schema:CreativeWork]" typeof="[schema:CreativeWork]">
  <span property="[schema:name]">My Work</span>
</div>
`;
const safeCURIEParser = new RDFaParser({ baseIRI: 'https://example.com/' });
safeCURIEParser.write(safeCURIETest);
safeCURIEParser.end();
const safeCURIEQuads = safeCURIEParser.getQuads();
console.log(`✓ Parsed ${safeCURIEQuads.length} quads`);
const safeCURIESubject = safeCURIEQuads[0]?.subject.value;
console.log(`✓ Subject: ${safeCURIESubject}`);
console.log(`✓ Correctly resolved CURIE: ${safeCURIESubject?.includes('schema.org/CreativeWork') ? '✓' : '✗'}\n`);

// Test 5: Skip element (whitespace-only elements)
console.log('5. Skip element (whitespace-only):');
const skipTest = `
<div about="item1" typeof="schema:Product">
  <span property="schema:name">Widget</span>
  <div property="schema:description">
  </div>
</div>
`;
const skipParser = new RDFaParser({ baseIRI: 'https://example.com/' });
skipParser.write(skipTest);
skipParser.end();
const skipQuads = skipParser.getQuads();
console.log(`✓ Parsed ${skipQuads.length} quads`);
const hasEmptyDescription = skipQuads.some(q => q.object.value === '');
console.log(`✓ No empty description triples: ${!hasEmptyDescription ? '✓' : '✗'}\n`);

// Test 6: Combination test - all features together
console.log('6. Combined test (all improvements):');
const combinedTest = `
<html>
  <head><base href="https://blog.example.com/"></head>
  <body>
    <article about="#post-1" typeof="schema:BlogPosting" xml:base="https://archive.example.com/">
      <h1 property="schema:headline">Latest Post</h1>
      <time property="schema:datePublished">2025-12-28</time>
      <author property="[schema:author]" resource="[schema:Person]">John Doe</author>
    </article>
  </body>
</html>
`;
const combinedParser = new RDFaParser();
combinedParser.write(combinedTest);
combinedParser.end();
const combinedQuads = combinedParser.getQuads();
console.log(`✓ Parsed ${combinedQuads.length} quads`);
const dateQuad = combinedQuads.find(q => q.predicate.value.includes('datePublished'));
if (dateQuad) {
  console.log(`✓ Date property has implicit datatype: ${dateQuad.object.datatype?.value?.includes('dateTime') ? '✓' : '✗'}`);
}
console.log(`✓ Base IRI updated: ${combinedParser.options.baseIRI}`);

console.log('\n=== All Tests Complete ===');
