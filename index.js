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
const masters = [process.argv[4]];


const botInit = (bot) => {
    bot.loadPlugins([require('mineflayer-pathfinder').pathfinder]);
    console.log(bot.username, 'initalised');
    // Once we've spawn, it is safe to access mcData because we know the version
    const mcData = require('minecraft-data')(bot.version);
    prepFriendlyProtection(mcData);

    const defaultMove = new Movements(bot, mcData);
    defaultMove.allowFreeMotion = true

    bot.on('chat', (username, message) => {
        jobSelector(username, message, bot, masters, chat)
    });
    bot.on('whisper', (username, message) => {
        jobSelector(username, message, bot, masters, chat, true)
    });
    const startTime = Date.now();
    bot.on('health', () => {
        if(Date.now() - startTime < 500) return;
        Utils.attackNearestMob(bot, defaultMove)
    });
    bot.on('kicked', (reason) => console.log("kicked", reason));

    masters.forEach(master => {
        chat.addChat(bot, `I'm online`, master);
    });
};;

const config = {
    host,
    port,
    initCallback: botInit
  };

chat.start();
const swarm = createSwarm(botNames, config, mineflayer);

let haveSetupProtection = false;
const prepFriendlyProtection = (mcData) => {
    if(haveSetupProtection) return;
    swarm[swarm.length -1 ].once('spawn', () => {
        swarm.forEach(bot => {
            const defaultMove = new Movements(bot, mcData);
            defaultMove.allowFreeMotion = true;
        
            swarm.forEach(other => {
                if(other.username != bot.username) {
                    other.on('health', () => Utils.protectFriendly(bot, other, defaultMove));
                }
            });
            masters.forEach(m => {
                let player = bot.players[m];
                if(!player) {
                    console.warn("No player found for auto protect");
                } else {
                    player.entity.on('health', () => Utils.protectFriendly(bot, player, defaultMove));
                }
            });
        });
    });
    haveSetupProtection = true;
}