import { Parser } from 'htmlparser2';

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
    this.globalListMappings = new Map();
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

      // Finalize all lists
      this.finalizeLists();

      this.emit('end');
    } catch (e) {
      this.emit('error', e);
    }
  }

  finalizeLists() {
    const rdfRest = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
    const rdfNil = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');

    this.globalListMappings.forEach((list) => {
      if (list.tail && !list.finalized) {
        this.emitQuad(list.tail, rdfRest, rdfNil);
        list.finalized = true;
      }
    });
  }

  newBlankNode() {
    return this.df.blankNode(`b${this.blankNodeCounter++}`);
  }

  resolveIRI(iri, base = this.options.baseIRI) {
    if (!iri || typeof iri !== 'string') return null;

    const trimmed = iri.trim();
    if (!trimmed || trimmed.startsWith('_:')) return null;

    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;

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
      const prefix = parts[i].replace(/:$/, '').toLowerCase();
      const uri = parts[i + 1];
      if (prefix && uri && prefix !== '_') prefixes[prefix] = uri;
    }
    return prefixes;
  }

  resolveTerm(term, context) {
    if (!term || typeof term !== 'string') return null;

    const trimmed = term.trim();
    if (!trimmed) return null;

    let processedTerm = trimmed;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      processedTerm = trimmed.slice(1, -1);
    }

    if (processedTerm.includes(':')) {
      const colonIdx = processedTerm.indexOf(':');
      const prefix = processedTerm.substring(0, colonIdx).toLowerCase();
      const reference = processedTerm.substring(colonIdx + 1);

      if (prefix === '_') return null;

      if (context.prefixes[prefix]) {
        return context.prefixes[prefix] + reference;
      }

      if (/^[a-z][a-z0-9+.-]*$/i.test(prefix)) {
        return processedTerm;
      }

      return null;
    }

    const vocab = context.vocab || this.options.vocab;
    return vocab ? vocab + processedTerm : null;
  }

  resolveResourceOrIRI(value, context, allowTerm = true) {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('_:')) {
      return this.df.blankNode(trimmed.substring(2) || undefined);
    }

    if (allowTerm) {
      const iri = this.resolveTerm(trimmed, context);
      if (iri) return this.df.namedNode(iri);
    }

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

    // Handle <base> tag - update global base IRI immediately
    if (name === 'base' && attrs.href) {
      const resolved = this.resolveIRI(attrs.href, this.options.baseIRI);
      if (resolved) {
        this.options.baseIRI = resolved;
        // Update base for all elements in stack
        this.stack.forEach(el => {
          if (!el.attrs['xml:base']) {
            el.base = resolved;
          }
        });
      }
    }

    let base = this.options.baseIRI;

    // Parent's base takes precedence if no xml:base on current element
    if (parent?.base) {
      base = parent.base;
    }

    // xml:base attribute overrides parent base
    if (attrs['xml:base']) {
      const resolved = this.resolveIRI(attrs['xml:base'], base);
      if (resolved) {
        base = resolved;
      }
    }

    const context = {
      base,
      prefixes: { ...DEFAULT_PREFIXES, ...(parent?.prefixes || {}) },
      vocab: parent?.vocab ?? this.options.vocab,
      language: parent?.language || this.options.language
    };

    if (attrs.prefix) {
      Object.assign(context.prefixes, this.parsePrefixes(attrs.prefix));
    }

    if (attrs.vocab !== undefined) {
      context.vocab = attrs.vocab || '';
    }

    if (attrs.lang || attrs['xml:lang']) {
      context.language = attrs.lang || attrs['xml:lang'];
    }

    const isTimeTag = name === 'time';
    const implicitTimeDatatype = isTimeTag && attrs.datatype === undefined;

    let newSubject = null;
    let currentObject = null;
    let typedResource = null;
    const inlist = attrs.inlist !== undefined;
    const hasRelOrRev = attrs.rel !== undefined || attrs.rev !== undefined;

    // Step 5 & 6: Establish new subject
    if (!hasRelOrRev) {
      // No @rel/@rev
      if (attrs.about !== undefined) {
        newSubject = this.parseAbout(attrs.about, context);
      } else if (!parent) {
        newSubject = this.df.namedNode(context.base || '');
      } else if (attrs.typeof !== undefined) {
        // Check if parent has incomplete triple with pending object
        if (parent.incomplete?.length > 0 && parent.incomplete[0]?.pendingObject) {
          newSubject = parent.incomplete[0].pendingObject;
        } else if (attrs.resource !== undefined) {
          newSubject = this.resolveResourceOrIRI(attrs.resource, context, false);
        } else if (attrs.href !== undefined) {
          const resolved = this.resolveIRI(attrs.href, context.base);
          newSubject = resolved ? this.df.namedNode(resolved) : null;
        } else if (attrs.src !== undefined) {
          const resolved = this.resolveIRI(attrs.src, context.base);
          newSubject = resolved ? this.df.namedNode(resolved) : null;
        }

        if (!newSubject) {
          newSubject = this.newBlankNode();
        }
      } else if (parent.currentObject) {
        newSubject = parent.currentObject;
      } else {
        // Inherit parent subject
        newSubject = parent.currentSubject;
      }

      // Set typed resource
      if (attrs.typeof !== undefined && newSubject) {
        typedResource = newSubject;
        currentObject = newSubject;
      }
    } else {
      // Has @rel or @rev
      if (attrs.about !== undefined) {
        newSubject = this.parseAbout(attrs.about, context);
      } else if (!parent) {
        newSubject = this.df.namedNode(context.base || '');
      } else if (parent.currentObject) {
        newSubject = parent.currentObject;
      } else {
        newSubject = parent.currentSubject;
      }

      // Establish current object resource
      if (attrs.resource !== undefined) {
        currentObject = this.resolveResourceOrIRI(attrs.resource, context, false);
      } else if (attrs.href !== undefined) {
        const resolved = this.resolveIRI(attrs.href, context.base);
        currentObject = resolved ? this.df.namedNode(resolved) : null;
      } else if (attrs.src !== undefined) {
        const resolved = this.resolveIRI(attrs.src, context.base);
        currentObject = resolved ? this.df.namedNode(resolved) : null;
      } else if (attrs.typeof !== undefined && attrs.about === undefined) {
        currentObject = this.newBlankNode();
      }

      if (attrs.typeof !== undefined && attrs.about === undefined) {
        typedResource = currentObject;
      } else if (attrs.typeof !== undefined) {
        typedResource = newSubject;
      }
    }

    const currentSubject = newSubject;

    // Generate type triples
    if (attrs.typeof !== undefined && currentSubject) {
      const types = this.parseList(attrs.typeof, context, true);
      const rdfType = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      types.forEach(type => this.emitQuad(currentSubject, rdfType, type));
    }

    // Process @rel and @rev
    let incomplete = [];

    if ((attrs.rel !== undefined || attrs.rev !== undefined) && currentSubject) {
      const rels = attrs.rel !== undefined ? this.parseList(attrs.rel, context, true) : [];
      const revs = attrs.rev !== undefined ? this.parseList(attrs.rev, context, true) : [];

      if (currentObject) {
        rels.forEach(rel => {
          if (inlist) {
            this.addToList(currentSubject, rel, currentObject);
          } else {
            this.emitQuad(currentSubject, rel, currentObject);
          }
        });
        revs.forEach(rev => {
          if (inlist) {
            this.addToList(currentObject, rev, currentSubject);
          } else {
            this.emitQuad(currentObject, rev, currentSubject);
          }
        });
      } else {
        const pendingObject = this.newBlankNode();
        rels.forEach(rel => incomplete.push({ predicate: rel, direction: 'forward', subject: currentSubject, pendingObject, inlist }));
        revs.forEach(rev => incomplete.push({ predicate: rev, direction: 'reverse', subject: currentSubject, pendingObject, inlist }));
      }
    }

    // Complete parent's incomplete triples
    // Only complete if this element establishes a new resource (not just inheriting parent's subject)
    const hasExplicitResource = attrs.about !== undefined || attrs.typeof !== undefined ||
      attrs.resource !== undefined || attrs.href !== undefined || attrs.src !== undefined;

    if (newSubject && hasExplicitResource) {
      // Only complete if this element doesn't have its own explicit object
      const shouldComplete = !currentObject || (attrs.typeof !== undefined);

      if (shouldComplete) {
        // Search up the stack to find incomplete triples
        for (let i = this.stack.length - 1; i >= 0; i--) {
          const ancestorContext = this.stack[i];
          if (ancestorContext?.incomplete?.length > 0) {
            ancestorContext.incomplete.forEach(inc => {
              // For @inlist, allow multiple completions (one per child in sequence)
              // For regular rels, only complete once
              const isListItem = inc.inlist;
              const shouldCompleteThis = isListItem || !inc.completed;

              if (shouldCompleteThis) {
                if (!isListItem) {
                  inc.completed = true;
                }
                const object = newSubject;

                if (inc.direction === 'forward') {
                  if (inc.inlist) {
                    this.addToList(inc.subject, inc.predicate, object);
                  } else {
                    this.emitQuad(inc.subject, inc.predicate, object);
                  }
                } else {
                  if (inc.inlist) {
                    this.addToList(object, inc.predicate, inc.subject);
                  } else {
                    this.emitQuad(object, inc.predicate, inc.subject);
                  }
                }
              }
            });
          }
        }
      }
    }

    // Handle @property + @typeof combination - emit property from parent to this typed resource
    // Only process if parent has an incomplete triple that needs this property to complete it
    let propertyProcessedFromParent = false;
    if (attrs.property !== undefined && attrs.typeof !== undefined && parent && newSubject && parent.incomplete?.length > 0) {
      const properties = this.parseList(attrs.property, context, true);

      // Check if property should be literal (has content/datatype) or resource
      const hasLiteralIndicators = attrs.content !== undefined || attrs.datatype !== undefined;
      const hasResourceIndicators = attrs.resource !== undefined || attrs.href !== undefined || attrs.src !== undefined;

      if (!hasLiteralIndicators && !hasResourceIndicators) {
        // Only emit if parent's incomplete triple actually matches this property structure
        // Check if parent's incomplete has the right predicate
        const parentInc = parent.incomplete[0];
        const properties2 = this.parseList(attrs.property, context, true);
        if (parentInc && properties2.length > 0 && parentInc.predicate.value === properties2[0].value) {
          // This property will complete the parent's incomplete triple
          propertyProcessedFromParent = true;
          // Don't emit here; let the incomplete triple completion logic handle it
        }
      }
    }

    this.stack.push({
      name,
      attrs,
      currentSubject,
      newSubject,
      currentObject,
      typedResource,
      incomplete,
      implicitTimeDatatype,
      inlist,
      base: context.base,
      prefixes: context.prefixes,
      vocab: context.vocab,
      language: context.language,
      text: '',
      propertyProcessedFromParent
    });
  }

  parseAbout(aboutValue, context) {
    const trimmed = aboutValue.trim();
    if (trimmed === '') {
      return this.df.namedNode(context.base || '');
    } else if (trimmed.startsWith('_:')) {
      return this.df.blankNode(trimmed.substring(2));
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const safeCURIE = trimmed.slice(1, -1);
      const resolved = this.resolveTerm(safeCURIE, context);
      return resolved ? this.df.namedNode(resolved) : null;
    } else {
      const resolved = this.resolveIRI(trimmed, context.base);
      return resolved ? this.df.namedNode(resolved) : null;
    }
  }

  addToList(subject, predicate, object) {
    const key = subject.value + '|' + predicate.value;

    if (!this.globalListMappings.has(key)) {
      this.globalListMappings.set(key, { head: null, tail: null, finalized: false });
    }

    const list = this.globalListMappings.get(key);
    const newNode = this.newBlankNode();

    const rdfFirst = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
    const rdfRest = this.df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');

    this.emitQuad(newNode, rdfFirst, object);

    if (list.head === null) {
      list.head = newNode;
      list.tail = newNode;
      this.emitQuad(subject, predicate, newNode);
    } else {
      this.emitQuad(list.tail, rdfRest, newNode);
      list.tail = newNode;
    }
  }

  onTagClose(name) {
    const context = this.stack.pop();
    if (!context || context.name !== name) return;

    const { attrs, currentSubject, text, language, currentObject, implicitTimeDatatype, inlist } = context;

    // Process @property
    if (attrs.property !== undefined && currentSubject) {
      const properties = this.parseList(attrs.property, context, true);

      // Check if this was already processed in onTagOpen (@property + @typeof combo)
      const hasTypeof = attrs.typeof !== undefined;
      const hasLiteralIndicators = attrs.content !== undefined || attrs.datatype !== undefined || text.trim();
      const hasResourceIndicators = attrs.resource !== undefined || attrs.href !== undefined || attrs.src !== undefined;

      // Skip if @property + @typeof was already processed in onTagOpen (resource case)
      if (hasTypeof && !hasLiteralIndicators && !hasResourceIndicators) {
        return;
      }

      let object = null;

      if (attrs.resource !== undefined) {
        object = this.resolveResourceOrIRI(attrs.resource, context, false);
      } else if (attrs.src !== undefined) {
        const resolved = this.resolveIRI(attrs.src, context.base);
        object = resolved ? this.df.namedNode(resolved) : null;
      } else if (currentObject && !attrs.typeof) {
        object = currentObject;
      } else {
        const content = attrs.content !== undefined ? attrs.content : text.trim();

        if (content === '' && attrs.content === undefined) {
          object = null;
        } else if (attrs.datatype !== undefined) {
          const dt = attrs.datatype.trim();
          if (dt === '') {
            object = this.df.literal(content);
          } else {
            const datatype = this.resolveTerm(dt, context);
            if (datatype) {
              object = this.df.literal(content, this.df.namedNode(datatype));
            } else {
              object = this.df.literal(content);
            }
          }
        } else if (implicitTimeDatatype) {
          const xsdDateTimeIRI = 'http://www.w3.org/2001/XMLSchema#dateTime';
          object = this.df.literal(content, this.df.namedNode(xsdDateTimeIRI));
        } else if (language) {
          object = this.df.literal(content, language);
        } else {
          object = this.df.literal(content);
        }
      }

      if (object) {
        properties.forEach(prop => {
          if (inlist) {
            this.addToList(currentSubject, prop, object);
          } else {
            this.emitQuad(currentSubject, prop, object);
          }
        });
      }
    }
  }

  onText(text) {
    // Search from current context backwards to find nearest @property context
    // This allows nested elements to contribute text to parent properties
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].attrs.property !== undefined) {
        this.stack[i].text += text;
        return;
      }
    }
    // If no @property ancestor, add to current context
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