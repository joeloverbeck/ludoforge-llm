# WASM / FFI ABI Guidance

Use this reference when a ticket changes or diagnoses a WASM, FFI, VM, native, or accelerator boundary. Triggers include ABI versions, magic values, buffer headers, status codes, opcode or feature tables, host/guest validation, loader contracts, route constants, or proof that an accelerated route really ran.

## Reassessment

- Identify the ABI owner and every producer/consumer boundary: Rust guest, TypeScript host loader/runtime, score routing, preview/drive adapters, tests, smoke harnesses, and production routes.
- Record exact old and new identity fields: version numbers, magic constants, header lengths, status codes, enum discriminants, feature ids, opcode ids, and route names.
- Search for both symbolic names and literal values across host and guest code before editing. Classify every hit as `owned mirror`, `historical`, or `unrelated`.
- If multiple modules intentionally duplicate ABI guards, update them together or stop for `1-3-1` when ownership is unclear.
- Check whether the ticket's proof lanes exercise compiled artifacts, generated bindings, or a production route that can retain stale ABI constants after a build.

## Implementation Checks

- Keep ABI identity fields centralized when the local architecture already has a shared definition. If duplication is intentional, leave a short comment only when it explains the mirror relationship.
- Preserve fail-closed behavior for mismatched versions, magic values, malformed buffers, unsupported opcodes/features, and missing host capabilities.
- For opcode or feature table expansion, update the fallback/completeness guard so unsupported accelerators are deliberate and visible.
- Do not let a fallback path silently satisfy the ticket unless the ticket explicitly owns fallback behavior rather than route activation.

## Verification

- Build the guest/accelerator artifact and the host package in the order required by the live repo.
- Run a focused host-loader or VM smoke that would fail on an ABI mismatch.
- Prove route activation separately from parity: route count greater than zero, nonzero execution counter, or equivalent activation witness first; then prove values, score rows, candidates, or serialized output match the authoritative reference.
- Classify unsupported or fallback counts. A green broad lane with zero accelerated routes is not accelerator correctness proof.
- When a later build or broad lane rewrites compiled output, rerun the narrowest affected ABI or activated-route witness before citing it as final acceptance.

## Closeout

Record the ABI closeout in the active ticket or final response when relevant:

- `ABI identity`: old/new version, magic, header, status, opcode, feature, or route fields
- `mirror sweep`: every old/new literal or symbol hit classified as owned, historical, or unrelated
- `mismatch behavior`: success and fail-closed witnesses when both are owned by the ticket
- `activation proof`: accelerated route selected and fallback not masking it
- `parity proof`: activated route matches the reference path for ticket-owned values
- `deferred mirrors`: confirmed sibling owner, or `none`
