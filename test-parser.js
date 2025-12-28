import { RDFaParser } from './index.js';

// Test 13: Deep relationship chaining
const html13 = `
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
`;

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

const parser = new RDFaParser({
  baseIRI: 'http://localhost:5500/demo.html'
});

parser.write(html13);
parser.end();

const quads = parser.getQuads();
console.log('Test 13: Deep Relationship Chaining');
console.log('Total quads:', quads.length);
quads.forEach(q => console.log(formatQuad(q)));

// Expected output:
// <http://localhost:5500/demo.html#library> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/SoftwareSourceCode> .
// <http://localhost:5500/demo.html#library> <http://schema.org/author> _:bX .
// _:bX <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .
// _:bX <http://schema.org/name> "Lead Dev"@en .
// _:bX <http://xmlns.com/foaf/0.1/knows> _:bY .
// _:bY <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .
// _:bY <http://schema.org/name> "Contributor"@en .
