import { IndexedData } from "minecraft-data";
import { Bot } from "mineflayer";
import { Behaviours } from "./utils";
import { ChatBuffer } from "./chat";
import { Individual } from "./individual";
import { Swarm, SwarmConfig } from "./swarm";

const mineflayer = require('mineflayer');
const { Movements } = require('mineflayer-pathfinder');

const utils = new Behaviours();
const chat = new ChatBuffer();
const botNames: string[] = [
    'QuailBotherer'
];
const host: string = process.argv[2];
const port: number = parseInt(process.argv[3], 10);
const password: string = process.argv[4];
const masters: string[] = [process.argv[5]];

console.log(`Starting: Bots: ${botNames}, ${host}:${port}. Controllers: ${masters}. Pass set = ${!!password}`);

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const autoLogin = async (bot: Bot) => {
    await sleep(3000);
    console.log("Auto logging in...");
    chat.addChat(bot, `/register ${password} ${password}`);
    chat.addChat(bot, `/login ${password}`);
};

const newBots = (names: string[]) => {
    const newBots = Swarm.Create(names, botConfig);
    console.log(`Created ${names} (${newBots.map((nb: Bot) => nb.username)}). Waiting for spawns..`);

    let counter = 0;
    newBots.forEach((bot: Bot) => {
        bot.once('spawn', () => {
            counter++;
            console.log("Spawned", bot.username, `(${counter}/${newBots.length})`);
            if(counter === newBots.length) {
                newBots.forEach((b: Bot) => swarm.push(b));
                console.log("All bots now:", swarm.map((b: Bot) => b.username));
            }
        });
    });
}

const botInit = (bot: Bot) => {
    console.log(`[${bot.username}] Loading plugins...`);
    bot.loadPlugins([require('mineflayer-pathfinder').pathfinder, require('mineflayer-armor-manager'), require('mineflayer-blockfinder')(mineflayer)]);
    console.log(bot.username, 'initalised');

    // Once we've spawn, it is safe to access mcData because we know the version
    const mcData: IndexedData = require('minecraft-data')(bot.version);
    prepFriendlyProtection(mcData, swarm);

    const defaultMove = new Movements(bot, mcData);
    defaultMove.allowFreeMotion = true

    const individual: Individual = new Individual(bot, chat);
    bot.on('chat', (username: string, message: string) => {
        console.log(`[Msg>${bot.username}]`, username, message);
        try {
            individual.handleChat(username, message, bot, masters, false, newBots)
        } catch (err) {
            console.log(err);
            chat.addChat(bot, `Can't, sorry`, username);
        }
    });
    bot.on('whisper', (username: string, message: string) => {
        console.log(`[Whisper>${bot.username}]`, username, message);
        try {
            individual.handleChat(username, message, bot, masters, true, newBots)
        } catch (err) {
            console.log(err);
            chat.addChat(bot, `Can't, sorry`, username);
        }
    });
    bot.on("end", (reason: string) => {
        console.warn(`${bot.player.username} disconnected! (${reason})`);
    });
    const startTime: number = Date.now();
    bot.on('health', () => {
        if (Date.now() - startTime < 500) return;
        utils.attackNearestMob(bot, defaultMove, () => {});
    });
    bot.on('kicked', (reason: string) => console.log("kicked", reason));
    bot.on('error', console.error);

    autoLogin(bot);

    masters.forEach(master => {
        chat.addChat(bot, `I'm online`, master);
    });
};

let haveSetupProtection = false;
const prepFriendlyProtection = (mcData: IndexedData, swarm: Bot[]) => {
    if (haveSetupProtection) return;
    swarm[swarm.length - 1].once('spawn', () => {
        swarm.forEach(bot => {
            const defaultMove = new Movements(bot, mcData);
            defaultMove.allowFreeMotion = true;

            swarm.forEach(other => {
                if (other.username != bot.username) {
                    other.on('health', () => utils.protectFriendly(bot, other, defaultMove));
                }
            });
            masters.forEach(m => {
                let player = bot.players[m];
                if (!player) {
                    console.warn("No player found for auto protect");
                } else {
                    while (!player.entity) { }
                    player.entity.on('health', () => utils.protectFriendly(bot, player, defaultMove));
                }
            });
        });
    });
    haveSetupProtection = true;
}

const botConfig: SwarmConfig = {
    host,
    port,
    version: '1.20.1',
    initCallback: botInit
};

chat.start();
const swarm = Swarm.Create(botNames, botConfig);