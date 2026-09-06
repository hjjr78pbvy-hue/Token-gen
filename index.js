// Personal token-management Discord bot
// Commands: /stock, /generate, /check

const fs = require('fs');
const path = require('path');

// ---------- startup diagnostics ----------
// These run before anything else so a bad environment produces a clear,
// human-readable message instead of a silent crash-loop.

console.log('--- Starting token bot ---');
console.log(`Node version: ${process.version}`);

const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor < 18) {
  console.error(
    `FATAL: This bot needs Node 18 or newer (for the built-in fetch API). Detected Node ${process.version}.\n` +
    `On Railway: open your service -> Settings -> check "Node Version" / add a file named ".node-version" ` +
    `containing "18" to your repo, or set an env var NIXPACKS_NODE_VERSION=18, then redeploy.`
  );
  process.exit(1);
}

let discord;
try {
  discord = require('discord.js');
} catch (err) {
  console.error(
    'FATAL: Could not load the "discord.js" package. This almost always means npm install ' +
    'did not run or failed. Check the Build logs (not Deploy logs) on Railway for an npm error.\n' +
    `Underlying error: ${err.message}`
  );
  process.exit(1);
}

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = discord;

const STORE_PATH = path.join(__dirname, 'tokenStore.json');

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  defaultExpirySeconds: parseInt(process.env.DEFAULT_EXPIRY_SECONDS || '3600', 10),
  refreshUrl: process.env.REFRESH_URL,
};

console.log('Environment check:');
console.log(`  DISCORD_TOKEN set: ${config.token ? 'yes (' + config.token.length + ' chars)' : 'NO — MISSING'}`);
console.log(`  CLIENT_ID: ${config.clientId || 'NO — MISSING'}`);
console.log(`  GUILD_ID: ${config.guildId || 'NO — MISSING'}`);
console.log(`  OWNER_IDS: ${config.ownerIds.length ? config.ownerIds.join(', ') : 'NO — MISSING/EMPTY'}`);
console.log(`  REFRESH_URL: ${config.refreshUrl || 'NO — MISSING'}`);

const REQUIRED = ['token', 'clientId', 'guildId', 'refreshUrl'];
let missing = false;
for (const key of REQUIRED) {
  if (!config[key]) {
    console.error(`FATAL: Missing required environment variable for "${key}".`);
    missing = true;
  }
}
if (config.ownerIds.length === 0) {
  console.error('FATAL: OWNER_IDS is empty — set it to a comma-separated list of allowed Discord user IDs.');
  missing = true;
}
if (missing) {
  console.error(
    '\nGo to Railway -> your service -> Variables tab and make sure all of these exist:\n' +
    '  DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_IDS, REFRESH_URL\n' +
    'Then wait for it to auto-redeploy.'
  );
  process.exit(1);
}

// Basic sanity check on token shape — a copy/paste mistake (extra spaces,
// wrong field copied) is the #1 cause of instant crash-loops.
if (config.token.includes(' ') || config.token.length < 50) {
  console.warn(
    'WARNING: DISCORD_TOKEN looks unusual (contains a space or is shorter than expected). ' +
    'Double check you copied the Bot Token from the "Bot" tab, not the Client Secret from "OAuth2".'
  );
}

// ---------- storage helpers ----------

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return { bearer_token: null, refresh_token: null, expires_at: null, last_refreshed: null };
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function saveStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function isOwner(userId) {
  return config.ownerIds.includes(userId);
}

// ---------- refresh logic ----------

async function refreshToken() {
  const store = loadStore();
  if (!store.refresh_token) {
    console.log('[refresh] No token stocked yet, skipping.');
    return { ok: false, reason: 'not_stocked' };
  }

  try {
    const res = await fetch(config.refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: store.refresh_token }),
    });

    if (!res.ok) {
      console.log(`[refresh] Failed with status ${res.status}`);
      return { ok: false, reason: `http_${res.status}` };
    }

    const data = await res.json();

    // Expects { access_token / bearer_token, refresh_token, expires_in }
    const newBearer = data.bearer_token || data.access_token;
    const newRefresh = data.refresh_token || store.refresh_token;
    const expiresIn = data.expires_in || config.defaultExpirySeconds || 3600;

    store.bearer_token = newBearer;
    store.refresh_token = newRefresh;
    store.expires_at = Date.now() + expiresIn * 1000;
    store.last_refreshed = Date.now();

    saveStore(store);
    console.log('[refresh] Token refreshed successfully.');
    return { ok: true };
  } catch (err) {
    console.error('[refresh] Error:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ---------- shared generate logic ----------

async function generateAndDeliver(user) {
  const store = loadStore();

  if (!store.bearer_token) {
    return { ok: false, message: 'No token stocked yet. Use /stock first.' };
  }

  const outPath = path.join(__dirname, `token_${Date.now()}_${user.id}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        bearer_token: store.bearer_token,
        refresh_token: store.refresh_token,
        expires_at: store.expires_at,
      },
      null,
      2
    )
  );

  try {
    const attachment = new AttachmentBuilder(outPath, { name: 'token.json' });
    await user.send({ content: 'Here is your generated token file:', files: [attachment] });
    return { ok: true, message: 'Sent you the token file in DMs.' };
  } catch (err) {
    return { ok: false, message: 'Could not DM you — check that your DMs are open.' };
  } finally {
    fs.unlinkSync(outPath);
  }
}

// ---------- slash commands ----------

const commands = [
  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Open a form to stock your bearer + refresh token'),
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Post a panel with a button to generate your token JSON'),
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check whether the stocked token is still valid'),
].map((c) => c.toJSON());

// ---------- client setup ----------

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Kick off the auto-refresh loop
  setInterval(refreshToken, 5 * 60 * 1000); // every 5 minutes
});

client.on('interactionCreate', async (interaction) => {
  // ---- button clicks (the generate panel) ----
  if (interaction.isButton()) {
    if (interaction.customId !== 'generate_token_button') return;

    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'You are not authorized to use this.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await generateAndDeliver(interaction.user);
    await interaction.editReply(result.message);
    return;
  }

  // ---- modal submission (the /stock form) ----
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== 'stock_modal') return;

    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'You are not authorized to use this.', ephemeral: true });
      return;
    }

    const bearer_token = interaction.fields.getTextInputValue('bearer_token_input');
    const refresh_token = interaction.fields.getTextInputValue('refresh_token_input');

    const store = {
      bearer_token,
      refresh_token,
      expires_at: Date.now() + (config.defaultExpirySeconds || 3600) * 1000,
      last_refreshed: Date.now(),
    };
    saveStore(store);

    await interaction.reply({ content: 'Token stocked. It will auto-refresh every 5 minutes.', ephemeral: true });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: 'You are not authorized to use this bot.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'stock') {
    const modal = new ModalBuilder().setCustomId('stock_modal').setTitle('Stock Token');

    const bearerInput = new TextInputBuilder()
      .setCustomId('bearer_token_input')
      .setLabel('Bearer Token')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const refreshInput = new TextInputBuilder()
      .setCustomId('refresh_token_input')
      .setLabel('Refresh Token')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(bearerInput);
    const row2 = new ActionRowBuilder().addComponents(refreshInput);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
  }

  if (interaction.commandName === 'generate') {
    const embed = new EmbedBuilder()
      .setTitle('Token Generator')
      .setDescription(
        'Click the button below to generate the current token as a JSON file. It will be DMed to you.\n\nThis token never expires — it auto-refreshes in the background.\n\nCredits: Faxx 👌'
      )
      .setColor(0x5865f2);

    const button = new ButtonBuilder()
      .setCustomId('generate_token_button')
      .setLabel('Generate')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  if (interaction.commandName === 'check') {
    const store = loadStore();

    if (!store.bearer_token || !store.expires_at) {
      await interaction.reply({ content: 'No token stocked yet.', ephemeral: true });
      return;
    }

    const msLeft = store.expires_at - Date.now();
    const valid = msLeft > 0;
    const minutesLeft = Math.floor(msLeft / 60000);

    const embed = new EmbedBuilder()
      .setTitle('Token Status')
      .setColor(valid ? 0x57f287 : 0xed4245)
      .addFields(
        { name: 'Status', value: valid ? 'Valid' : 'Expired', inline: true },
        {
          name: 'Time remaining',
          value: valid ? `${minutesLeft} minute(s)` : 'Expired',
          inline: true,
        },
        {
          name: 'Last refreshed',
          value: store.last_refreshed ? new Date(store.last_refreshed).toLocaleString() : 'Never',
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ---------- command registration ----------

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Slash commands registered.');
}

async function start() {
  try {
    await registerCommands();
  } catch (err) {
    console.error('FATAL: Failed to register slash commands.');
    if (err.status === 401 || err.code === 0) {
      console.error('This usually means DISCORD_TOKEN is wrong. Reset it in the Bot tab and update the Railway variable.');
    } else if (err.status === 404) {
      console.error('This usually means CLIENT_ID or GUILD_ID is wrong, or the bot was never invited to that server.');
    } else {
      console.error(`Details: ${err.message}`);
    }
    process.exit(1);
  }

  try {
    await client.login(config.token);
  } catch (err) {
    console.error('FATAL: Discord login failed. DISCORD_TOKEN is almost certainly wrong or expired.');
    console.error(`Details: ${err.message}`);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled error (bot stayed alive):', err);
});

start();
