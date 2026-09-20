# Endpoints the app exposes

Everything reachable over HTTP, and what it is for.

| Path                                   | Methods   | Purpose                                                                                                                                                |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/public/hooks/automation`         | POST      | Runs one automation cycle immediately. This is the URL the hourly scheduled job calls.                                                                 |
| `/api/public/hooks/census`             | POST      | Census feed. PointClickCare (or any census system / middleware job) posts the * midnight census here every night and hours-per-patient-day stays real  |
| `/api/public/hooks/clock-check`        | POST      | A tablet checks its device key here before it starts taking punches.                                                                                   |
| `/api/public/hooks/integration/<slug>` | POST, GET | One inbound endpoint per registered outside system. Body is JSON rows or raw CSV; every call is logged as a sync and keeps a last-known-good snapshot. |
| `/api/public/hooks/punch`              | POST      | Wall clocks and tablets post punches here using their own device key.                                                                                  |
| `/api/public/hooks/sms-inbound`        | POST      | Staff text the facility number back to claim an open shift. * Twilio posts a form here; we verify Twilio's signature before doing anything.            |

## Agent / MCP endpoints

These let an outside AI assistant use the app on a user's behalf, under that user's
own permissions (the same row-level security applies).

| Path                                           | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `/mcp`                                         | The agent server itself                         |
| `/.mcp/list-tools`, `/.mcp/invoke-tool/<tool>` | List and call individual tools                  |
| `/.well-known/oauth-protected-resource`        | Tells agents where to sign in                   |
| `/.lovable/oauth/consent`                      | The screen where a person approves agent access |

## Tools offered to agents

- `my_schedule` - List the signed-in person's scheduled shifts between two dates (YYYY-MM-DD), with unit, shift and hours.
- `open_shifts` - List shifts that still need someone between two dates (YYYY-MM-DD): date, shift, unit, position and any note.
- `record_call_off` - Mark a scheduled shift as a call-off so the system starts looking for a replacement. Needs the person's name, the date (YYYY-MM-DD) and the shift. Only schedulers and managers can
- `unit_coverage` - Summarize one day's coverage: scheduled hours and headcount per unit and shift, plus that unit's census and hours per patient day when census is on file.
