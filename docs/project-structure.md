# Project Structure

```
packages/
  engine/
    src/
      kernel/      # Deterministic game engine
        microturn/     # Atomic decision protocol
          types.ts     # Microturn state, decision stack, decision log, and decision payload types
          constants.ts # Shared microturn protocol bounds and constants
          publish.ts   # Microturn publication and projected-state construction
          apply.ts     # Single-decision application and decision-stack progression
          advance.ts   # Auto-resolve loop for chance/kernel-owned microturns
      cnl/         # Parser, validator, compiler
      agents/      # Bot implementations
      sim/         # Simulator and trace
      cli/         # CLI commands (stub)
    test/
      unit/        # Individual functions, utilities
      integration/ # Cross-module interactions
      e2e/         # Full pipeline (Game Spec -> compile -> run -> eval)
      fixtures/    # Test fixture files (GameDef JSON, spec Markdown, golden outputs)
      helpers/     # Shared test utilities
      performance/ # Benchmarks
      memory/      # Memory leak detection
    schemas/       # JSON Schema artifacts
    scripts/       # Schema artifact generation/check scripts
  runner/
    src/
      worker/      # Web Worker (kernel off-main-thread via Comlink)
      bridge/      # Game bridge (worker → store updates)
      store/       # Zustand game store with lifecycle state machine
      model/       # Render model derivation (GameState → UI)
      utils/       # Display name formatting, helpers
      canvas/      # PixiJS canvas layer (renderers, interactions, viewport)
        renderers/ # Zone, token, adjacency rendering with container pooling
        interactions/ # Keyboard nav, pointer selection, ARIA announcements
      animation/   # GSAP animation system (controller, queue, presets, AI playback)
      ui/          # React DOM UI panels, overlays, toolbar, indicators
      input/       # Keyboard coordinator for unified shortcut handling
      types/       # Shared type declarations (CSS modules)
      bootstrap/   # Default game definition for dev bootstrapping
    test/
      worker/      # Worker and bridge tests
      store/       # Store and lifecycle tests
      model/       # Render model derivation tests
      utils/       # Utility tests
      canvas/      # Canvas layer tests (renderers, interactions, viewport)
        renderers/ # Renderer unit tests
        interactions/ # Interaction handler tests
      animation/   # Animation system tests
      ui/          # React DOM UI component tests
      input/       # Keyboard coordinator tests
      bootstrap/   # Bootstrap fixture and config tests
    index.html     # Vite entrypoint
    vite.config.ts # Vite + React config
data/              # Optional game reference data
docs/              # Design plans and technical documentation
specs/             # Numbered implementation specs
tickets/           # Active implementation tickets
archive/           # Completed tickets, specs, brainstorming, reports
brainstorming/     # Design documents
reports/           # Analysis and evaluation reports
```
