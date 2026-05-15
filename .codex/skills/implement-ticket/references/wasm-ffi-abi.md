# WASM / FFI ABI Guidance

Use this reference when a ticket changes or diagnoses a WASM, FFI, VM, native, or accelerator boundary. Triggers include ABI versions, magic values, buffer headers, status codes, opcode or feature tables, host/guest validation, loader contracts, route constants, or proof that an accelerated route really ran.

## Reassessment

- Identify the ABI owner and every producer/consumer boundary: Rust guest, TypeScript host loader/runtime, score routing, preview/drive adapters, tests, smoke harnesses, and production routes.
- Record exact old and new identity fields: version numbers, magic constants, header lengths, status codes, enum discriminants, feature ids, opcode ids, and route names.
- Search for both symbolic names and literal values across host and guest code before editing. Classify every hit as `owned mirror`, `historical`, or `unrelated`.
- If multiple modules intentionally duplicate ABI guards, update them together or stop for `1-3-1` when ownership is unclear.
- Check whether the ticket's proof lanes exercise compiled artifacts, generated bindings, or a production route that can retain stale ABI constants after a build.
- When the boundary changes raw FFI signatures or buffer plumbing, record the complete call-shape delta before coding: `export signature`, `input header words`, `output pointer/len pairs`, `alloc/dealloc sizes`, `raw-call mismatch witness`, and `loader typed interface mirror`. Treat this separately from ABI version or magic-value identity; argument order, pointer ownership, and output-buffer length drift can fail even when the visible ABI version is correct.
- For carrier/status/output expansion, map `carrier decoded -> nearest public consumer -> witness`: name the score routing, trace serialization, advisory emitter, or other public pipeline that must consume the decoded value. If decode-only exposure is the intended boundary, record `public consumer verified-no-edit` with the inspected evidence before closeout.
- If the ticket asks for a new ABI operation, buffer, or materialization substrate and live code already has part of that substrate, classify it before coding as `already-supported operation`, `missing carrier/metadata`, `missing lifetime/ownership proof`, and `production activation deferred/owned`. Do not reimplement an already-supported operation just to satisfy stale draft prose, but do not close on the weaker existing substrate when the ticket names a directly observable ABI field, lifetime guarantee, or handoff artifact that is still missing.
- If a draft ticket names a guest opcode or Rust VM handler but live code pre-encodes the same feature on the host, do not force a guest edit just to match stale prose. Inspect the host encoder, host runtime route, and guest feature loader together; classify the guest file as `verified-no-edit` only after proving the live hook, behavior, witness noun, and ownership boundary stay on the host-encoded route. If the draft expected a different owned hook, artifact, or proof noun, stop for `1-3-1` and patch the active ticket/spec before coding.

## Implementation Checks

- Keep ABI identity fields centralized when the local architecture already has a shared definition. If duplication is intentional, leave a short comment only when it explains the mirror relationship.
- Preserve fail-closed behavior for mismatched versions, magic values, malformed buffers, unsupported opcodes/features, and missing host capabilities.
- For opcode or feature table expansion, update the fallback/completeness guard so unsupported accelerators are deliberate and visible.
- Do not let a fallback path silently satisfy the ticket unless the ticket explicitly owns fallback behavior rather than route activation.
- For staged ABI substrate tickets where the active ticket explicitly excludes production route activation, do not widen into activation work just to satisfy generic accelerator-proof guidance. Record `production activation deferred` with the confirmed sibling/spec owner, then prove the owned raw ABI success path, fail-closed path, mirror output, and nearest host decode/lowering consumer instead.
- For host-encoded accelerator features, keep feature resolution on the established host boundary unless the approved ticket explicitly moves resolution into the guest ABI. Preserve guest fail-closed handling for unsupported feature ids, but avoid adding parallel host and guest resolution paths for the same semantic ref.

## Verification

- Build the guest/accelerator artifact and the host package in the order required by the live repo.
- Run a focused host-loader or VM smoke that would fail on an ABI mismatch.
- Prove route activation separately from parity: route count greater than zero, nonzero execution counter, or equivalent activation witness first; then prove values, score rows, candidates, or serialized output match the authoritative reference.
- If production activation is explicitly out of scope for a staged ABI ticket, replace activation proof with a durable `activation deferred to <ticket/spec>` classification plus raw ABI and host decode/lowering witnesses that would fail on stale signature, layout, or mirror plumbing.
- Classify unsupported or fallback counts. A green broad lane with zero accelerated routes is not accelerator correctness proof.
- When new ABI carriers represent advisory, trace, preview-status, fallback, or no-signal outcomes, prove the nearest public consumer observes them. A focused decode test is not enough unless the ticket explicitly owns only the private ABI surface; otherwise include a score-routing, trace/advisory emission, serialized-output, or equivalent public-pipeline witness.
- For host-encoded feature routes, prove all three parts explicitly: the host encoded the intended feature value, the guest score-row route consumed the encoded feature rather than falling back, and the activated rows match the authoritative TypeScript or kernel reference. A guest file remaining unchanged is acceptable only when the test would fail if the host-encoded route were inactive or stale.
- When a later build or broad lane rewrites compiled output, rerun the narrowest affected ABI or activated-route witness before citing it as final acceptance.

## Closeout

Record the ABI closeout in the active ticket or final response when relevant:

- `ABI identity`: old/new version, magic, header, status, opcode, feature, or route fields
- `FFI call shape`: export signature, input headers, output pointer/len pairs, alloc/dealloc sizes, raw-call mismatch witness, and typed loader mirror when any of those changed
- `mirror sweep`: every old/new literal or symbol hit classified as owned, historical, or unrelated
- `mismatch behavior`: success and fail-closed witnesses when both are owned by the ticket
- `activation proof`: accelerated route selected and fallback not masking it
- `activation deferred`: confirmed sibling/spec owner when production route activation is explicitly out of scope
- `parity proof`: activated route matches the reference path for ticket-owned values
- `public consumer proof`: decoded advisory/trace/status carriers reached the required score-routing, trace, advisory, or serialized-output pipeline; or `verified-no-edit` with evidence when decode-only exposure is the owned boundary
- `host-encoded route proof`: host encoder, runtime route, and guest feature loader inspected; any guest file left untouched is recorded as `verified-no-edit`
- `deferred mirrors`: confirmed sibling owner, or `none`
