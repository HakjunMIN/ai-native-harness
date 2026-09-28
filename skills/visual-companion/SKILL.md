---
name: visual-companion
description: Use when discovery or architecture decisions are clearer as mockups, layout comparisons, or interactive diagrams than as prose.
---

# Visual companion

Read [protocol](../sdlc/references/protocol.md). Offer the browser companion when
a specific visual decision arises, not automatically for every UI ticket.
Require consent before opening a browser/server. Text questions stay in chat.

1. Use an isolated ticket `prototype/html/` containing only shareable synthetic
   assets. Copy [index.html](templates/index.html) and
   [options.json](templates/options.json); replace variants with the real decision.
   Keep option IDs consistent. Do not serve the repository root or credentials.
2. Run `node <PLUGIN_ROOT>/scripts/visual-server.mjs <absolute-prototype-dir> 0`
   attached to the session. It prints a loopback URL. Verify a GET succeeds before
   opening that exact URL with the host browser facility.
3. Explain what each variant tests. The server persists clicks in `selection.json`.
   Read that file and confirm intent in chat. A click has `approved:false` and
   NEVER passes G1 or G2.
4. Invoke `prototype` for actual Grafana UI sandbox validation after HTML choice.
   Capture state/screenshots, findings, and explicit human approval separately.
5. Stop only this server's PID/session when finished. Do not detach or expose it
   to a LAN; no third-party scripts, fonts, analytics or real telemetry.

The server requires loopback Host/Origin for selection, limits input size and
rejects path escape/symlinks. This is a local design aid, not an authenticated app
server. Missing browser capabilities: provide the URL for manual viewing and
record the limitation; do not claim screenshots or interactions were observed.
