# Token Bot

A private Discord bot for you and your trusted friends to stock, auto-refresh, and hand
out a bearer/refresh token pair for your own API via a panel. Not meant for public
servers or distributing tokens to strangers — commands are locked to the Discord user
IDs you set in `OWNER_IDS`.

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
   - `DEFAULT_EXPIRY_SECONDS` — optional, defaults to 3600
   - `REFRESH_URL` — your API's token refresh endpoint (called every 5 minutes)

5. Railway will run `npm install` then `npm start` automatically and keep the bot
   online 24/7 on the free tier (with monthly usage limits — check Railway's current
   pricing page if you plan to run this long-term).

## Commands

- **/stock**
  Opens a pop-up form with two labeled fields — **Bearer Token** and **Refresh Token** —
  and saves them (in `tokenStore.json` on the host) once submitted. Starts the
  auto-refresh cycle.

- **/generate**
  Posts a panel (an embed with a "Generate" button, credited to Faxx) in the channel.
  Clicking the button builds a `token.json` (bearer token, refresh token, expiry) and
  DMs it to whoever clicked. The file is deleted from the host right after sending. Only
  users in `OWNER_IDS` can click it — anyone else gets rejected.

- **/check**
  Replies with whether the current token is valid or expired, minutes remaining, and
  when it was last refreshed.

## How auto-refresh works

Every 5 minutes, the bot POSTs `{ "refresh_token": "..." }` as JSON to your fixed
`REFRESH_URL`. It expects a JSON response containing a new `bearer_token` (or
`access_token`), a `refresh_token`, and optionally `expires_in` (seconds). The result
overwrites `tokenStore.json`. As long as this loop keeps succeeding, the token
effectively never expires from your perspective — that's why the `/generate` panel
says so.

If your API's refresh endpoint has a different shape (form-encoded body, different field
names, an auth header, etc.), edit the `refreshToken()` function near the top of
`index.js`.

## Notes on security and hosting

- `tokenStore.json` holds a live bearer/refresh token in plaintext on Railway's disk.
  **Railway's filesystem is ephemeral** — it resets on every redeploy, so you'll need to
  re-run `/stock` after any redeploy.
- Never commit real tokens or your `.env` values to the GitHub repo — only the code goes
  there; secrets stay in Railway's Variables tab.
- Commands are restricted to `OWNER_IDS`. Anyone else who tries them gets rejected.
- `/generate` always DMs the file rather than posting it in a channel, since server
  channels (even "private" ones) can have more eyes on them than you expect.
