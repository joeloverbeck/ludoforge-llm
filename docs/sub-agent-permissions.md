# Sub-Agent Web Research Permissions

Sub-agents spawned via the `Task` tool **cannot prompt for interactive permission**. Any tool they need must be pre-approved in `.claude/settings.local.json` under `permissions.allow`. Without this, web search tools are silently auto-denied and sub-agents fall back to training knowledge only.

**Required allow-list entries for web research**:
- `WebSearch` and `WebFetch` — built-in fallback search tools
- `mcp__tavily__tavily_search`, `mcp__tavily__tavily_extract`, `mcp__tavily__tavily_crawl`, `mcp__tavily__tavily_map`, `mcp__tavily__tavily_research` — Tavily MCP tools

**Tavily API key**: Configured in `~/.claude.json` under `mcpServers.tavily.env.TAVILY_API_KEY`. Development keys (`tvly-dev-*`) have usage limits — upgrade at [app.tavily.com](https://app.tavily.com) if you hit HTTP 432 errors ("usage limit exceeded").
