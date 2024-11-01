import { Bot } from "mineflayer";
import { ChatBuffer } from "./chat";
import { Behaviours } from "./utils";
import { Movements } from "mineflayer-pathfinder";
import { IndexedData } from "minecraft-data";
import { Vec3 } from "vec3";
import { RecipeTree } from "./RecipeTree";

export class Individual {
    private utils: Behaviours;
    private chat: ChatBuffer;
    private bot: Bot;
    private defaultMove: Movements;
    private mcData: IndexedData;

    constructor(bot: Bot, chat: ChatBuffer) {
        this.utils = new Behaviours();
        this.chat = chat;
        this.bot = bot;
        this.mcData = require('minecraft-data')(this.bot.version);
        this.defaultMove = new Movements(this.bot);
    }

    private movementCallback(returnAddress: string | null, successful: boolean) {
        const announcement = successful ? `:)` : `I can't get there`;
        this.chat.addChat(this.bot, announcement, returnAddress);
    }

    private goto(messageParts: string[], returnAddress: string | null): void {
        if (messageParts.length > 3) {
            let x = parseInt(messageParts[1], 10);
            let y = parseInt(messageParts[2], 10);
            let z = parseInt(messageParts[3], 10);
            this.chat.addChat(this.bot, "Ok, on my way", returnAddress);
            this.utils.goToTarget(this.bot, { position: { x, y, z } }, this.defaultMove, 0, (success) => {
                this.movementCallback(returnAddress, success);
            });
        } else {
            let player = this.bot.players[messageParts[1]]
            let target: { position: Vec3 } = player.entity;
            if (player) {
                this.chat.addChat(this.bot, "Ok, I'll find 'em", returnAddress);
            } else {
                if (messageParts[1] == 'home') {
                    let homePos = this.utils.getHome(this.bot);
                    if (homePos) {
                        target = { position: homePos };
                    } else {
                        this.chat.addChat(this.bot, "I'm homeless, I've got no home to go to", returnAddress);
                        return;
                    }
                } else {
                    this.chat.addChat(this.bot, "No-one is called " + messageParts[1], returnAddress);
                    return;
                }
            }
            this.utils.goToTarget(this.bot, target, this.defaultMove, 1, (success) => {
                this.movementCallback(returnAddress, success);
            });
        }
    };

    public handleChat(username: string, message: string, bot: Bot, masters: string[],
        isWhisper: boolean = false, createBotCallback: ((names: string[]) => void) | null = null) {
        if (username === this.bot.username || !masters.includes(username)) return;

        // insert bot name for whispers, if not present, for easier parsing
        if (!message.startsWith(this.bot.username)) message = this.bot.username + ' ' + message;
        const returnAddress = isWhisper ? username : null; // used for direct response or global chat depending on how we were spoken to

        const messageParts = message.split(' ');
        let messageFor = messageParts.shift();
        if (messageFor != this.bot.username && messageFor != 'swarm') return;
        console.log("Command:", username, messageFor, messageParts);

        let target = this.bot.players[username].entity;
        switch (messageParts[0]) {
            case 'come':
                this.chat.addChat(this.bot, 'coming', returnAddress);
                this.utils.goToTarget(this.bot, target, this.defaultMove, 0, (success: boolean) => {
                    this.movementCallback(returnAddress, success);
                });
                break;
            case 'follow':
                if (messageParts.length > 1) {
                    let player = this.bot.players[messageParts[1]]
                    if (player) {
                        target = player.entity;
                    } else {
                        this.chat.addChat(this.bot, "No-one is called " + messageParts[1], returnAddress);
                        return;
                    }
                }
                this.utils.follow(this.bot, target, this.defaultMove);
                this.chat.addChat(this.bot, 'ok', returnAddress);
                break;
            case 'avoid':
                if (messageParts.length > 1) {
                    let player = this.bot.players[messageParts[1]]
                    if (player) {
                        target = player.entity;
                    } else {
                        this.chat.addChat(this.bot, "No-one is called " + messageParts[1], returnAddress);
                        return;
                    }
                }
                this.utils.avoid(this.bot, target, this.defaultMove);
                this.chat.addChat(this.bot, 'ok', returnAddress);
                break;
            case 'shift':
                this.utils.shift(this.bot, this.defaultMove);
                break;
            case 'stay':
            case 'stop':
                this.utils.stop(bot);
                this.chat.addChat(this.bot, 'ok', returnAddress);
                break;
            case 'info':
                this.chat.addChat(this.bot, this.utils.info(this.bot, messageParts), returnAddress);
                break;
            case 'hole':
                this.utils.hole(this.bot, messageParts, this.defaultMove, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });
                break;
            case 'nearby':
                this.chat.addChat(this.bot, this.utils.nearbyBlocks(bot).join(', '), returnAddress);
                break;
            case 'inventory':
                this.chat.addChat(this.bot, this.utils.inventoryAsString(this.bot), returnAddress);
                break;
            case 'equip':
                if (messageParts.length == 1) {
                    this.chat.addChat(this.bot, "equip what?", returnAddress);
                    return;
                }
                this.utils.equipByNameDescriptive(this.bot, messageParts[1], this.mcData, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });
                break;
            case 'drop':
            case 'gimme':
                if (messageParts.length < 3) {
                    this.chat.addChat(this.bot, "drop how much of what?", returnAddress);
                    return;
                }
                this.utils.tossItem(this.bot, messageParts[2], messageParts[1], username, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });;
                break;
            case 'harvest':
                if (messageParts.length == 1) {
                    this.chat.addChat(this.bot, "Harvest how much of what!?", returnAddress);
                    return;
                }
                this.utils.harvest(this.bot, messageParts[2], this.defaultMove, parseInt(messageParts[1], 10), this.mcData, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });
                break;
            case 'collect':
                this.utils.collectDrops(this.bot, this.defaultMove, 30, () => this.chat.addChat(this.bot, "Everything's collected", returnAddress));
                break;
            case 'hunt':
                this.chat.addChat(this.bot, "I'm off hunting", returnAddress);
                this.utils.hunt(this.bot, this.defaultMove, parseInt(messageParts[1], 30), 30, () => {
                    this.chat.addChat(this.bot, 'finished hunting', returnAddress);
                });
                break;
            case 'protect':
                this.chat.addChat(this.bot, "I'm on it", returnAddress);
                this.utils.attackNearestMob(this.bot, this.defaultMove, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });
                break;
            case 'goto':
            case 'go':
                this.goto(messageParts, returnAddress);
                break;
            case 'move':
                let move = (messageParts: string[]) => {
                    const x = parseInt(messageParts[1], 10);
                    const y = parseInt(messageParts[2], 10);
                    const z = parseInt(messageParts[3], 10);
                    this.utils.goToTarget(this.bot, { position: this.bot.entity.position.add(new Vec3(x, y, z)) }, this.defaultMove, 0, (success) => {
                        this.movementCallback(returnAddress, success);
                    });
                };
                move(messageParts);
                break;
            case 'craft':
                const itemName = messageParts[1];
                const friendlyItemName = itemName.split("_").join(" ");
                const amount = messageParts.length > 2 ? parseInt(messageParts[2]) : 1;
                const craftingTableBlockInfo = this.utils.nameToBlock('crafting_table', this.mcData);

                const craftingTablePos = this.bot.findBlocks({
                    matching: craftingTableBlockInfo.id,
                    point: this.bot.entity.position
                })[0];

                this.utils.goToTarget(this.bot, { position: craftingTablePos }, this.defaultMove, 2, (arrivedSuccessfully) => {
                    if (!arrivedSuccessfully && craftingTablePos != null) return this.chat.addChat(this.bot, `Couldn't get to the crafting table`, returnAddress);
                    this.utils.craft(this.bot, itemName, this.mcData, amount, bot.blockAt(craftingTablePos), (err) => {
                        if (err) {
                            this.chat.addChat(this.bot, `Couldn't make a ${friendlyItemName}`, returnAddress);
                            console.log(err);
                        } else {
                            this.chat.addChat(this.bot, `Made the ${friendlyItemName}${amount > 1 && !friendlyItemName.endsWith("s") ? "s" : ""}`, returnAddress);
                        }
                    });
                });
                break;
            case 'sethome':
                this.utils.setHome(this.bot, this.bot.entity.position);
                this.chat.addChat(this.bot, "Homely!", returnAddress);
                break;
            case 'where':
                this.chat.addChat(this.bot, this.bot.entity.position.toString(), returnAddress);
                break;
            case 'say':
                messageParts.shift();
                const msgToSend = messageParts.join(' ');
                this.chat.addChat(this.bot, `Ok I'll say "${msgToSend}"`, username);
                console.log('repeat', msgToSend);
                this.chat.addChat(this.bot, msgToSend, null);
                break;
            case 'use':
                this.bot.activateItem();
                break;
            case 'disuse':
                this.bot.deactivateItem();
                break;
            case 'empty':
                this.utils.emptyNearestChest(this.bot, 7, () => { this.chat.addChat(this.bot, 'Emptied the chest', returnAddress) });
                break;
            case 'fill':
                this.utils.emptyNearestChest(this.bot, 7, () => { this.chat.addChat(this.bot, 'Filled the chest', returnAddress), true });
                break;
            case 'place':
                // place, block, x, y, z
                // 0       1     2  3  4
                if (messageParts.length !== 5) return this.chat.addChat(this.bot, 'place what block where?!', returnAddress);
                const position = new Vec3(Number(messageParts[2]), Number(messageParts[3]), Number(messageParts[4]));
                const blockToPlace = messageParts[1];
                this.utils.getAdjacentTo(this.bot, { position }, this.defaultMove, () => {
                    this.utils.placeBlockAt(this.bot, position, blockToPlace, this.mcData, () => {
                        this.chat.addChat(this.bot, `Placed the ${blockToPlace}`, returnAddress);
                    });
                });
                break;
            case 'portal':
                // portal, (bl)x, y, z, (tr)x, y, z, (opt)blockname
                // 0           1  2  3      4  5  6         7
                if (messageParts.length < 7) return this.chat.addChat(this.bot, 'portal from where to where?!', returnAddress);
                const bottomLeft = new Vec3(Number(messageParts[1]), Number(messageParts[2]), Number(messageParts[3]));
                const topRight = new Vec3(Number(messageParts[4]), Number(messageParts[5]), Number(messageParts[6]));
                const portalBlockName = messageParts.length === 8 ? messageParts[7] : 'obsidian';
                //return console.log(portalBlockName, messageParts, messageParts.length);
                const portalBlock = this.utils.nameToBlock(portalBlockName, this.mcData);
                this.defaultMove.blocksCantBreak.add(portalBlock.id);
                this.utils.goToTarget(this.bot, { position: bottomLeft }, this.defaultMove, 5, () => {
                    this.utils.buildPortal(this.bot, bottomLeft, topRight, this.mcData, this.defaultMove, portalBlockName, () => {
                        this.chat.addChat(this.bot, `Built the ${portalBlockName} portal`, returnAddress);
                        this.defaultMove.blocksCantBreak.delete(portalBlock.id);
                    });
                });
                break;
            case 'new':
                if (!createBotCallback) {
                    console.warn("Tried to create new bot(s) but no callback provided");
                    this.chat.addChat(this.bot, `Can't right now`, returnAddress);
                    break;
                }
                messageParts.shift();
                // Allow for " ", "," and ", " separated names
                const names: string[] = [];
                messageParts.forEach((curr: string) => {
                    names.push(...curr.split(",").map(n => n.trim()));
                });
                createBotCallback(names);
                break;
            case 'sleep':
                this.utils.sleep(this.bot, (msg: string) => {
                    this.chat.addChat(this.bot, msg, returnAddress);
                });
                break;
            case 'worldspawn':
                this.chat.addChat(this.bot, `Heading to spawn`, returnAddress);
                this.utils.goToTarget(this.bot, { position: this.bot.spawnPoint }, this.defaultMove, 2, (success) => this.movementCallback(returnAddress, success));
                break;
            case 'torch':
                this.chat.addChat(this.bot, `Torch? ${this.utils.shouldPlaceTorch(bot)}`, returnAddress);
                break;
            case 'crafttree':
                const doTree = () => {
                    const itemName = messageParts[1];
                    const amount = messageParts.length > 2 ? parseInt(messageParts[2]) : 1;

                    const craftingTableBlockInfo = this.utils.nameToBlock('crafting_table', this.mcData);
                    const craftingTablePos = this.bot.findBlocks({
                        matching: craftingTableBlockInfo.id,
                        point: this.bot.entity.position
                    })[0];
                    const craftingTable = bot.blockAt(craftingTablePos);
                    const tree = new RecipeTree(bot, itemName, amount, this.mcData, craftingTable);
                    tree.print();
                };
                doTree();
                break;
            default:
                this.chat.addChat(this.bot, 'What do you mean?', returnAddress);
                return;
        }
    };
}