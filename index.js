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
//https://discord.com/oauth2/authorize?client_id=1528135657132654742&permissions=8584986789675007&scope=bot+applications.commands
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
client.login(process.env.DISCORD_TOKEN);
// Documentation: https://discordjs.guide/legacy/app-creation/main-file

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(process.env.PREFIX + " ")) return;

    const hrib = message.content.substring(process.env.PREFIX.length + 1);
    console.log(`${message.author.username} (${message.author}) zanima ${hrib}`);
    message.channel.sendTyping();

    const { gorovjeId, hribId, hribName, alternativeResults } =
      await getMountainId(hrib);

    // const vremeUrl = `https://www.hribi.net/vreme_hribi_net/000000/250/${gorovjeId}/5/${hribId}`;
    // const image = await renderWeather(vremeUrl);

    let msg = "Vreme za " + hribName;
    if (alternativeResults.length > 0) {
      msg += "\n" + "Poskusi tudi: " + alternativeResults.join(", ");
    }

    //https://www.hribi.net/vreme_gora/triglav/1/1
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
  const url = `https://www.hribi.net/iskalnik.asp?q=${query}`;
  const response = await fetch(url);
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

async function parseTableDay(url) {
  const response = fetch(url);
  const $ = cheerio.load(await (await response).text());
  const items = $("#pan1 div table tbody");
  const htmlItems = [];
  for (let i = 0; i < items.length - 1; i += 2) {
    const first = $.html(items[i]);
    const second = items[i + 1] ? $.html(items[i + 1]) : "";

    htmlItems.push(`<div>${first + second}</div>`);
  }
  return htmlItems;
}

async function parseTableWeek(hribName, gorovjeId, hribId) {
  const url = `https://www.hribi.net/vreme_gora/${hribName}/${gorovjeId}/${hribId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Zahteva propadla: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const tbody = $('a[name="Ne"]').closest("tbody");

  if (!tbody.length) {
    throw new Error(`${hribName} nima vremena`);
  }

  tbody.find("img").each((_, img) => {
    const src = $(img).attr("src");

    if (src?.startsWith("//")) {
      $(img).attr("src", `https:${src}`);
    }
  });

  return `<table>${tbody.html()}</table>`;
}
