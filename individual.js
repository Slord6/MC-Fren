const Utils = require('./utils');
const Movements = require('mineflayer-pathfinder').Movements

const movementCallback = (returnAddress, bot, chat, target, successful) => {
    const announcement = successful ? `got there` : `can't get there`;
    chat.addChat(bot, announcement, returnAddress);
}

let stopLearn = null;
const handleChat = (username, message, bot, masters, chat, isWhisper = false) => {
    console.log(username, message);
    if (username === bot.username || !masters.includes(username)) return;
    
    // insert bot name for whispers, if not present for easier parsing
    if(isWhisper && !message.startsWith(bot.username)) message = bot.username + ' ' + message;
    const returnAddress = isWhisper ? username : null; // used for direct response or global chat depending on how we were spoken to
    
    const messageParts = message.split(' ');
    let messageFor = messageParts.shift();
    if(messageFor != bot.username && messageFor != 'swarm') return;

    let target = bot.players[username].entity;
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData);
    switch(messageParts[0]) {
        case 'come':
            Utils.goToTarget(bot, target, defaultMove, 0, (success) => {
                movementCallback(returnAddress, bot, chat, target, success);
            });
            break;
        case 'follow':
            if(messageParts.length > 1) {
                let player = bot.players[messageParts[1]]
                if(player) {
                    target = player.entity;
                } else {
                    chat.addChat(bot, "No-one is called " + messageParts[1], returnAddress);
                    return;
                }
            }
            Utils.follow(bot, target, defaultMove);
            chat.addChat(bot, 'ok', returnAddress);
            break;
        case 'stop':
            Utils.stop(bot);
            chat.addChat(bot, 'ok', returnAddress);
            break;
        case 'info':
            chat.addChat(bot, Utils.info(bot, messageParts), returnAddress);
            break;
        case 'hole':
            Utils.hole(bot, messageParts, defaultMove, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });
            break;
        case 'nearby':
            chat.addChat(bot, Utils.nearbyBlocks(bot).join(', '), returnAddress);
            break;
        case 'inventory':
            chat.addChat(bot, Utils.inventoryAsString(bot, bot.inventory.items()), returnAddress);
            break;
        case 'equip':
            if(messageParts.length == 1) {
                chat.addChat(bot, "equip what?", returnAddress);
                return;
            }
            Utils.equipByName(bot, messageParts[1], mcData, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });
            break;
        case 'drop':
            if(messageParts.length < 3) {
                chat.addChat(bot, "drop how much of what?", returnAddress);
                return;
            }
            Utils.tossItem(bot, messageParts[2], messageParts[1], username, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });;
            break;
        case 'harvest':
            if(messageParts.length == 1) {
                        chat.addChat(bot, "Harvest how much of what!?", returnAddress);
                return;
            }
            Utils.harvest(bot, messageParts[2], defaultMove, parseInt(messageParts[1], 10), mcData, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });
            break;
        case 'collect':
            Utils.collectDrops(bot, defaultMove, 30, () => chat.addChat(bot, "Everything's collected", returnAddress));
            break;
        case 'hunt':
            chat.addChat(bot, "I'm off hunting", returnAddress);
            Utils.hunt(bot, defaultMove, parseInt(messageParts[1], 30), 30, () => {
                chat.addChat(bot, 'finished hunting', returnAddress);
            });
            break;
        case 'protect':
            chat.addChat(bot, "I'm on it", returnAddress);
            Utils.attackNearestMob(bot, defaultMove, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });
            break;
        case 'goto':
        case 'go':
            let goto = (messageParts) => {
                if(messageParts.length > 3) {
                    let x = parseInt(messageParts[1], 10);
                    let y = parseInt(messageParts[2], 10);
                    let z = parseInt(messageParts[3], 10);
                    Utils.goToTarget(bot, { position: { x, y, z }}, defaultMove, 0, (success) => {
                        movementCallback(returnAddress, bot, chat, target, success);
                    });
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
                                chat.addChat(bot, "I'm homeless, I've got no home to go to", returnAddress);
                                return;
                            }
                        } else {
                            chat.addChat(bot, "No-one is called " + messageParts[1], returnAddress);
                            return;
                        }
                    }
                    Utils.goToTarget(bot, target, defaultMove, 1, (success) => {
                        movementCallback(returnAddress, bot, chat, target, success);
                    });
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
                Utils.goToTarget(bot, { position: bot.entity.position.add(targetPos)}, defaultMove, 0, (success) => {
                    movementCallback(returnAddress, bot, chat, target, success);
                });
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
                    chat.addChat(bot, `Couldn't make a ${itemName}`, returnAddress);
                    console.log(err);
                } else {
                    chat.addChat(bot, `Made the ${itemName}`, returnAddress);
                }
            });
            if(x === null) chat.addChat(bot, "failed", returnAddress);
            break;
        case 'sethome':
            Utils.setHome(bot, bot.entity.position);
            chat.addChat(bot, "Homely!", returnAddress);
            break;
        case 'say':
            messageParts.shift();
            const msgToSend = messageParts.join(' ');
            chat.addChat(bot, `Ok I'll say "${msgToSend}"`, username);
            console.log('repeat', msgToSend);
            chat.addChat(bot, msgToSend, null);
            break;
        default:
            chat.addChat(bot, 'I don\'t understand', returnAddress);
            return;
  }
};

module.exports = {
    handleChat
};