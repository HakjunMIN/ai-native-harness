---
name: visual-companion
description: Use when discovery or architecture decisions are clearer as mockups, layout comparisons, or interactive diagrams than as prose.
---

# Visual companion

Read [shared principles](../sdlc/references/principles.md). Offer the browser companion when
a specific visual decision arises, not automatically for every UI task.
Require consent before opening a browser/server. Text questions stay in chat.

## Select the mode

- **Diagram/comparison:** architecture, C4, data flow or non-UI alternatives.
  Return the visual artifact, decision and rationale to the calling phase. Do not
  invoke `prototype`, require Grafana/Docker, or request UI screenshot baselines.
- **Product UI:** a user-facing Grafana layout or interaction decision. After
  selection, invoke `prototype` for actual Grafana sandbox and UX validation.

Choose from the decision being evaluated, not merely the presence of HTML or
`uiChange` on the run. For mixed requests, separate the diagram and UI outputs;
apply sandbox requirements only to the product UI. Selection never passes a gate.

## Procedure

1. Use an isolated run's `prototype/html/` containing only shareable synthetic
   assets. Copy [index.html](templates/index.html) and
   [options.json](templates/options.json); replace variants with the real decision.
   Keep option IDs consistent. Do not serve the repository root or credentials.
2. Run `node <PLUGIN_ROOT>/scripts/visual-server.mjs <absolute-prototype-dir> 0`
   attached to the session. It prints a loopback URL. Verify a GET succeeds before
   opening that exact URL with the host browser facility.
3. Explain what each variant tests. The server persists clicks in `selection.json`.
   Read that file and confirm intent in chat. A click has `approved:false` and
   NEVER passes G1 or G2.
4. In product UI mode only, invoke `prototype` after HTML choice. Capture sandbox
   state/screenshots, findings, and explicit human approval separately. In diagram/
   comparison mode, return the selected artifact and rationale without UI validation;
   an SDLC caller still obtains its required G1/G2 approval; standalone diagrams
   do not create an approval workflow.
5. Stop only this server's PID/session when finished. Do not detach or expose it
   to a LAN; no third-party scripts, fonts, analytics or real telemetry.

The server requires loopback Host/Origin for selection, limits input size and
rejects path escape/symlinks. This is a local design aid, not an authenticated app
server. Missing browser capabilities: provide the URL for manual viewing and
record the limitation; do not claim screenshots or interactions were observed.
