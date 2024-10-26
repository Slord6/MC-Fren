const mineflayer = require('mineflayer');
const { Movements } = require('mineflayer-pathfinder');
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals;
const { createSwarm } = require('./swarm');
const chat = require('./chat');
const jobSelector = require('./individual').handleChat;
const Utils = require('./utils');

let botNames = [
    'Annie',
    'Baldwin',
    'Claire',
    'Dennis'
];
const host = process.argv[2];
const port = parseInt(process.argv[3], 10);
let password = process.argv[4];
const masters = [process.argv[5]];

console.log(`Starting: Bots: ${botNames}, ${host}:${port}. Controllers: ${masters}. Pass set = ${!!password}`);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const autoLogin = async (bot) => {
    await sleep(3000);
    console.log("Auto logging in...");
    chat.addChat(bot, `/register ${password} ${password}`);
    chat.addChat(bot, `/login ${password}`);
    password = null;
};

const botInit = (bot) => {
    console.log(`[${bot.username}] Loading plugins...`);
    bot.loadPlugins([require('mineflayer-pathfinder').pathfinder, require('mineflayer-armor-manager'), require('mineflayer-blockfinder')(mineflayer)]);
    console.log(bot.username, 'initalised');
    // Once we've spawn, it is safe to access mcData because we know the version
    const mcData = require('minecraft-data')(bot.version);
    prepFriendlyProtection(mcData);

    const defaultMove = new Movements(bot, mcData);
    defaultMove.allowFreeMotion = true

    bot.on('chat', (username, message, x, y, z) => {
        jobSelector(username, message, bot, masters, chat)
    });
    bot.on('whisper', (username, message) => {
        jobSelector(username, message, bot, masters, chat, true)
    });
    const startTime = Date.now();
    bot.on('health', () => {
        if (Date.now() - startTime < 500) return;
        Utils.attackNearestMob(bot, defaultMove)
    });
    bot.on('kicked', (reason) => console.log("kicked", reason));
    bot.on('error', console.log);

    autoLogin(bot);

    masters.forEach(master => {
        chat.addChat(bot, `I'm online`, master);
    });
};;

let haveSetupProtection = false;
const prepFriendlyProtection = (mcData) => {
    if (haveSetupProtection) return;
    swarm[swarm.length - 1].once('spawn', () => {
        swarm.forEach(bot => {
            const defaultMove = new Movements(bot, mcData);
            defaultMove.allowFreeMotion = true;

            swarm.forEach(other => {
                if (other.username != bot.username) {
                    other.on('health', () => Utils.protectFriendly(bot, other, defaultMove));
                }
            });
            masters.forEach(m => {
                let player = bot.players[m];
                if (!player) {
                    console.warn("No player found for auto protect");
                } else {
                    while (!player.entity) { }
                    player.entity.on('health', () => Utils.protectFriendly(bot, player, defaultMove));
                }
            });
        });
    });
    haveSetupProtection = true;
}

const config = {
    host,
    port,
    version: '1.16.4',
    initCallback: botInit
};

chat.start();
const swarm = createSwarm(botNames, config, mineflayer);