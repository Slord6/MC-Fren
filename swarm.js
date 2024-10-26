
/**
 * Create a swarm with each bot having a name from the given array
 * @param {[]} botNames A config item for each bot
 * @param {mineflayer} mineflayer Mineflayer instance
 * @returns {Swarm} The swarm
 */
const createSwarm = (botNames, botConf, mineflayer) => {
    const initBot = (name) => {
        const bot = mineflayer.createBot({ ...botConf, username: name});
        console.log(`Bot ${name} created`);
      
        bot.once('spawn', botConf.initCallback.bind(this, bot));
        return bot;
    };

    const bots = [];
    botNames.forEach(name => bots.push(initBot(name)));

    return bots;
}

module.exports = {
    createSwarm: createSwarm
}