Below is a structured comparison of **demo.html** and your **extracted OUTPUT**, followed by concrete RDFa-spec deviations, parser bugs, and missing features. The focus is on correctness per RDFa 1.1 Core and explaining the **b3–b4 lost node problem**.

---

## 1. Critical Bug: Test 13 “Deep Relationship Chaining” (b3–b4 issue)

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
