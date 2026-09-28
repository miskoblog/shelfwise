# Shelfwise

A free bonus app for buyers of **ProductsPilot**, by [Misan Morrison](https://misanmorrison.com/).
ProductsPilot builds the shelf; Shelfwise makes the shelf pay.

Three modules, nine tools:

- **Priced** — Net-Per-Sale (per-platform fee engine), Price Point Picker (weighted scorer inside the category price band), Payback Planner (sales needed to recover what you paid).
- **Handoff** — Handoff Queue (the manual steps ProductsPilot hands back), Buyer Reply Kit (keyword classifier + reply templates), Credit Planner (splits the 15 monthly products by season, your sales and net per sale).
- **Tally** — Sales Log (your own ledger with CSV export), Listing Triage (per-listing verdict and next step), Monthly Report (printable one-page statement).

## How it's built

Plain HTML, CSS and JavaScript — no build step, no framework, no API calls, no server. All data stays in the
visitor's browser (`localStorage`). Hosted on GitHub Pages at `shelfwise.misanmorrison.com`.

The password gate is a client-side SHA-256 check: it keeps the page out of casual hands and off search
engines, but it is not real security (anyone with developer tools can bypass it). No sensitive data lives here.

Fee defaults are the platforms' published rates at build time and are editable in the app.
