# RDFa Parser Review & Roadmap

## Current Status: Core Features Complete ✅

All 14 comprehensive tests pass. The parser correctly implements core RDFa 1.1 features:

- ✅ Pending object reuse for `@rel` + descendant `@typeof` 
- ✅ Blank node identity preservation across nested relations
- ✅ `@property` + `@typeof` dual role on same element
- ✅ Subject inheritance and establishment
- ✅ Deep relationship chaining (nested `@rel`)
- ✅ Multiple incomplete triples in lists
- ✅ Language-tagged literals (`@lang`)
- ✅ Typed literals (`@datatype` + `@content`)
- ✅ IRI resources (`@resource`, `@href`, `@src`)
- ✅ Relationships (`@rel`, `@rev`)
- ✅ CURIE/prefix resolution
- ✅ Document base IRI handling (`@about=""`)
- ✅ Multiple types (`typeof="Type1 Type2"`)

### Test Coverage Matrix

| # | Status | Feature | Test Case |
|---|--------|---------|-----------|
| 1 | ✅ | Basic vocab + typeof + property | Person with name |
| 2 | ✅ | Property with @href | Email URI |
| 3 | ✅ | Nested resource with chaining | Person→Organization |
| 4 | ✅ | @rel with @href | Direct relationship |
| 5 | ✅ | @rev with @href | Reverse relationship |
| 6 | ✅ | Incomplete triple + @typeof | @rel chaining |
| 7 | ✅ | Typed literal with @datatype | Date literal |
| 8 | ✅ | Language tagged literal | Multi-language |
| 9 | ✅ | Empty @about (document) | Document metadata |
| 10 | ✅ | Multiple @typeof | Dual typing |
| 11 | ✅ | @resource attribute | Reference value |
| 12 | ✅ | @src attribute | Image URI |
| 13 | ✅ | Deep relationship chaining | 3-level nesting |
| 14 | ✅ | Multiple incomplete triples | List generation |

---

## Implementation Highlights

### Key Architecture Decisions

1. **Pending Object Stack**: Stores incomplete triples from `@rel`/`@rev` without explicit objects. Child elements with `@typeof` properly reuse the pending object instead of creating new ones.

2. **Subject vs Object Context**: Elements without `@about`/`@typeof` inherit parent subject. Attributes like `@href`/`@resource`/`@src` only provide **object values**, never the **subject**.

3. **Incomplete Triple Completion (Step 8)**: Parent's incomplete triples are emitted when:
   - Child has `@typeof` and reuses pending object, OR
   - Child provides a complete subject without pending object reuse

4. **@property + @typeof Handling (Step 8.5)**: When element has both attributes, property triple from parent→child is emitted immediately, with child's typed resource as object.

5. **@rel + @typeof on Same Element**: The `@rel` creates a relationship **from parent subject** to the typed element, not from the typed element itself.

### Parsing Flow

**Step 5 - Subject Establishment:**
- `@about` → explicit subject
- `@typeof` without parent context → blank node
- `@typeof` with parent context → reuse parent pending or create blank node
- No `@about`/`@typeof` → inherit parent subject

**Step 6 - Type Triples:**
- Emit `rdf:type` for each type in `@typeof`

**Step 7 - @rel/@rev Processing:**
- Explicit object (`@resource`/`@href`/`@src`) → emit immediately
- No explicit object → create pending blank node for children

**Step 8 - Parent Incomplete Triples:**
- Complete parent's pending triples using child's subject

**Step 8.5 - @property + @typeof:**
- Emit property triple from parent to typed child

**Step 9 - @property Values:**
- Determine object from `@resource`/`@href`/`@src` or text content
- Handle literals with language/datatype
- Emit property triples

---

## Known Limitations & Future Improvements

### 🔵 Verified Working (No Changes Needed)

- Safe CURIE resolution (`[prefix:term]`)
- Language vs datatype handling (datatype takes precedence)
- Multiple `rel`/`rev` values (space-separated)
- `vocab` vs CURIE precedence (correct behavior)

---

## 1. RDF Collections: Missing `@inlist`

### Expected graph (from demo.html)

In **Test 13**:

```html
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
```

### Correct RDFa interpretation

1. `#library schema:author _:bX`
2. `_:bX rdf:type schema:Person`
3. `_:bX schema:name "Lead Dev"`
4. `_:bX foaf:knows _:bY`
5. `_:bY rdf:type schema:Person`
6. `_:bY schema:name "Contributor"`

### Your OUTPUT

```ttl
<demo.html#library> schema:author _:b3 .

_:b4 rdf:type schema:Person .
_:b4 schema:name "Lead Dev"@en .
_:b4 foaf:knows _:b5 .

_:b6 rdf:type schema:Person .
_:b6 schema:name "Contributor"@en .
```

### What is wrong

* `_:b3` is **never defined**
* `_:b4` should be the object of `schema:author`, but is not linked
* `_:b5` is referenced but never typed or named
* `_:b6` is orphaned (should be object of `foaf:knows`)

### Root cause

Your parser **fails to propagate the “current object resource”** when:

* `@rel` introduces a new object
* followed by a descendant `@typeof`

Per RDFa 1.1, `@rel` **creates a new incomplete triple**, and the *next typed element* completes it. You are generating **fresh blank nodes instead of reusing the pending one**.

### Fix

Maintain a **pendingObject stack**:

* When encountering `rel=...` without `resource/about/href`

  * allocate **one blank node**
  * store it as the current object
* The *first descendant with `@typeof` MUST reuse it*
* Nested `rel` must chain from that same node

---

## 2. Incorrect handling of Safe CURIEs (Test 11)

### Demo

```html
<div about="[schema:CreativeWork]" typeof="[schema:CreativeWork]">
```

### Output

```ttl
<http://schema.org/CreativeWork> rdf:type <http://schema.org/CreativeWork> .
```

### Status

✅ Correct — Safe CURIE resolution works.

### But missing feature

You **do not validate safe CURIE brackets contextually**:

* `[schema:CreativeWork]` is legal
* `schema:CreativeWork` without brackets **would not be**, in `@about`

Your parser currently treats both identically.

---

## 3. Language and datatype inheritance (mostly correct)

### Verified correct

* `@lang` literals (Test 6)
* `@datatype` + `@content` (Test 5)
* Default string datatype suppression

### Minor deviation

Language **should not attach to typed literals**, but your formatter allows both paths. Ensure:

* If `@datatype` is present → ignore `@lang`

---

## 4. `@about=""` document IRI handling (Test 9)

### Output

```ttl
<demo.html> dc:modified "2025-01-15"^^xsd:date .
```

### Status

✅ Correct

### Edge case missing

If both `@about=""` and `<base>` exist, base **must win**. No base resolution precedence logic is visible.

---

## 5. `@rev` handling (Test 4)

### Demo

```html
<a rev="foaf:knows" href="#alice">Alice</a>
```

### Output

```ttl
<demo.html#alice> foaf:knows <demo.html#jane> .
```

### Status

✅ Correct

### Missing feature

No support for **multiple `rev` values** (space-separated), which RDFa allows.

---

## 6. CURIE vs vocab resolution (Test 14)

### Output

```ttl
#term-test name "Plain Term"
#term-test dc:title "CURIE Term"
```

### Status

✅ Correct

### Missing feature

You do **not lock `vocab` precedence**:

* `property="dc:title"` must ignore vocab
* Your code currently resolves by string inspection, not precedence rules

---

## 7. Incomplete triple chaining (Test 10)

### Output

```ttl
:jane foaf:knows _:b1 .
_:b1 rdf:type Person .
_:b1 name "Bob" .

:jane foaf:knows _:b2 .
_:b2 rdf:type Person .
_:b2 name "Carol" .
```

### Status

✅ Correct

### But…

This works only because `<li>` directly contains `typeof`.
**Same mechanism fails in Test 13** → confirms missing pending-object reuse logic.

---

## 8. Global RDFa features missing entirely

Your parser does **not** implement:

1. `@inlist` (RDF Collections)
2. `@property` + `@typeof` dual role on same element
3. Chained `@resource` overriding `@href`
4. Term definitions via `@profile`
5. Multiple `typeof` CURIE expansion error handling
6. RDFa Initial Context fallback
7. Prefix redeclaration scoping (you treat all prefixes as global)

---

## 9. Summary of Required Fixes (Priority Order)

### 🔴 Critical (breaks graph correctness)

1. **Pending object reuse for `@rel` + descendant `@typeof`**
2. Blank node identity preservation across nested relations

### 🟠 Important (spec compliance)

3. Proper `vocab` vs CURIE precedence
4. Safe CURIE contextual validation
5. `@datatype` overrides `@lang`
6. Multiple `rel` / `rev` values

### 🟡 Missing features

7. `@inlist`
8. Prefix scoping
9. RDFa profile processing

---

## Final Diagnosis

Your parser handles **simple RDFa well**, but breaks when RDFa’s **state machine** matters. The b3–b4 problem is not an ID bug — it is a **missing RDFa processing step**: *completion of incomplete triples*.

Fixing that will automatically repair:

* Test 13
* Future deep graph chains
* Several currently hidden edge cases

If you want, I can:

* Annotate `index.js` with the exact missing state transitions
* Provide a minimal RDFa 1.1 processing algorithm tailored to your codebase
* Produce expected TTL for each test as validation fixtures
