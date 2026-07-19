require("dotenv").config();
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const path = require("path");
const nodeHtmlToImage = require('node-html-to-image')

const { Client, Events, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
client.login(process.env.DISCORD_TOKEN);
// Documentation: https://discordjs.guide/legacy/app-creation/main-file
// Invite url: https://discord.com/oauth2/authorize?client_id=1528135657132654742&permissions=8584986789675007&scope=bot+applications.commands

const hribUrl = (hribName, gorovjeId, hribId) => `https://www.hribi.net/gora/${hribName}/${gorovjeId}/${hribId}`;
const hribSearch = (query) => `https://www.hribi.net/iskalnik.asp?q=${query}`;
const hribVreme = (hribName, gorovjeId, hribId) => `https://www.hribi.net/vreme_gora/${hribName}/${gorovjeId}/${hribId}`;

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(process.env.PREFIX + " ")) return;

    const hrib = message.content.substring(process.env.PREFIX.length + 1);
    console.log(`${message.author.username} (${message.author}) zanima ${hrib}`);
    message.channel.sendTyping();

    const { gorovjeId, hribId, hribName, alternativeResults } =
      await getMountainId(hrib);  

    let msg = `Vreme za [${hribName}](<${hribUrl(hribName, gorovjeId, hribId)}>)`;
    const visina = await getVisina(hribName, gorovjeId, hribId);
    if (visina !== undefined) msg += ` (${visina})`

    if (alternativeResults.length > 0) {
      msg += "\n" + "(Poskusi tudi: " + alternativeResults.join(", ") + ")";
    }

    const table = await parseTableWeek(hribName, gorovjeId, hribId);
    const imagePath = path.join(__dirname, "weather.png");

    await nodeHtmlToImage({
      output: imagePath,
      html: table,
      puppeteerArgs: {
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox'],
      }
    });

    await message.reply({
      content: msg,
      files: [
        {
          attachment: imagePath,
          name: "weather.png",
        },
      ],
    });
  } catch (error) {
    console.error("Sm sporoču ampak", error);
    try {
      await message.reply({
        content: error.message,
        files: [
          {
            attachment: "grob.png",
            name: "grob.png",
          },
        ],
      });
    }
    catch (error2) {
      console.error(error, error2);
    }
  }
});

const getMountainId = async (query) => {
  const response = await fetch(hribSearch(query));
  const html = await response.text();

  const $ = cheerio.load(html);

  const allResults = $(".iskanjenaslov").filter((_, el) => {
      const href = $(el).attr("href") || "";
      return href.includes("/gora/");
    });
  const firstResult = allResults.first();
  const alternativeResults = allResults
    .map((_, el) => $(el).text().trim())
    .get()
    .splice(1);

  const href = firstResult.attr("href");
  const hribName = firstResult.text();
  try {
    const id = href.split("/").slice(3).join("/");
    const [gorovjeId, hribId] = id.split("/");
    if (hribId === undefined)
      // bo ujeu spodnji "Ni rezultatov."
      throw new Error("userji se");
    return { gorovjeId, hribId, hribName, alternativeResults };
  }
  catch (error) {
    throw new Error("Ni rezultatov.");
  }
};

async function parseTableWeek(hribName, gorovjeId, hribId) {
  const response = await fetch(hribVreme(hribName, gorovjeId, hribId));

  if (!response.ok) {
    throw new Error(`Zahteva propadla: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const tbody = $('.divvrem1').closest("tbody");

  if (!tbody.length) {
    throw new Error(`[${hribName}](<${hribUrl(hribName, gorovjeId, hribId)}>) nima vremena`);
  }

  tbody.find("img").each((_, img) => {
    const src = $(img).attr("src");

    if (src?.startsWith("//")) {
      $(img).attr("src", `https:${src}`);
    }
  });

  return `<table>${tbody.html()}</table>`;
}

const getVisina = async (hribName, gorovjeId, hribId) =>{
    try {
      const url = hribUrl(hribName, gorovjeId, hribId);
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      const visina = $('b').filter((_, el)=>$(el).text().trim() == "Višina:").get(0).nextSibling.nodeValue.trim();
      return visina
    } catch(error) {
      console.error(error);
      console.error("ni višine :(");
      return undefined;
    }
}
