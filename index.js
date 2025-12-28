import { Parser } from 'htmlparser2';

// Default DataFactory for RDFJS compatibility
const DefaultDataFactory = {
  namedNode: (value) => ({ termType: 'NamedNode', value }),
  blankNode: (value = `b${Math.random().toString(36).slice(2)}`) => ({ termType: 'BlankNode', value }),
  literal: (value, languageOrDatatype) => {
    if (typeof languageOrDatatype === 'string') {
      return { termType: 'Literal', value, language: languageOrDatatype, datatype: { termType: 'NamedNode', value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString' } };
    }
    return { termType: 'Literal', value, language: '', datatype: languageOrDatatype || { termType: 'NamedNode', value: 'http://www.w3.org/2001/XMLSchema#string' } };
  },
  quad: (subject, predicate, object, graph) => ({ subject, predicate, object, graph: graph || DefaultDataFactory.defaultGraph() }),
  defaultGraph: () => ({ termType: 'DefaultGraph', value: '' })
};

// RDFa initial context prefixes
const DEFAULT_PREFIXES = {
  grddl: 'http://www.w3.org/2003/g/data-view#',
  ma: 'http://www.w3.org/ns/ma-ont#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfa: 'http://www.w3.org/ns/rdfa#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rif: 'http://www.w3.org/2007/rif#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  skosxl: 'http://www.w3.org/2008/05/skos-xl#',
  wdr: 'http://www.w3.org/2007/05/powder#',
  void: 'http://rdfs.org/ns/void#',
  xhv: 'http://www.w3.org/1999/xhtml/vocab#',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xsd: 'http://www.w3.org/2001/XMLSchema#'
};

export class RDFaParser {
  constructor(options = {}) {
    this.options = {
      baseIRI: options.baseIRI || '',
      dataFactory: options.dataFactory || DefaultDataFactory,
      language: options.language || '',
      vocab: options.vocab || '',
      profile: options.profile || 'html',
      ...options
    };

    this.df = this.options.dataFactory;
    this.quads = [];
    this.listeners = { data: [], error: [], end: [] };
    this.stack = [];
    this.blankNodeCounter = 0;
    this.parser = null;
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return this;
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('Listener error:', e); }
    });
  }

  write(chunk) {
    if (!this.parser) {
      this.parser = new Parser({
        onopentag: (name, attrs) => this.onTagOpen(name, attrs),
        ontext: (text) => this.onText(text),
        onclosetag: (name) => this.onTagClose(name),
        onerror: (err) => this.emit('error', err)
      }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
    }
    try {
      this.parser.write(chunk);
    } catch (e) {
      this.emit('error', e);
    }
  }

  end(chunk) {
    try {
      if (chunk) this.write(chunk);
      if (this.parser) this.parser.end();
      this.emit('end');
    } catch (e) {
      this.emit('error', e);
    }
  }

  newBlankNode() {
    return this.df.blankNode(`b${this.blankNodeCounter++}`);
  }

  resolveIRI(iri, base = this.options.baseIRI) {
    if (!iri || typeof iri !== 'string') return null;

    const trimmed = iri.trim();
    if (!trimmed || trimmed.startsWith('_:')) return null;

    // Absolute IRI (has scheme)
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;

    // Relative IRI resolution
    if (!base) return trimmed;

    try {
      return new URL(trimmed, base).href;
    } catch {
      return null;
    }
  }

  parsePrefixes(prefixAttr) {
    const prefixes = {};
    if (!prefixAttr || typeof prefixAttr !== 'string') return prefixes;

    const parts = prefixAttr.trim().split(/\s+/);
    for (let i = 0; i < parts.length - 1; i += 2) {
      const prefix = parts[i].replace(/:$/, '');
      const uri = parts[i + 1];
      if (prefix && uri) prefixes[prefix] = uri;
    }
    return prefixes;
  }

  resolveTerm(term, context) {
    if (!term || typeof term !== 'string') return null;

    const trimmed = term.trim();
    if (!trimmed) return null;

    // Check if it contains a colon
    if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const prefix = trimmed.substring(0, colonIdx);
      const reference = trimmed.substring(colonIdx + 1);

      // Special case: _:blanknode
      if (prefix === '_') return null;

      // Look up prefix
      if (context.prefixes[prefix]) {
        return context.prefixes[prefix] + reference;
      }

      // Check if it's actually an absolute IRI (e.g., http://...)
      if (/^[a-z][a-z0-9+.-]*$/i.test(prefix)) {
        return trimmed; // It's an absolute IRI
      }

      return null; // Unknown prefix
    }

    // Plain term - use vocabulary
    const vocab = context.vocab || this.options.vocab;
    return vocab ? vocab + trimmed : null;
  }

  resolveResourceOrIRI(value, context, allowTerm = true) {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    // Blank node
    if (trimmed.startsWith('_:')) {
      return this.df.blankNode(trimmed.substring(2) || undefined);
    }

    // Try CURIE/term resolution for properties/types
    if (allowTerm) {
      const iri = this.resolveTerm(trimmed, context);
      if (iri) return this.df.namedNode(iri);
    }

    // Fallback to direct IRI resolution (for @about, @resource, etc)
    const resolved = this.resolveIRI(trimmed, context.base);
    return resolved ? this.df.namedNode(resolved) : null;
  }

  parseList(value, context, allowTerm = true) {
    if (!value || typeof value !== 'string') return [];
    return value.trim().split(/\s+/)
      .map(v => this.resolveResourceOrIRI(v, context, allowTerm))
      .filter(Boolean);
  }

  emitQuad(subject, predicate, object) {
    if (!subject || !predicate || !object) return;

    try {
      const quad = this.df.quad(subject, predicate, object);
      this.quads.push(quad);
      this.emit('data', quad);
    } catch (e) {
      this.emit('error', e);
    }
  }

  onTagOpen(name, attrs) {
    const parent = this.stack[this.stack.length - 1];

    // Build context inheriting from parent
    const context = {
      base: parent?.base || this.options.baseIRI,
      prefixes: { ...DEFAULT_PREFIXES, ...(parent?.prefixes || {}) },
      vocab: parent?.vocab ?? this.options.vocab,
      language: parent?.language || this.options.language
    };

    // Process @prefix
    if (attrs.prefix) {
      Object.assign(context.prefixes, this.parsePrefixes(attrs.prefix));
    }

    // Process @vocab
    if (attrs.vocab !== undefined) {
      context.vocab = attrs.vocab || '';
    }

    // Process @lang / xml:lang
    if (attrs.lang || attrs['xml:lang']) {
      context.language = attrs.lang || attrs['xml:lang'];
    }

    // Determine if this element has RDFa
    const hasRDFa = attrs.about !== undefined || attrs.typeof !== undefined ||
      attrs.property !== undefined || attrs.rel !== undefined ||
      attrs.rev !== undefined || attrs.resource !== undefined ||
      attrs.href !== undefined || attrs.src !== undefined;

    let newSubject = null;
    let currentObject = null;
    let skipElement = false;

    // Step 5: Establish new subject
    if (attrs.about !== undefined) {
      // @about always sets the subject - use IRI resolution, NOT term resolution
      const aboutValue = attrs.about.trim();
      if (aboutValue === '') {
        // Empty @about means document base
        newSubject = this.df.namedNode(context.base || '');
      } else if (aboutValue.startsWith('_:')) {
        newSubject = this.df.blankNode(aboutValue.substring(2));
      } else {
        // Direct IRI resolution (no vocab/term expansion)
        const resolved = this.resolveIRI(aboutValue, context.base);
        newSubject = resolved ? this.df.namedNode(resolved) : null;
      }
    } else if (attrs.typeof !== undefined) {
      // @typeof creates a typed resource
      let reusesPendingObject = false;

      // Check if parent has pending object - if so, reuse it
      if (parent?.incomplete?.length > 0 && parent.incomplete[0]?.pendingObject) {
        newSubject = parent.incomplete[0].pendingObject;
        reusesPendingObject = true;
      } else if (attrs.resource !== undefined) {
        const resolved = this.resolveIRI(attrs.resource, context.base);
        newSubject = resolved ? this.df.namedNode(resolved) : null;
      } else if (attrs.href !== undefined) {
        const iri = this.resolveIRI(attrs.href, context.base);
        newSubject = iri ? this.df.namedNode(iri) : null;
      } else if (attrs.src !== undefined) {
        const iri = this.resolveIRI(attrs.src, context.base);
        newSubject = iri ? this.df.namedNode(iri) : null;
      }

      if (!newSubject) {
        newSubject = this.newBlankNode();
      }

      // Mark on the context for later use
      skipElement = skipElement || false; // Will be set in push to stack
    } else if (parent) {
      // No @about - establish subject from context
      if (!hasRDFa) {
        // No RDFa attributes - inherit parent subject
        newSubject = parent.currentSubject;
        skipElement = true;
      } else if (attrs.typeof !== undefined) {
        // Element has @typeof - needs its own subject
        // Check if parent has pending object to reuse
        if (parent?.incomplete?.length > 0 && parent.incomplete[0]?.pendingObject) {
          newSubject = parent.incomplete[0].pendingObject;
        } else if (attrs.resource !== undefined) {
          const resolved = this.resolveIRI(attrs.resource, context.base);
          newSubject = resolved ? this.df.namedNode(resolved) : null;
        } else if (attrs.href !== undefined) {
          const iri = this.resolveIRI(attrs.href, context.base);
          newSubject = iri ? this.df.namedNode(iri) : null;
        } else if (attrs.src !== undefined) {
          const iri = this.resolveIRI(attrs.src, context.base);
          newSubject = iri ? this.df.namedNode(iri) : null;
        }

        // If still no subject, create a blank node
        if (!newSubject) {
          newSubject = this.newBlankNode();
        }
      } else if (parent.currentObject) {
        // Chaining - use parent's current object as subject
        newSubject = parent.currentObject;
      } else {
        // Default: inherit parent's subject
        // Applies to @rel/@rev without explicit object and without @typeof
        newSubject = parent.currentSubject;
      }
    } else {
      // Root element - use document base
      newSubject = this.df.namedNode(context.base || '');
    }

    const currentSubject = newSubject;

    // Step 6: Generate type triples from @typeof
    if (attrs.typeof !== undefined && currentSubject) {
      const types = this.parseList(attrs.typeof, context, true); // Allow term resolution for types
      const rdfType = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      types.forEach(type => this.emitQuad(currentSubject, rdfType, type));
    }

    // Step 7: Process @rel and @rev for IRI relationships
    let incomplete = [];
    let pendingObject = null;

    // Determine the subject for @rel/@rev incomplete triples
    // If this element has both @rel and @typeof (with no explicit object), 
    // the @rel relates FROM the parent, TO this typed element
    let relSubject = currentSubject;
    let relObject = null;  // Will be the explicit object if provided, or null for incomplete

    if ((attrs.rel !== undefined || attrs.rev !== undefined) && relSubject) {
      // Determine the object for @rel/@rev
      if (attrs.resource !== undefined) {
        const resolved = this.resolveIRI(attrs.resource, context.base);
        relObject = resolved ? this.df.namedNode(resolved) : null;
      } else if (attrs.href !== undefined) {
        const iri = this.resolveIRI(attrs.href, context.base);
        relObject = iri ? this.df.namedNode(iri) : null;
      } else if (attrs.src !== undefined) {
        const iri = this.resolveIRI(attrs.src, context.base);
        relObject = iri ? this.df.namedNode(iri) : null;
      }

      // Special case: @rel + @typeof on same element with no explicit object
      // The @rel should relate from parent to this typed element
      if (relObject === null && attrs.typeof !== undefined && !attrs.resource && !attrs.href && !attrs.src && parent) {
        relSubject = parent.currentSubject;
        relObject = currentSubject;  // The typed element becomes the object
      }

      if (relObject) {
        // Complete triples immediately
        if (attrs.rel !== undefined) {
          const rels = this.parseList(attrs.rel, context, true);
          rels.forEach(rel => this.emitQuad(relSubject, rel, relObject));
        }
        if (attrs.rev !== undefined) {
          const revs = this.parseList(attrs.rev, context, true);
          revs.forEach(rev => this.emitQuad(relObject, rev, relSubject));
        }
        currentObject = relObject;  // Update currentObject for potential chaining
      } else {
        // No explicit object and not a @typeof case - create pending for descendants
        pendingObject = this.newBlankNode();

        // Create incomplete triples to be completed by child elements
        if (attrs.rel !== undefined) {
          const rels = this.parseList(attrs.rel, context, true);
          rels.forEach(rel => incomplete.push({ predicate: rel, direction: 'forward', subject: relSubject, pendingObject: pendingObject }));
        }
        if (attrs.rev !== undefined) {
          const revs = this.parseList(attrs.rev, context, true);
          revs.forEach(rev => incomplete.push({ predicate: rev, direction: 'reverse', subject: relSubject, pendingObject: pendingObject }));
        }
      }
    }

    // Step 8: Complete parent's incomplete triples with current newSubject
    let reusesPendingObject = false;
    if (attrs.typeof !== undefined && parent?.incomplete?.length > 0 && parent.incomplete[0]?.pendingObject) {
      // This child reused the pending object - we should emit the incomplete triples NOW
      reusesPendingObject = true;
    }

    if (parent?.incomplete?.length > 0 && newSubject && !currentObject) {
      parent.incomplete.forEach(inc => {
        // When child reuses pending object, use it; otherwise use the new subject
        const object = reusesPendingObject ? inc.pendingObject : newSubject;

        if (inc.direction === 'forward') {
          // Parent subject -> predicate -> pending object (child)
          this.emitQuad(inc.subject, inc.predicate, object);
        } else {
          // Pending object (child) -> predicate -> parent subject
          this.emitQuad(object, inc.predicate, inc.subject);
        }
      });
    }

    // Step 8.5: Handle @property + @typeof combination
    // When an element has both @property and @typeof, emit property triples from parent to this typed element
    if (attrs.property !== undefined && attrs.typeof !== undefined && parent && newSubject) {
      const properties = this.parseList(attrs.property, context, true);
      properties.forEach(prop => {
        this.emitQuad(parent.currentSubject, prop, newSubject);
      });
    }

    // Push context onto stack
    this.stack.push({
      name,
      attrs,
      currentSubject,
      newSubject,
      currentObject,
      incomplete,
      pendingObject,
      reusesPendingObject,
      skipElement,
      base: context.base,
      prefixes: context.prefixes,
      vocab: context.vocab,
      language: context.language,
      text: ''
    });
  }

  onTagClose(name) {
    const context = this.stack.pop();
    if (!context || context.name !== name) return;

    const { attrs, currentSubject, text, language, currentObject } = context;

    // Step 9: Process @property
    // Skip if @property + @typeof was already handled in onTagOpen (Step 8.5)
    if (attrs.property !== undefined && currentSubject && !(attrs.typeof !== undefined)) {
      const properties = this.parseList(attrs.property, context, true); // Allow term resolution
      let object = null;

      // Determine object value
      // Priority: @resource > @href > @src > currentObject (for chaining) > literal
      if (attrs.resource !== undefined) {
        const resolved = this.resolveIRI(attrs.resource, context.base);
        object = resolved ? this.df.namedNode(resolved) : null;
      } else if (attrs.href !== undefined) {
        const iri = this.resolveIRI(attrs.href, context.base);
        object = iri ? this.df.namedNode(iri) : null;
      } else if (attrs.src !== undefined) {
        const iri = this.resolveIRI(attrs.src, context.base);
        object = iri ? this.df.namedNode(iri) : null;
      } else if (currentObject) {
        // Use the currentObject from @rel/@rev in same element
        object = currentObject;
      } else {
        // Literal value
        const content = attrs.content !== undefined ? attrs.content : text.trim();

        if (attrs.datatype !== undefined) {
          const dt = attrs.datatype.trim();
          if (dt === '') {
            // Empty datatype = plain literal
            object = this.df.literal(content);
          } else {
            // Typed literal - resolve datatype as term/CURIE
            const datatype = this.resolveTerm(dt, context);
            if (datatype) {
              object = this.df.literal(content, this.df.namedNode(datatype));
            } else {
              // Fallback to plain literal if datatype can't be resolved
              object = this.df.literal(content);
            }
          }
        } else if (language) {
          // Language-tagged literal
          object = this.df.literal(content, language);
        } else {
          // Plain literal
          object = this.df.literal(content);
        }
      }

      if (object) {
        properties.forEach(prop => this.emitQuad(currentSubject, prop, object));
      }
    }
  }

  onText(text) {
    const current = this.stack[this.stack.length - 1];
    if (current) {
      current.text += text;
    }
  }



  getQuads() {
    return this.quads;
  }
}

export function parseRDFa(html, options = {}) {
  const parser = new RDFaParser(options);
  parser.write(html);
  parser.end();
  return parser.getQuads();
}

export default { RDFaParser, parseRDFa };