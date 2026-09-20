# How to use this copy

This is a complete, self-contained copy of **CoverGrid**, a staffing and
scheduling system for a nursing facility. Nothing in it needs this editor to make
sense of - start with the files below.

## Read these first, in this order

| File                          | What you get from it                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `README-START-HERE.md`        | One page: what the product is and what it does by itself     |
| `database/schema-overview.md` | The facility, the rules, the settings, the hourly job        |
| `database/schema-tables.md`   | Every table and column as it exists today                    |
| `database/access-rules.md`    | Who may see and change each table                            |
| `docs/file-map.md`            | Every source file and what it holds                          |
| `docs/api-endpoints.md`       | Every URL the app answers on                                 |
| `SECRETS.md`                  | Which credentials the app looks for and where they come from |
| `database/schema-full.sql`    | The whole database history, replayable on a fresh database   |

## Running it on your own machine

You need Node.js 20 or newer (and a back end to point it at).

```sh
npm install            # or: bun install
cp .env.example .env   # then fill in the blanks; see SECRETS.md
npm run dev            # development server
npm run build          # production build
npm run lint           # code checks
```

To recreate the back end somewhere else, run `database/schema-full.sql` against a
fresh Postgres database with the same extensions (`pgcrypto`, `uuid-ossp`,
`pg_net`, `pg_cron`), then point the app at it with the values in `.env`.

## Handing it to another AI

- For a quick question: paste `README-START-HERE.md`.
- For real work: attach this whole ZIP, or attach `CoverGrid-context-pack.md`
  (a single file with the overview, the map, the database design and the rules).
- Ask it to read `database/access-rules.md` before it suggests any change that
  touches data, so it does not quietly break who is allowed to see what.

## What was deliberately left out

- `node_modules` (installed packages - rebuilt by `npm install`)
- Git history and the `.git` folder
- Build output
- Real credential values. `.env` became `.env.example` with the values removed.

## Things that are specific to where it was hosted

- The back end is Lovable Cloud (a hosted Postgres plus auth). Self-hosting means
  running your own Postgres and auth server and repointing `.env`.
- The AI features call the Lovable AI gateway through `LOVABLE_API_KEY`. Swap the
  calls in `src/lib/ai.server.ts` for another provider if you prefer.
- The scheduled job lives in the database (`cron.job`) and calls this project's
  own URL. Any other host needs an equivalent hourly call to
  `/api/public/hooks/automation`.
- `src/routes/[.]lovable.oauth.consent.tsx` and the files marked `AUTO` in the
  file map are tied to that hosting; they can be deleted if you move elsewhere.
