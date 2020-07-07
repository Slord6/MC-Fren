const Utils = require('./utils');
const Movements = require('mineflayer-pathfinder').Movements

let stopLearn = null;
const handleChat = (username, message, bot, master) => {
    if (username === bot.username || !master.includes(username)) return;
    const messageParts = message.split(' ');
    let messageFor = messageParts.shift();
    if(messageFor != bot.username && messageFor != 'swarm') return;

    let target = bot.players[username].entity;
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData);
    switch(messageParts[0]) {
        case 'come':
            Utils.goToTarget(bot, target, defaultMove);
            break;
        case 'follow':
            if(messageParts.length > 1) {
                let player = bot.players[messageParts[1]]
                if(player) {
                    target = player.entity;
                } else {
                    bot.chat("No-one is called " + messageParts[1]);
                    return;
                }
            }
            Utils.follow(bot, target, defaultMove);
            break;
        case 'stop':
            Utils.stop(bot);
            break;
        case 'info':
            Utils.info(bot, messageParts);
            break;
        case 'hole':
            Utils.hole(bot, messageParts, defaultMove);
            break;
        case 'nearby':
            bot.chat(Utils.nearbyBlocks(bot).join(', '));
            break;
        case 'inventory':
            Utils.sayItems(bot, bot.inventory.items());
            break;
        case 'equip':
            if(messageParts.length == 1) {
                        bot.chat("equip what?");
                return;
            }
            Utils.equipByName(bot, messageParts[1], mcData);
            break;
        case 'drop':
            if(messageParts.length < 3) {
                        bot.chat("drop how much of what?!");
                return;
            }
            Utils.tossItem(bot, messageParts[2], messageParts[1], username);
            break;
        case 'harvest':
            if(messageParts.length == 1) {
                        bot.chat("Harvest how much of what!?");
                return;
            }
            Utils.harvest(bot, messageParts[2], defaultMove, parseInt(messageParts[1], 10), mcData);
            break;
        case 'collect':
            Utils.collectDrops(bot, defaultMove, 30, () => bot.chat("Everything's collected"));
            break;
        case 'hunt':
            bot.chat("It's open season, yeehaw!");
            Utils.hunt(bot, defaultMove, parseInt(messageParts[1], 30));
            break;
        case 'goto':
            let goto = (messageParts) => {
                if(messageParts.length > 3) {
                    let x = parseInt(messageParts[1], 10);
                    let y = parseInt(messageParts[2], 10);
                    let z = parseInt(messageParts[3], 10);
                    Utils.goToTarget(bot, { position: { x, y, z }}, defaultMove, 0);
                } else {
                    let player = bot.players[messageParts[1]]
                    if(player) {
                        target = player.entity;
                    } else {
                        if(messageParts[1] == 'home') {
                            let homePos = Utils.getHome(bot);
                            if(homePos) {
                                target = {position: homePos};
                            } else {
                                bot.chat("I'm homeless, I've got no home to go to");
                                return;
                            }
                        } else {
                            bot.chat("No-one is called " + messageParts[1]);
                            return;
                        }
                    }
                    Utils.goToTarget(bot, target, defaultMove, 1);
                }
            };
            goto(messageParts);
            break;
        case 'move':
            let move = (messageParts) => {
                let x = parseInt(messageParts[1], 10);
                let y = parseInt(messageParts[2], 10);
                let z = parseInt(messageParts[3], 10);
                let targetPos = {x,y,z};
                Utils.goToTarget(bot, { position: bot.entity.position.add(targetPos)}, defaultMove, 0);
            };
            move(messageParts);
            break;
        case 'learn':
            Utils.learn(bot, target, console.log);
            break;
        case 'recite':
            Utils.finishLearn(bot);
            break;
        case 'craft':
            let itemName = messageParts[1];
            let ctItem = Utils.nameToItem(bot, 'crafting_table', mcData);
            console.log(ctItem);
            let craftingTable = bot.findBlock({
                matching: ctItem.id
              });
            console.log('craftingt', craftingTable);
            // craftingTable = null;
            console.log(craftingTable);
            let x = Utils.craft(bot, itemName, mcData, 1, craftingTable, (err) => {
                if(err) {
                    console.log(err);
                    bot.chat(`Couldn't make a ${itemName}`);
                } else {
                    bot.chat(`Made the ${itemName}`);
                }
            });
            if(x === null) bot.chat("failed");
            break;
        case 'sethome':
            Utils.setHome(bot, bot.entity.position);
            bot.chat("Homely!");
            break;
        default:
            bot.chat('I don\'t understand');
            return;
  }
};

module.exports = {
    handleChat
};