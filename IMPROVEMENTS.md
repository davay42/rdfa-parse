# RDFa Parser - Feature Parity with W3C Standard

## Executive Summary

This document outlines the features required to bring `index.js` to **full W3C RDFa 1.1 compliance** and feature parity with the two reference implementations (`RdfaParser.ts` and `RdfParser.ts`).

Current state: **Core features working** (~80% coverage)
Target state: **Full W3C RDFa 1.1 + advanced features** (100% coverage)

---

## Comparison Matrix: Reference Implementations vs Current Code

### RdfaParser.ts (TypeScript - Full Reference)
- ✅ Profile-based feature flags (HTML, XHTML, XML)
- ✅ RDF Collections with `@inlist` support
- ✅ RDFa pattern copying (`rdfa:Pattern`, `rdfa:copy`)
- ✅ Comprehensive error handling
- ✅ XML literal support (`xml:literal`)
- ✅ Stream-based processing (Node.js Readable)
- ✅ Multiple content-type to profile mapping
- ✅ Proper prefix scoping and inheritance
- ✅ `<base>` tag support
- ✅ `<time>` tag support with implicit xsd:dateTime
- ✅ `xml:base` attribute handling
- ✅ Skip element tracking for whitespace
- ✅ Safe CURIE validation

### RdfParser.ts (Comunica Framework)
- ✅ Pluggable architecture with mediators
- ✅ Multiple RDF serialization formats
- ✅ Content-type to extension mapping
- ✅ Extensible data factory support
- ✅ Streaming quad output

### Current index.js Implementation
- ✅ Basic RDFa 1.1 core attributes
- ✅ CURIE/term resolution
- ✅ Language-tagged literals
- ✅ Typed literals with datatype
- ✅ Relationship chaining
- ✅ Incomplete triple completion
- ✅ Event-based API
- ✅ EventEmitter-style listeners

---

## Feature Gap Analysis

### ✅ WORKING FEATURES (No Changes Needed)

1. **Core RDFa 1.1 Attributes**
   - `@about` - Subject IRI resolution
   - `@typeof` - RDF type generation
   - `@property` - Properties from literals and resources
   - `@rel` / `@rev` - Forward/reverse relationships
   - `@resource` / `@href` / `@src` - Object specification
   - `@vocab` - Default vocabulary
   - `@prefix` - CURIE prefix mappings
   - `@content` - Explicit literal content
   - `@datatype` - Typed literals
   - `@lang` / `xml:lang` - Language-tagged literals

2. **CURIE & Term Resolution**
   - Prefix expansion (ex: `schema:Person` → `http://schema.org/Person`)
   - Vocabulary fallback for unprefixed terms
   - Safe CURIE handling (`[prefix:term]`)
   - Blank node literals (`_:id`)

3. **Relationship Processing**
   - Multiple types in `@typeof` (space-separated)
   - Multiple predicates in `@rel`/`@rev` (space-separated)
   - Incomplete triple completion (parent→child chaining)
   - Pending object reuse for typed descendants

4. **Literal Handling**
   - Language-tagged literal creation
   - Typed literal creation with full datatype URIs
   - Datatype overrides language
   - Plain string literals

5. **Context Inheritance**
   - Language scope propagation
   - Prefix scope propagation
   - Vocabulary scope propagation
   - Base IRI inheritance

---

## ❌ MISSING FEATURES (Priority Order)

### 🔴 TIER 1: Critical for W3C Compliance

#### 1. **RDF Collections with `@inlist`** (HIGH PRIORITY)
**Reference**: RdfaParser.ts lines 47, 109, uses `IActiveTag.inlist`, `listMapping`, `listMappingLocal`
**W3C Standard**: [RDFa 1.1 Section 7.5](https://www.w3.org/TR/rdfa-core/#s_collections)

**Current State**: Not implemented
**Required Implementation**:
- Track `@inlist` attribute presence on elements
- Maintain list mapping for each predicate
- Generate `rdf:first` and `rdf:rest` triples
- Handle `rdf:nil` termination
- Proper blank node allocation for list nodes

**Impact**: Without this, structured data with ordered collections fails (e.g., breadcrumbs, shopping carts, ordered lists)

**Example**:
```html
<ul property="schema:author" inlist="">
  <li><span typeof="schema:Person">Alice</span></li>
  <li><span typeof="schema:Person">Bob</span></li>
</ul>
```

Should generate:
```turtle
ex:page schema:author _:list .
_:list rdf:first _:alice .
_:list rdf:rest _:list2 .
_:list2 rdf:first _:bob .
_:list2 rdf:rest rdf:nil .
```

---

#### 2. **Profile-Based Feature Flags** (HIGH PRIORITY)
**Reference**: RdfaParser.ts lines 37-38, IRdfaFeatures interface
**W3C Standard**: [RDFa Core Profiles](https://www.w3.org/TR/rdfa-core/#s_profiles)

**Current State**: Basic profile support, no feature gating
**Required Implementation**:
- Define `IRdfaFeatures` interface with boolean flags for:
  - `baseTag` - Support `<base href>` tag
  - `xmlBase` - Support `xml:base` attribute
  - `timeTag` - Implicit xsd:dateTime for `<time>`
  - `roleAttribute` - Process `role` attribute
  - `copyRdfaPatterns` - Pattern instantiation
  - `xmlnsPrefixMappings` - Namespace declarations
  - `xhtmlInitialContext` - XHTML vocabulary
  - `skipHandlingXmlLiteralChildren` - XML literal handling
  - `onlyAllowUriRelRevIfProperty` - Spec validation
  - `inheritSubjectInHeadBody` - Head/body subject inheritance
- Map content types to profiles
- Load profile-specific initial contexts

**Impact**: Cannot distinguish between HTML, XHTML, and XML processing rules

---

#### 3. **Base IRI & `<base>` Tag Support** (HIGH PRIORITY)
**Reference**: RdfaParser.ts lines 205-207
**W3C Standard**: [RFC 3986 URI Resolution](https://tools.ietf.org/html/rfc3986#section-5.3)

**Current State**: Basic baseIRI option, no tag processing
**Required Implementation**:
- Listen for `<base>` tags in HTML head
- Extract `href` attribute and update base IRI
- Apply RFC 3986 relative resolution for all IRI operations
- `<base>` tag should override constructor baseIRI

**Impact**: Relative IRIs fail without proper base context

**Example**:
```html
<!DOCTYPE html>
<html>
<head><base href="https://example.com/docs/"></head>
<body about="page1"><!-- resolves to https://example.com/docs/page1 -->
```

---

#### 4. **`<time>` Tag with Implicit Datatype** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts lines 212-214
**W3C Standard**: [RDFa 1.1 Section 7.3.1](https://www.w3.org/TR/rdfa-core/#s_implicit_datatype)

**Current State**: Not implemented
**Required Implementation**:
- Detect `<time>` elements
- If `@datatype` not present, apply implicit `xsd:dateTime` datatype
- Handle `datetime` attribute as fallback to text content

**Impact**: Time/date values treated as plain strings instead of typed values

**Example**:
```html
<time property="schema:startDate">2025-06-15</time>
```

Should generate:
```turtle
ex:event schema:startDate "2025-06-15"^^xsd:dateTime .
```

---

#### 5. **`xml:base` Attribute Support** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts lines 210-212
**W3C Standard**: [XML Base](https://www.w3.org/TR/xmlbase/)

**Current State**: Not implemented
**Required Implementation**:
- Parse `xml:base` attribute on any element
- Override base IRI for current element and descendants
- Store as `localBaseIRI` in tag context
- Use for all IRI resolution in current scope

**Impact**: Cannot handle documents with multiple base contexts

---

### 🟠 TIER 2: Advanced W3C Features

#### 6. **RDFa Pattern Copying** (LOW PRIORITY)
**Reference**: RdfaParser.ts lines 40-41, 155-185, pattern-related methods
**W3C Standard**: [RDFa 1.1 Appendix A - Profiles](https://www.w3.org/TR/rdfa-core/#s_profiles)

**Current State**: Not implemented
**Required Implementation**:
- Detect `rdfa:Pattern` in `@typeof`
- Store tagged elements with their attributes
- Process `rdfa:copy` attributes to instantiate patterns
- Create independent blank node instances for each copy
- Support cyclic pattern detection

**Impact**: Template-based RDFa generation not supported

---

#### 7. **XML Literal Support (`xml:literal`)** (LOW PRIORITY)
**Reference**: RdfaParser.ts lines 615-698 (onTagClose handling)
**W3C Standard**: [RDFa 1.1 Section 7.4](https://www.w3.org/TR/rdfa-core/#s_xml_literal)

**Current State**: Not implemented
**Required Implementation**:
- Collect serialized XML when `@datatype="http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral"`
- Preserve inner HTML structure
- Create XML-typed literal triples

**Impact**: Rich structured content as literals not supported

---

#### 8. **Safe CURIE Contextual Validation** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts validation logic throughout
**W3C Standard**: [RDFa 1.1 Section 4.3](https://www.w3.org/TR/rdfa-core/#s_syntax)

**Current State**: Accepts `[term]` format, no contextual validation
**Required Implementation**:
- In `@about`, `@typeof`: Safe CURIEs are required for term expansion
- In `@property`: Safe CURIEs are optional (implicit `vocab` expansion)
- Validate bracket syntax: `[prefix:term]` with colon required
- Reject `[term]` without prefix in `@about`

**Impact**: Malformed RDFa silently passes when it should fail

---

#### 9. **Proper Prefix Scoping** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts lines 237-240, prefix handling
**W3C Standard**: [RDFa 1.1 Section 5.1](https://www.w3.org/TR/rdfa-core/#s_prefix)

**Current State**: Treats all prefixes as global, no re-declaration scoping
**Required Implementation**:
- Store prefix bindings per tag context (already partially done)
- Prevent prefix override shadowing in parent contexts
- Allow explicit un-declaration with empty URI
- Track custom vs initial context prefixes separately

**Impact**: Multi-document contexts with conflicting prefixes fail

---

#### 10. **Proper `@datatype` Interaction** (MEDIUM PRIORITY)
**Reference**: index.js lines 463-483 (already correct!)
**W3C Standard**: [RDFa 1.1 Section 7.2](https://www.w3.org/TR/rdfa-core/#s_typed_literals)

**Current State**: ✅ Correctly implemented - datatype overrides language
**Status**: No changes needed

---

#### 11. **Skip Element Handling** (LOW PRIORITY)
**Reference**: RdfaParser.ts lines 79-96, activeTag.skipElement tracking
**W3C Standard**: [RDFa 1.1 Section 6.6](https://www.w3.org/TR/rdfa-core/#s_skip)

**Current State**: Not implemented
**Required Implementation**:
- Track elements with `@property` but no `@content` or `@datatype`
- When such element has only whitespace/empty children, skip generation
- Suppress output when children are purely presentational

**Impact**: Extra unwanted triples from formatting whitespace

---

#### 12. **Role Attribute Processing** (LOW PRIORITY)
**Reference**: RdfaParser.ts lines 243-260
**W3C Standard**: [RDFa 1.1 with XHTML](https://www.w3.org/TR/rdfa-core/)

**Current State**: Not implemented
**Required Implementation**:
- Parse `role` attribute value (space-separated roles)
- Create triples using XHTML vocabulary (`xhv:role`)
- Auto-scope to XHTML vocab context for role expansion

**Impact**: Semantic role information lost

---

### 🟡 TIER 3: Architecture & Quality Improvements

#### 13. **Streaming Support** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts extends Transform, implements RDF.Sink
**Current State**: Event-based, but no stream interface
**Required**:
- Implement Node.js Readable stream interface
- Support `.pipe()` chaining
- Add `_transform()` and `_flush()` methods
- Emit quads as data events instead of buffering

**Impact**: Cannot integrate with RDF processing pipelines

---

#### 14. **Utility Module for IRI Resolution** (LOW PRIORITY)
**Reference**: RdfaParser.ts imports Util class
**Current State**: Resolution logic embedded in RDFaParser
**Required**:
- Extract IRI resolution to separate `Util` class
- Extract CURIE/term resolution logic
- Create reusable validation methods
- Support relative URL resolution (RFC 3986)

---

#### 15. **Error Handling & Validation** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts lines 806-807 validation
**Current State**: Silent failures for invalid IRIs
**Required**:
- Validate IRI format (must contain `:` for NamedNodes)
- Emit error events for malformed data
- Log warnings for contextual issues
- Support error recovery strategies

---

#### 16. **Configurable Initial Contexts** (MEDIUM PRIORITY)
**Reference**: RdfaParser.ts imports from initial-context.json
**Current State**: Hardcoded DEFAULT_PREFIXES
**Required**:
- Load initial contexts from external JSON
- Support HTML, XHTML, XML-specific contexts
- Allow custom initial context injection
- Handle profile-specific namespace bindings

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Weeks 1-2)
Priority: Must have for W3C compliance
- [ ] Add `@inlist` support with list generation
- [ ] Implement profile-based feature flags
- [ ] Add `<base>` tag processing
- [ ] Add `<time>` implicit datatype

### Phase 2: Important Features (Weeks 3-4)
Priority: Should have for complete RDFa support
- [ ] Add `xml:base` attribute support
- [ ] Implement Safe CURIE validation
- [ ] Improve prefix scoping
- [ ] Add skip element handling

### Phase 3: Advanced Features (Weeks 5-6)
Priority: Nice to have for advanced use cases
- [ ] RDFa pattern copying
- [ ] XML literal support
- [ ] Role attribute processing
- [ ] Streaming interface

### Phase 4: Quality & Architecture (Weeks 7-8)
Priority: Long-term maintainability
- [ ] Extract Util module
- [ ] Implement proper error handling
- [ ] Add comprehensive validation
- [ ] Load external initial contexts

---

## Testing Strategy

### Validation Tests (Already Written)
- [x] REVIEW.md - 14 core feature tests
- [x] VALIDATION.md - Expected graph validation
- [x] test-parser.js - Functional tests
- [x] test-comprehensive.js - Edge case coverage

### New Tests Required
- [ ] @inlist and RDF collection tests
- [ ] Profile-based feature flag tests
- [ ] Base IRI and xml:base resolution tests
- [ ] Time tag implicit datatype tests
- [ ] Streaming interface tests
- [ ] Error handling tests

---

## W3C Standard References

1. **RDFa Core 1.1**: https://www.w3.org/TR/rdfa-core/
2. **RDFa 1.1 Profiles**: https://www.w3.org/TR/rdfa-core/#s_profiles
3. **RDFJS Data Model**: https://www.w3.org/community/rdfjs/
4. **RDF 1.1 Concepts**: https://www.w3.org/TR/rdf11-concepts/
5. **XML Base**: https://www.w3.org/TR/xmlbase/
6. **RFC 3986 - URI Generic Syntax**: https://tools.ietf.org/html/rfc3986

---

## References to Implementation Details

### Key Files
- `index.js` - Main RDFaParser class (~513 lines)
- `examples/RdfaParser.ts` - Full reference implementation (~962 lines)
- `examples/RdfParser.ts` - Generic RDF parser (~124 lines)

### Type Definitions Needed
- `IRdfaFeatures` - Feature flag interface
- `IActiveTag` - Element context stack
- `IRdfaPattern` - Pattern definition
- `IHtmlParseListener` - Parsing events

---

## Success Criteria

✅ **Minimum Viable Completion** (MVP):
- Pass all 14 existing test cases
- Support @inlist for collections
- Profile-based feature selection
- Base IRI and xml:base support

✅ **Full W3C Compliance** (Complete):
- Support all RDFa 1.1 attributes and features
- Pass W3C RDFa test suite
- Feature parity with reference implementations
- Comprehensive error handling

---

## Notes for Developers

1. **@inlist Implementation**: This is the highest-impact feature. RDF collections are used extensively in structured data (Schema.org breadcrumbs, JSON-LD conversion, etc.).

2. **Profile System**: Once implemented, makes it easy to add future RDFa profiles or restrict to specific specs.

3. **Stream Support**: Enables integration with tools like Comunica and other RDF pipeline systems.

4. **Safe CURIE Brackets**: Currently accepted everywhere; need to enforce stricter validation based on attribute context.

5. **Error Transparency**: Current implementation silently fails on edge cases; adding validation will surface bugs in input data.

---

