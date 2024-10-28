const Utils = require('./utils');
const { Vec3 } = require('vec3');
const Movements = require('mineflayer-pathfinder').Movements

const movementCallback = (returnAddress, bot, chat, target, successful) => {
    const announcement = successful ? `:)` : `I can't get there`;
    chat.addChat(bot, announcement, returnAddress);
}

let stopLearn = null;
const handleChat = (username, message, bot, masters, chat, isWhisper = false, createBotCallback = null) => {
    if (username === bot.username || !masters.includes(username)) return;
    
    // insert bot name for whispers, if not present, for easier parsing
    if (!message.startsWith(bot.username)) message = bot.username + ' ' + message;
    const returnAddress = isWhisper ? username : null; // used for direct response or global chat depending on how we were spoken to
    
    const messageParts = message.split(' ');
    let messageFor = messageParts.shift();
    if (messageFor != bot.username && messageFor != 'swarm') return;
    console.log("Command:", username, messageFor, messageParts);

    let target = bot.players[username].entity;
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData);
    switch (messageParts[0]) {
        case 'come':
            chat.addChat(bot, 'coming', returnAddress);
            Utils.goToTarget(bot, target, defaultMove, 0, (success) => {
                movementCallback(returnAddress, bot, chat, target, success);
            });
            break;
        case 'follow':
            if (messageParts.length > 1) {
                let player = bot.players[messageParts[1]]
                if (player) {
                    target = player.entity;
                } else {
                    chat.addChat(bot, "No-one is called " + messageParts[1], returnAddress);
                    return;
                }
            }
            Utils.follow(bot, target, defaultMove);
            chat.addChat(bot, 'ok', returnAddress);
            break;
        case 'stay':
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
            if (messageParts.length == 1) {
                chat.addChat(bot, "equip what?", returnAddress);
                return;
            }
            Utils.equipByNameDescriptive(bot, messageParts[1], mcData, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });
            break;
        case 'drop':
            if (messageParts.length < 3) {
                chat.addChat(bot, "drop how much of what?", returnAddress);
                return;
            }
            Utils.tossItem(bot, messageParts[2], messageParts[1], username, (msg) => {
                chat.addChat(bot, msg, returnAddress);
            });;
            break;
        case 'harvest':
            if (messageParts.length == 1) {
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
                if (messageParts.length > 3) {
                    let x = parseInt(messageParts[1], 10);
                    let y = parseInt(messageParts[2], 10);
                    let z = parseInt(messageParts[3], 10);
                    chat.addChat(bot, "Ok, on my way", target);
                    Utils.goToTarget(bot, { position: { x, y, z } }, defaultMove, 0, (success) => {
                        movementCallback(returnAddress, bot, chat, target, success);
                    });
                } else {
                    let player = bot.players[messageParts[1]]
                    if (player) {
                        chat.addChat(bot, "Ok, I'll find 'em", target);
                        target = player.entity;
                    } else {
                        if (messageParts[1] == 'home') {
                            let homePos = Utils.getHome(bot);
                            if (homePos) {
                                target = { position: homePos };
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
                let targetPos = { x, y, z };
                Utils.goToTarget(bot, { position: bot.entity.position.add(targetPos) }, defaultMove, 0, (success) => {
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
            let friendlyItemName = itemName.split("_").join(" ");
            let amount = messageParts.length > 2 ? parseInt(messageParts[2]) : 1;
            let craftingTableBlockInfo = Utils.nameToBlock('crafting_table', mcData);

            let craftingTable = bot.findBlockSync({
                matching: craftingTableBlockInfo.id,
                point: bot.entity.position
            })[0];

            Utils.goToTarget(bot, craftingTable, defaultMove, 2, (arrivedSuccessfully) => {
                if (!arrivedSuccessfully && craftingTable != null) return chat.addChat(bot, `Couldn't get to the crafting table`, returnAddress);
                Utils.craft(bot, itemName, mcData, amount, craftingTable, (err) => {
                    if (err) {
                        chat.addChat(bot, `Couldn't make a ${friendlyItemName}`, returnAddress);
                        console.log(err);
                    } else {
                        chat.addChat(bot, `Made the ${friendlyItemName}${amount > 1 && !friendlyItemName.endsWith("s") ? "s" : ""}`, returnAddress);
                    }
                });
            });
            break;
        case 'sethome':
            Utils.setHome(bot, bot.entity.position);
            chat.addChat(bot, "Homely!", returnAddress);
            break;
        case 'where':
            chat.addChat(bot, bot.entity.position.toString(), returnAddress);
            break;
        case 'say':
            messageParts.shift();
            const msgToSend = messageParts.join(' ');
            chat.addChat(bot, `Ok I'll say "${msgToSend}"`, username);
            console.log('repeat', msgToSend);
            chat.addChat(bot, msgToSend, null);
            break;
        case 'use':
            bot.activateItem();
            break;
        case 'disuse':
            bot.deactivateItem();
            break;
        case 'empty':
            Utils.emptyNearestChest(bot, 7, () => { chat.addChat(bot, 'Emptied the chest', returnAddress) });
            break;
        case 'fill':
            const fillUpChest = Utils.nearbyBlocksRawMatching(bot, 7, (block) => block.name == 'chest')[0];
            bot.lookAt(fillUpChest.position, true, () => {
                Utils.fillChest(bot, fillUpChest, () => {
                    chat.addChat(bot, 'Filled the chest', returnAddress);
                });
            });
            break;
        case 'place':
            // place, block, x, y, z
            // 0       1     2  3  4
            if (messageParts.length !== 5) return chat.addChat(bot, 'place what block where?!', returnAddress);
            const position = new Vec3(Number(messageParts[2]), Number(messageParts[3]), Number(messageParts[4]));
            const blockToPlace = messageParts[1];
            Utils.getAdjacentTo(bot, { position }, defaultMove, () => {
                Utils.placeBlockAt(bot, position, blockToPlace, mcData, () => {
                    chat.addChat(bot, `Placed the ${blockToPlace}`, returnAddress);
                });
            });
            break;
        case 'portal':
            // portal, (bl)x, y, z, (tr)x, y, z, (opt)blockname
            // 0           1  2  3      4  5  6         7
            if (messageParts.length < 7) return chat.addChat(bot, 'portal from where to where?!', returnAddress);
            const bottomLeft = new Vec3(Number(messageParts[1]), Number(messageParts[2]), Number(messageParts[3]));
            const topRight = new Vec3(Number(messageParts[4]), Number(messageParts[5]), Number(messageParts[6]));
            const portalBlockName = messageParts.length === 8 ? messageParts[7] : 'obsidian';
            //return console.log(portalBlockName, messageParts, messageParts.length);
            const portalBlock = Utils.nameToBlock(portalBlockName, mcData);
            defaultMove.blocksCantBreak.add(portalBlock.id);
            Utils.goToTarget(bot, { position: bottomLeft }, defaultMove, 5, () => {
                Utils.buildPortal(bot, bottomLeft, topRight, mcData, defaultMove, portalBlockName, () => {
                    chat.addChat(bot, `Built the ${portalBlockName} portal`, returnAddress);
                    defaultMove.blocksCantBreak.delete(portalBlock.id);
                });
            });
            break;
        case 'new':
            if (!createBotCallback) {
                console.warn("Tried to create new bot(s) but no callback provided");
                chat.addChat(bot, `Can't right now`, returnAddress);
                break;
            }
            messageParts.shift();
            // Allow for " ", "," and ", " separated names
            const names = messageParts.reduce((prev, curr) => {
                return [...prev, ...curr.split(",").map(n => n.trim())];
            }, []);
            createBotCallback(names);
            break;
        default:
            chat.addChat(bot, 'What do you mean?', returnAddress);
            return;
    }
};

module.exports = {
    handleChat
};