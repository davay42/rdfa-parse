# rdfa-browser

A lightweight, browser-native RDFa 1.1 Core parser optimized for web-workers and modern web applications. Zero Node.js dependencies, full spec compliance, N3.js compatible output.

## Features

- ✅ **Full RDFa 1.1 Core compliance** - Passes standard test suite
- 🚀 **Browser-native** - No Node.js dependencies, works in web-workers
- 🔄 **Streaming architecture** - Event-based quad emission using htmlparser2
- 📦 **N3.js compatible** - Direct integration with N3.Store
- 🎯 **Lightweight** - Clean ESM code under 500 lines
- 🧩 **All RDFa features** - CURIEs, terms, vocabulary expansion, chaining, typed literals

## Installation

```bash
npm install rdfa-browser n3
```

## Usage

### Basic Parsing with N3.js Store

```javascript
import { parseRDFa } from 'rdfa-browser';
import { DataFactory, Store } from 'n3';

const html = `
<div vocab="http://schema.org/" typeof="Person" about="#jane">
  <span property="name">Jane Doe</span>
  <span property="jobTitle">Professor</span>
</div>`;

// Parse with N3 DataFactory for full compatibility
const quads = parseRDFa(html, {
  baseIRI: 'http://example.org/',
  dataFactory: DataFactory
});

// Add to N3 Store
const store = new Store(quads);

// Query the store
const janeQuads = store.getQuads('http://example.org/#jane', null, null);
console.log('Quads about Jane:', janeQuads.length);
```

## N3.js Compatibility

The parser is **100% compatible** with N3.js when using N3's DataFactory:

```javascript
import { DataFactory } from 'n3';
import { parseRDFa } from 'rdfa-browser';

// Use N3's DataFactory for full compatibility
const quads = parseRDFa(html, { dataFactory: DataFactory });

// Quads are valid RDFJS Quad objects that work with:
// - N3.Store.addQuad() / Store constructor
// - N3.Writer.addQuad()
// - Any RDFJS-compliant library
```

The built-in DataFactory produces RDFJS-compliant quads that work with N3.js, but using N3's DataFactory is recommended for:
- Consistent term equality checks
- Optimized N3.Store performance  
- Full N3.js ecosystem integration

### Complete Example: Parse HTML File into Store

```javascript
import { parseRDFa } from 'rdfa-browser';
import { DataFactory, Store } from 'n3';

// Fetch HTML file with RDFa
const response = await fetch('https://example.org/page.html');
const html = await response.text();

// Parse into quads
const quads = parseRDFa(html, {
  baseIRI: response.url,
  dataFactory: DataFactory
});

// Create store with parsed quads
const store = new Store(quads);

// Query the data
const people = store.getQuads(null, 
  DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  DataFactory.namedNode('http://schema.org/Person')
);

console.log(`Found ${people.length} people`);
```

### Web Worker with N3.js Store

```javascript
// worker.js
import { RDFaParser } from 'rdfa-browser';
import { DataFactory, Store, Writer } from 'n3';

self.onmessage = async (e) => {
  try {
    const parser = new RDFaParser({
      baseIRI: e.data.baseIRI,
      dataFactory: DataFactory
    });
    
    const store = new Store();
    
    parser.on('data', quad => {
      store.addQuad(quad);
    });
    
    parser.on('end', () => {
      // Serialize to Turtle for transport
      const writer = new Writer();
      const turtle = writer.quadsToString(store.getQuads());
      
      self.postMessage({ 
        success: true,
        turtle,
        count: store.size
      });
    });
    
    parser.on('error', error => {
      self.postMessage({ error: error.message });
    });
    
    parser.write(e.data.html);
    parser.end();
    
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

// main.js
const worker = new Worker('./worker.js', { type: 'module' });

worker.onmessage = (e) => {
  if (e.data.error) {
    console.error('Worker error:', e.data.error);
  } else {
    console.log('Parsed', e.data.count, 'quads');
    console.log('Turtle:', e.data.turtle);
  }
};

worker.postMessage({ 
  html: document.body.innerHTML, 
  baseIRI: location.href 
});
```

## API

### `parseRDFa(html, options)`

Parse HTML string and return array of quads.

**Parameters:**
- `html` (string) - HTML content with RDFa markup
- `options` (object):
  - `baseIRI` (string) - Base IRI for relative URI resolution (default: '')
  - `dataFactory` (object) - RDFJS DataFactory (default: built-in)
  - `language` (string) - Default language for literals (default: '')
  - `vocab` (string) - Default vocabulary IRI (default: '')
  - `profile` (string) - RDFa profile: 'html', 'xhtml', 'xml' (default: 'html')

**Returns:** Array of RDFJS Quad objects

### `RDFaParser`

Event-based streaming parser.

**Constructor Options:** Same as `parseRDFa()`

**Methods:**
- `write(chunk)` - Write HTML chunk
- `end(chunk)` - Write final chunk and close stream

**Events:**
- `data` - Emitted for each quad
- `error` - Emitted on parsing errors
- `end` - Emitted when parsing completes

## RDFa Support

### Attributes

- `@vocab` - Default vocabulary for terms
- `@prefix` - Prefix mappings (e.g., `dc: http://purl.org/dc/terms/`)
- `@typeof` - RDF type(s) of the resource
- `@about` - Subject IRI
- `@resource` - Object IRI
- `@property` - Property for literal or IRI values
- `@rel` / `@rev` - Property for IRI values (forward/reverse)
- `@href` / `@src` - Object IRI from links/resources
- `@content` - Explicit literal content
- `@datatype` - Literal datatype
- `@lang` / `xml:lang` - Language tag

### CURIE Syntax

```html
<div prefix="schema: http://schema.org/ dc: http://purl.org/dc/terms/">
  <div about="schema:Person" property="dc:title">...</div>
</div>
```

### Vocabulary Terms

```html
<div vocab="http://schema.org/">
  <div typeof="Person">
    <span property="name">Jane</span>
  </div>
</div>
```

### Chaining & Blank Nodes

```html
<div typeof="Person">
  <span property="name">Jane</span>
  <div property="knows" typeof="Person">
    <span property="name">John</span>
  </div>
</div>
```

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires ES2020+ support (modules, optional chaining, nullish coalescing).

## Performance

Optimized for speed with minimal overhead:
- Single-pass streaming parser (~400 lines)
- Efficient stack-based context tracking
- Zero regex for URI resolution
- Direct DataFactory integration
- Robust null/undefined handling
- Comprehensive error boundaries

## Error Handling

The parser includes comprehensive error handling:

```javascript
const parser = new RDFaParser(options);

parser.on('error', (error) => {
  console.error('Parse error:', error);
});

parser.on('data', (quad) => {
  // Process valid quads
});

try {
  const quads = parseRDFa(html, options);
} catch (error) {
  // Handle parsing errors
}
```

## License

MIT

## Contributing

Issues and PRs welcome at https://github.com/yourusername/rdfa-browser