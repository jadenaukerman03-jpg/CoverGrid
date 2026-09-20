# Passwords, keys and where they come from

The app reads every credential at runtime from environment variables. No real key
value is stored anywhere in this copy.

| Name                                                                               | What it unlocks                                                                | Where it comes from                                              | Required?                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `SUPABASE_URL`                                                                     | The database, auth and storage back end                                        | Created with the project on Lovable Cloud                        | Yes                                  |
| `SUPABASE_PROJECT_ID`                                                              | Project reference used by the agent/MCP endpoints                              | Same as above                                                    | Yes                                  |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY`                                   | Public client key. Safe in front-end code                                      | Same as above                                                    | Yes                                  |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PUBLISHABLE_KEY` | The same three values re-declared for the browser build                        | Same as above                                                    | Yes                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                                                        | Bypasses row-level security for privileged server work                         | Not available on Lovable Cloud; supply your own if self-hosting  | Only for some self-hosted admin jobs |
| `LOVABLE_API_KEY`                                                                  | The AI gateway that runs the scheduling assistant and the background autopilot | Managed by Lovable (rotate it in Lovable, not by editing a file) | Yes, for the AI features             |
| `TWILIO_ACCOUNT_SID`                                                               | Text messaging account                                                         | twilio.com console                                               | Only for texting                     |
| `TWILIO_AUTH_TOKEN`                                                                | Signs inbound texts and sends outbound ones                                    | twilio.com console                                               | Only for texting                     |
| `TWILIO_FROM_NUMBER`                                                               | The facility number texts come from and go out of                              | twilio.com console                                               | Only for texting                     |

## Current status of this project

- Saved and working: the backend connection (`SUPABASE_*`) and `LOVABLE_API_KEY`.
- Named in the code but **never configured**: `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Texting and inbound shift-claiming
  therefore do nothing until a Twilio account is connected.
- `SUPABASE_SERVICE_ROLE_KEY` is not stored on Lovable Cloud by design; server
  code that needs elevated access uses the managed connection instead.

## Rules that were followed when building this

- Front-end code only ever uses the publishable key.
- The AI gateway key and the texting credentials are read from the server side
  only, inside function handlers, and are never returned to the browser.
- Attendance and wage data are protected by row-level security policies, so a
  leaked public key cannot read other people's records.
