# Token Bot

A private Discord bot for you and your trusted friends to stock and hand out a
bearer/refresh token pair for your own API via a panel. Not meant for public servers or
distributing tokens to strangers — commands are locked to the Discord user IDs you set
in `OWNER_IDS`.

There is no background auto-refresh in this bot — tokens are stored exactly as you enter
them via `/stock` and delivered as-is via `/generate`. The panel text notes that
FDM.LOL refreshes the token every 5 minutes on its own end.

## Deploying on Railway (free tier, works entirely from your phone)

1. **Push these files to a GitHub repo.** In the GitHub app or mobile browser:
   create a new repo (e.g. `token-bot`), then "Add file → Upload files" and upload
   `index.js`, `package.json`, and `README.md`. Do **not** upload `.env.example` with
   real values — secrets go into Railway's dashboard, not the repo.

2. **Get your Discord bot credentials** (discord.com/developers/applications, works fine
   in mobile Safari/Chrome):
   - Create an application → Bot tab → Reset Token → copy it (this is `DISCORD_TOKEN`)
   - General Information tab → copy the Application ID (this is `CLIENT_ID`)
   - Turn on OAuth2 → URL Generator, check `bot` + `applications.commands` scopes,
     open the generated URL to invite the bot to your server
   - Enable Developer Mode in Discord (Settings → Advanced), then right-click your
     server icon → Copy Server ID (this is `GUILD_ID`), and right-click your own
     profile → Copy User ID (this is one of your `OWNER_IDS`)

3. **Sign up at railway.app** with your GitHub account → New Project → Deploy from
   GitHub repo → pick your `token-bot` repo.

4. **Set environment variables** in Railway: open the deployed service → Variables tab
   → add each of these:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `OWNER_IDS` — comma-separated Discord user IDs, no spaces needed (e.g.
     `123456789012345678,987654321098765432`)
   - `DEFAULT_EXPIRY_SECONDS` — optional, defaults to 3600 (used only to estimate a
     countdown for `/check`)
   - `GENERATE_ROLE_ID` — optional, a Discord role ID. Anyone with this role can click
     the **Generate** button on the panel but cannot run `/stock`, `/generate`, or
     `/check` themselves. Create a role in your server (e.g. "Token Access"), assign it
     to friends, then copy the Role ID (right-click the role in Server Settings → Roles
     with Developer Mode on) and set it here.

5. Railway will run `npm install` then `npm start` automatically and keep the bot
   online 24/7 on the free tier (with monthly usage limits — check Railway's current
   pricing page if you plan to run this long-term).

## Commands

- **/stock**
  Opens a pop-up form with two labeled fields — **Bearer Token** and **Refresh Token** —
  and saves them (in `tokenStore.json` on the host) once submitted.

- **/generate**
  Posts a panel (an embed with a "Generate" button, credited to Faxx, noting that
  FDM.LOL refreshes every 5 minutes) in the channel. Clicking the button builds a
  `token.json` (bearer token, refresh token, expiry estimate) and DMs it to whoever
  clicked. The file is deleted from the host right after sending. Anyone in `OWNER_IDS`
  **or** holding the `GENERATE_ROLE_ID` role can click it — everyone else gets rejected.
  Only `OWNER_IDS` can run the `/generate` command itself (to post the panel).

- **/check**
  Replies with whether the stocked token is likely still valid (based on
  `DEFAULT_EXPIRY_SECONDS` counted from when you last ran `/stock`), minutes remaining,
  and when it was last stocked.

## Notes on security and hosting

- `tokenStore.json` holds a live bearer/refresh token in plaintext on Railway's disk.
  **Railway's filesystem is ephemeral** — it resets on every redeploy, so you'll need to
  re-run `/stock` after any redeploy.
- Never commit real tokens or your `.env` values to the GitHub repo — only the code goes
  there; secrets stay in Railway's Variables tab.
- Commands are restricted to `OWNER_IDS`. Anyone else who tries them gets rejected.
- `/generate` always DMs the file rather than posting it in a channel, since server
  channels (even "private" ones) can have more eyes on them than you expect.
