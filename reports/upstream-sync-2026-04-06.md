# Upstream Sync Report — 2026-04-06

## Summary
- **Upstream**: karpathy/autoresearch
- **Forks analyzed**: 8 (of ~170+ total forks)
- **Findings**: 0 bug fixes, 0 improvements, 0 new features (applicable)
- **Directly applicable**: 0 findings
- **Conceptually applicable**: 0 findings
- **Last sync**: first run

## Fork Discovery

All forks were fetched via `gh api`. The vast majority share identical `pushed_at` timestamps (2026-03-26T00:07:37Z) and are 0 commits ahead — exact mirrors with no changes. 8 forks had actual divergence:

| Rank | Fork | Stars | Ahead | Last Push | Score | Status |
|------|------|-------|-------|-----------|-------|--------|
| 1 | Monichre/autoresearch | 0 | 2 | 2026-04-06 | 1.10 | NEW |
| 2 | mazar/autoresearch-spark | 0 | 2 | 2026-04-06 | 1.10 | NEW |
| 3 | Jasonzzt/autoresearch | 0 | 2 | 2026-04-05 | 1.10 | NEW |
| 4 | chooron/auto-mcp-research | 0 | 1 | 2026-04-06 | 0.70 | NEW |
| 5 | quqbaku/autoresearch | 0 | 1 | 2026-04-05 | 0.70 | NEW |
| 6 | cwali09/autoresearch | 0 | 1 | 2026-04-05 | 0.70 | NEW |
| 7 | centopw/autoresearch-mlx | 0 | 1 | 2026-04-05 | 0.70 | NEW |
| 8 | dhavalgajera/autoresearch | 0 | 1 | 2026-04-05 | 0.70 | NEW |

Score formula: `stars * 0.3 + commits_ahead * 0.4 + recency_score * 0.3` where `recency_score = max(0, 1.0 - days_since_push / 365)`.

## Findings

### Hardware Platform Ports (Not Applicable)

#### [NF-1] DGX Spark / Blackwell GPU port
- **Source**: mazar/autoresearch-spark (0 stars, 2 ahead)
- **Domain**: infrastructure
- **Concept**: Updated PyTorch to 2.11.0 with CUDA 13.0 (cu130), replaced Flash Attention 3 with PyTorch SDPA fallback for Blackwell GPUs where FA3 kernels aren't compiled, changed peak FLOPS constant to GB10 (250 TFLOPS), used `reduce-overhead` compile mode.
- **Relevance**: Not applicable
- **Our status**: Our improve-loop operates at the process/strategy level, not the training infrastructure level. Hardware-specific changes don't affect iteration logic.
- **Recommendation**: Skip
- **Target file(s)**: N/A

#### [NF-2] Intel XPU multi-platform port
- **Source**: Jasonzzt/autoresearch (0 stars, 2 ahead)
- **Domain**: infrastructure
- **Concept**: Full Intel XPU support with platform detection (`IS_XPU`/`IS_CUDA`), device-agnostic helpers (`_device_synchronize`, `_max_memory_allocated`, `_get_device`), GPU FLOPS auto-detection dictionary mapping GPU names to peak TFLOPS, SDPA fallback with explicit causal+sliding-window mask construction, conditional `torch.compile` disabling on non-CUDA backends.
- **Relevance**: Not applicable
- **Our status**: Hardware abstraction doesn't map to our conceptual improve-loop.
- **Recommendation**: Skip
- **Target file(s)**: N/A

#### [NF-3] Windows RTX + consumer GPU VRAM tiering
- **Source**: quqbaku/autoresearch (0 stars, 1 ahead)
- **Domain**: infrastructure
- **Concept**: SDPA attention backend replacing FA3 for Ampere/consumer GPUs, Windows compatibility, disabled `torch.compile` for fork runtime path, VRAM-tiered batch sizing for consumer GPUs.
- **Relevance**: Not applicable
- **Our status**: Resource-aware configuration is an interesting concept but applies to training infrastructure, not our process-level skill.
- **Recommendation**: Skip
- **Target file(s)**: N/A

#### [NF-4] Apple MLX full port
- **Source**: centopw/autoresearch-mlx (0 stars, 1 ahead)
- **Domain**: infrastructure
- **Concept**: Complete rewrite from PyTorch/CUDA to Apple MLX framework. GPT model ported to `mlx.nn.Module`, FA3 replaced with `mx.fast.scaled_dot_product_attention`, Muon optimizer reimplemented with MLX ops, training loop uses `nn.value_and_grad`.
- **Relevance**: Not applicable
- **Our status**: Platform rewrite with no process-level changes.
- **Recommendation**: Skip
- **Target file(s)**: N/A

#### [NF-5] DGX Spark with FA3 capability whitelisting
- **Source**: dhavalgajera/autoresearch (0 stars, 1 ahead)
- **Domain**: infrastructure
- **Concept**: FA3 capability whitelist (`_FA3_SUPPORTED_CAPS = {(9,0), (8,0), (8,6), (8,9)}`) — check GPU compute capability before attempting FA3 load, graceful SDPA fallback with logging, Triton ptxas path override for CUDA 13.0 compatibility, batch/depth tuning for GB10.
- **Relevance**: Not applicable
- **Our status**: The "check capabilities before attempting expensive operation" pattern is sound engineering but doesn't map to our process-level loop.
- **Recommendation**: Skip
- **Target file(s)**: N/A

### Process-Level Changes (Assessed, Not Applicable)

#### [NF-6] Modal GPU deployment + multi-LLM autonomous agent loop
- **Source**: Monichre/autoresearch (0 stars, 2 ahead)
- **Domain**: core-loop, strategies, infrastructure
- **Concept**: Four conceptual ideas extracted:
  1. **5-phase research policy** (throughput → optimizer → arch → combo → free) — structured phase progression through research areas
  2. **Progressive retry backoff** (70s sleep for per-minute TPM limits, 30min/1h for daily quota exhaustion) — designed for unattended overnight runs
  3. **Multi-LLM fallback chain** (Groq primary → Gemini fallback, both optional with `required=False`)
  4. **Patch format for token efficiency** (<<<OLD>>>/<<<NEW>>> blocks to stay under Groq's 12k free-tier limit)
- **Relevance**: Not applicable
- **Our status**:
  - (1) Our UCB1 category selection + plateau-triggered strategy shifts are more adaptive than a fixed phase sequence
  - (2) Our CRASH handling logs and continues; progressive backoff is for API rate limits, not harness script failures
  - (3) LLM provider management is outside our skill's scope
  - (4) Token management is handled by Claude Code's context window, not our skill
- **Recommendation**: Skip — our enhanced version already handles these patterns better or they're out of scope
- **Target file(s)**: N/A

### Documentation Only (Skip)

#### [NF-7] Architecture diagrams and design overview
- **Source**: cwali09/autoresearch (0 stars, 1 ahead)
- **Domain**: other
- **Concept**: Added `.shared/architecture.mmd` (Mermaid diagram of data flow) and `.shared/design-overview.md` (entry points, data flow, dependencies summary). No code changes.
- **Relevance**: Not applicable
- **Our status**: Documentation addition with no process or conceptual changes.
- **Recommendation**: Skip
- **Target file(s)**: N/A

### Different Project Direction (Skip)

#### [NF-8] MCP Server Auto-Evolution system
- **Source**: chooron/auto-mcp-research (0 stars, 1 ahead)
- **Domain**: other
- **Concept**: Built an "MCP Server Auto-Evolution" system with mutation strategies for evolving MCP server tool descriptions, parameter schemas, and capabilities. Includes `EVOLUTION_PROTOCOL.md` with hypotheses tracking, Pareto front multi-objective optimization. Entirely different project that reuses the repo as a starting point.
- **Relevance**: Not applicable
- **Our status**: Different problem domain entirely. The evolution concepts (mutation, selection, Pareto front) overlap with our MAP-Elites evolution pipeline (Spec 14), not the improve-loop skill.
- **Recommendation**: Skip
- **Target file(s)**: N/A

## Previously Reviewed (no new changes since last sync)

N/A — first run.

## Skipped Forks

~160+ forks with 0 commits ahead (exact mirrors) were filtered out during discovery. Notable among these:
- Roman-GitH/autoresearch (1 star, 0 ahead)
- eye20201111/autoresearch (1 star, 0 ahead)
- marketcalls/autoresearch (1 star, 0 ahead)

These have stars but no code changes — just bookmarked mirrors.

## Conclusion

The autoresearch fork ecosystem is currently dominated by hardware platform ports (Blackwell, Intel XPU, Windows RTX, Apple MLX). No fork has modified the core iteration logic, accept/reject patterns, or research strategy in ways that would benefit our enhanced improve-loop skill. Our version — with UCB1 category selection, MAD confidence scoring, Goodhart's Law defenses, tiered mutability, lesson stores, and structured reflection — remains significantly ahead of all fork implementations in terms of process sophistication.

**Next sync recommended**: 2-4 weeks, or when the upstream repo itself receives updates.
