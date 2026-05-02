# LudoForge Engine WASM

This package owns Rust/WASM engine backends. The first crate is a generic policy
VM ABI skeleton used by Spec 150.

Build the WASM artifact with:

```bash
pnpm -F @ludoforge/engine-wasm build
```

The Node bridge loads:

```text
packages/engine-wasm/policy-vm/target/wasm32-unknown-unknown/release/ludoforge_policy_vm.wasm
```

The initial ABI is intentionally small: callers pass a little-endian `i32`
buffer containing magic, version, layout identity, opcode, and operands. The
WASM side rejects mismatched identity fields instead of interpreting unknown
buffers.
