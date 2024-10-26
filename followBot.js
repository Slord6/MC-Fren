const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear } = require('mineflayer-pathfinder').goals
const bot = mineflayer.createBot({ username: 'pathfinder', host: 'localhost', port: 53925, version: '1.16.4' })


bot.on('kicked', console.log);
bot.on('error', console.log);

bot.loadPlugin(pathfinder)
let done = false;

bot.once('spawn', () => {

  const mcData = require('minecraft-data')(bot.version)
  bot.chat("Hello");

  const defaultMove = new Movements(bot, mcData)
  


  bot.on('chat', function(username, message) {
  
    if (username === bot.username) return

    const target = bot.players[username] ? bot.players[username].entity : null
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
     
    };
});
});
