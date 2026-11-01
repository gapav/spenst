---
id: 0001
title: Spenst as a Claude connector (MCP), grounded in the S&C wiki
status: spec
created: 2026-10-31
depends-on: [0003]
decisions: []
migrations: []
---

## Why

Coaches want an assistant that reviews what is actually programmed in
Spenst — the year plan, blocks, sessions, test results — against the S&C
knowledge wiki, and answers questions about it. Each coach pays for the model
with their own Claude plan, not Spenst.

Anthropic does not allow a third-party app to sign users in with Claude.ai or
to use their Free/Pro/Max credentials. The supported way for a user's plan to
pay is the reverse: Spenst runs a remote MCP server, and the coach adds it as
a custom connector in Claude (web, desktop, mobile). The chat happens in
Claude; Spenst serves tools and data.

## Scope

In:

- An MCP endpoint in the Next app (Streamable HTTP, e.g. `site/app/mcp/route.ts`).
- Sign-in through Supabase Auth's OAuth 2.1 server, with dynamic client
  registration and a consent page in the app. The token is an ordinary
  Supabase JWT, so the server calls PostgREST as the coach and **RLS stays the
  boundary** — no service-role key.
- Read-only tools: the year plan (season, phases, blocks with emphasis, week
  notes, throughline), sessions in a date range (sections → slots → set
  groups, exercises resolved from the library, easier/harder variants), the
  team's battery and squad test values, and wiki search / page reading with
  each page's links and backlinks.
- Tool output rendered as compact text through the pure `lib/` functions
  (`parseSessionContent`, `season.ts`, `profileFor`), not raw JSON.
- Server instructions ported from the vault's program-review workflow: wiki
  first, cite `[[pages]]`, keep coaching disagreement visible, say when the
  wiki is silent.
- A wiki snapshot in the app, built by a script from the vault's `wiki/`.

Out:

- Writes. A later item may let the assistant propose changes as drafts the
  coach accepts in Spenst; it never edits sessions directly.
- An in-app chat (bring-your-own API key) — possible later on the same tools.
- The vault's `wiki/athlete/` (the maintainer's own data) and `raw/`
  (copyrighted sources) — never in the snapshot.

## Done when

Draft — agree these with `/spec` before building.

- [ ] Adding the server as a custom connector in Claude.ai completes the
      OAuth flow through Spenst's consent page.
- [ ] Asked to review the current block, Claude reads the plan and sessions
      through the tools and cites wiki pages.
- [ ] A coach sees only their teams' data through the connector (RLS test
      with two coaches on different teams).
- [ ] The snapshot script excludes `wiki/athlete/` and `raw/` (a test fails
      if either appears).
- [ ] Tool renderers in `lib/` have focused tests.

## Manual steps

- [ ] Turn on the OAuth 2.1 server and dynamic client registration in the
      Supabase dashboard (Authentication → OAuth Server).
- [ ] Deploy somewhere with a server runtime that Claude's cloud can reach.
- [ ] Apply whatever migrations the item adds, in the order `/ship` lists.

## Notes and open questions

- **Athlete data — needs a decision.** The connector sends athlete data, many
  of them minors, to Anthropic under each coach's own Claude account and its
  data settings. That widens the privacy rule in `CLAUDE.md`. Proposal: plans,
  sessions and the library freely; test data squad-level or pseudonymised by
  default; never birth months or measurements; a team setting to turn
  athlete data on. RLS can narrow what the connector sees by the token's
  `client_id` claim.
- **Where the chat lives.** In Claude, not in Spenst — confirm that's fine.
- **Whose knowledge.** One wiki (the maintainer's) for every team, or can
  teams bring their own later?
- **Hosting.** Not decided (`DEPLOYMENT.md`); Vercel as a separate project
  from Grep would host the route.
- The wiki is about 290 pages and 324,000 words: too big to load whole, but
  `index.md` is a catalogue and pages link to each other, so search plus
  link-following tools are enough — no embeddings to start.
- Custom connectors are in beta; Free plans reportedly allow one.
- `wiki/sources/` pages closely summarise paid material; check that is fine
  before other clubs use the connector.

Sources: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance),
[Using connectors in Claude.ai](https://support.claude.com/en/articles/11175166-using-connectors-in-claude-ai),
[Supabase OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server),
[Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).

## Log

- 2026-10-31 spec drafted from the design conversation.
