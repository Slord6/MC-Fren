const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
let mcData;

const bot = mineflayer.createBot({
    host: process.argv[2],
    port: parseInt(process.argv[3]),
    username: process.argv[4] ? process.argv[4] : 'botfren',
    password: process.argv[5]
});

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {

    mcData = require('minecraft-data')(bot.version)

    const defaultMove = new Movements(bot, mcData);

    bot.on("health", () => {
        const hostiles = Object.values(bot.entities)
            .filter(entity => entity.kind === 'Hostile mobs')
            .sort((mobA, mobB) => {
                return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
            });

        if (hostiles.length > 0) {
            const hostile = hostiles[0];
            if (hostile.position.distanceTo(bot.entity.position) < 10) {
                kill(defaultMove, [hostile], () => bot.chat("Sorted myself out"));
            }
        }
    });

    bot.on('chat', function (username, message) {

        if (username === bot.username) return
        const pass = "pal ";
        if (!message.startsWith(pass)) {
            return;
        }
        message = message.split(pass)[1];
        const messageParts = message.split(' ');

        const target = bot.players[username] ? bot.players[username].entity : null

        switch (messageParts[0]) {
            case 'come':
                goToTarget(target, defaultMove);
                break;
            case 'follow':
                follow(target, defaultMove);
                break;
            case 'stop':
                stop();
                break;
            case 'info':
                info(messageParts);
                break;
            case 'hole':
                hole(messageParts, defaultMove);
                break;
            case 'nearby':
                bot.chat(nearbyBlocks().join(', '));
                break;
            case 'inventory':
                sayItems(bot.inventory.items());
                break;
            case 'equip':
                if (messageParts.length == 1) {
                    bot.chat("equip what?");
                    return;
                }
                equipByName(messageParts[1]);
                break;
            case 'drop':
                if (messageParts.length < 3) {
                    bot.chat("drop how much of what?!");
                    return;
                }
                tossItem(messageParts[2], messageParts[1], username);
                break;
            case 'harvest':
                if (messageParts.length == 1) {
                    bot.chat("Harvest how much of what!?");
                    return;
                }
                harvest(messageParts[2], defaultMove, parseInt(messageParts[1], 10));
                break;
            case 'collect':
                collectDrops(defaultMove, null, 30, () => bot.chat("Everything's collected"));
                break;
            case 'hunt':
                bot.chat("It's open season, yeehaw!");
                hunt(defaultMove, parseInt(messageParts[1], 30));
                break;
            default:
                bot.chat('I don\'t understand');
                return;
        }
        bot.chat("okeydoke fren");

        bot.on('error', console.log);
    });
});

function hunt(movement, amount, maxDist = 30) {
    const mobs = Object.values(bot.entities)
        .filter(entity => entity.kind === 'Passive mobs')
        .filter(mob => !['squid', 'horse', 'salmon', 'wolf'].includes(mob.name))
        .filter(mob => mob.position.distanceTo(bot.entity.position) < maxDist)
        .sort((mobA, mobB) => {
            return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
        }).slice(0, amount);
    kill(movement, mobs, () => {
        bot.chat(`Finished hunting`);
    });
}

function kill(movement, mobs, cb) {
    if (mobs.length == 0) return cb();
    const tool = bestTool({ material: 'flesh' });
    if (tool) {
        bot.equip(tool, 'hand');
    }
    const mob = mobs.shift();

    bot.lookAt(mob.position);

    follow(mob, movement);
    const attackLoop = () => {
        if (mob.isValid) {
            bot.attack(mob);
            setTimeout(attackLoop, 100);
        } else {
            collectDrops(movement, null, 10, () => {
                setImmediate(kill.bind(this, movement, mobs, cb));
            });
        }
    }
    bot.chat("Stalking a " + mob.name);
    attackLoop();
}

function collectDrops(movement, drops, maxDist, cb) {
    if (!drops) drops = Object.values(bot.entities)
        .filter(entity => entity.kind === 'Drops')
        .filter(drop => drop.position.distanceTo(bot.entity.position) < maxDist)
        .sort((dropA, dropB) => {
            return (dropA.position.distanceTo(bot.entity.position) - dropB.position.distanceTo(bot.entity.position));
        });
    if (drops.length == 0) {
        cb();
        return;
    }
    goToTarget(drops.shift(), movement, 0, () => {
        setImmediate(collectDrops.bind(this, movement, drops, maxDist, cb));
    });
}

function harvest(blockName, movement, amount) {
    if (amount <= 0) return bot.chat(`I collected all the ${blockName} you asked for`);

    const lookupBlock = mcData.blocksByName[blockName];
    if (!lookupBlock) return bot.chat(`What's a ${blockName}?`);
    const id = lookupBlock.id;

    let block = bot.findBlock({
        matching: id,
        point: bot.entity.position,
        maxDistance: 30
    });

    if (!block) {
        bot.chat(`Can't see any more ${blockName} nearby`);
        return;
    } else {
        bot.lookAt(block.position);
        goToTarget(block, movement, 2, () => {
            digBlockAt(block.position, () => {
                collectDrops(movement, null, 5, () => {
                    harvest(blockName, movement, --amount);
                });
            });
        });
    }
}

function itemByName(name) {
    return bot.inventory.items().filter(item => item.name === name)[0];
}

function tossItem(name, amount, toPerson) {
    bot.lookAt(bot.players[toPerson].entity.position, false, () => {
        amount = parseInt(amount, 10);
        const item = itemByName(name);
        if (!item) {
            bot.chat(`I have no ${name}`);
        } else if (amount) {
            bot.toss(item.type, null, amount, checkIfTossed);
        } else {
            bot.tossStack(item, checkIfTossed);
        }

        function checkIfTossed(err) {
            if (err) {
                bot.chat(`might be a few short of what you wanted`);
            } else {
                bot.chat(`dropped the ${name}`);
            }
        }
    });
}

function nearbyBlocks(maxDist = 30) {
    bot.chat('One sec, just counting blocks...');
    let nearbyBlocks = {};
    for (let y = maxDist * -1; y <= maxDist; y++) {
        for (let x = maxDist * -1; x <= maxDist; x++) {
            for (let z = maxDist * -1; z <= maxDist; z++) {
                let block = bot.blockAt(bot.entity.position.offset(x, y, z));

                if (bot.blockAt(block.position.offset(0, 1, 0)).name != 'air') continue;
                if (block.name == 'air' || block.name == 'cave_air') continue;
                nearbyBlocks[block.name] = nearbyBlocks[block.name] ? nearbyBlocks[block.name] + 1 : 1;
            }
        }
    }
    let names = Object.keys(nearbyBlocks);
    let amounts = Object.values(nearbyBlocks);
    return names.map((name, index) => {
        return { name, amount: amounts[index] }
    }).sort((x, y) => y.amount - x.amount).map(x => `${x.name}x${x.amount}`);
}

function itemByNameIndex() {
    let itemsByName
    if (bot.supportFeature('itemsAreNotBlocks')) {
        itemsByName = 'itemsByName'
    } else if (bot.supportFeature('itemsAreAlsoBlocks')) {
        itemsByName = 'blocksByName'
    }
    return itemsByName;
}

function equipByName(name, output = true) {
    const item = mcData[itemByNameIndex()][name];
    if (!item) return bot.chat(`Equip a ${name}? What do you mean?`);

    bot.equip(item.id, 'hand', (err) => {
        if (err) {
            if (output) bot.chat(`unable to equip ${name}, ${err.message}`);
            return false;
        } else {
            if (output) bot.chat(`ok, got ${name}`);
            return true;
        }
    });
}

function sayItems(items) {
    const output = items.map(itemToString).join(', ')
    if (output) {
        bot.chat(output)
    } else {
        bot.chat('nothing')
    }
}

function itemToString(item) {
    if (item) {
        return `${item.name} x ${item.count}`
    } else {
        return '(nothing)'
    }
}

function hole(messageParts, defaultMove) {
    if (messageParts.length < 2) {
        bot.chat("How big though?");
        return;
    }
    // width, length, depth
    const size = messageParts[1].split('x');
    bot.chat(size[0] + " along x, " + size[1] + " along z and " + size[2] + " deep - got it!");
    let offsets = {
        x: Math.floor(Number(size[0]) / 2),
        z: Math.floor(Number(size[1]) / 2),
        y: Math.floor(Number(size[2]))
    }
    const positions = [];
    for (let yO = 0; yO >= offsets.y * -1; yO--) {
        for (let xO = offsets.x * -1; xO <= offsets.x; xO++) {
            for (let zO = offsets.z * -1; zO <= offsets.z; zO++) {
                positions.push(bot.entity.position.offset(xO, yO, zO));
            }
        }
    }

    digBlocksInOrder(positions, () => bot.chat("Finished my hole :)"), defaultMove);
}

function digBlocksInOrder(positions, onComplete, defaultMove) {
    if (positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;

    const nextPosition = positions.shift();
    goToTarget({ position: nextPosition }, defaultMove, 5, () => {
        digBlockAt(nextPosition, digBlocksInOrder.bind(this, positions, onComplete, defaultMove));
    });
}

function bestTool(block) {
    let tool = bot.pathfinder.bestHarvestTool(block);
    if (tool) return tool;

    if (block.name == 'air') return;
    const materials = ['wooden', 'stone', 'gold', 'iron', 'diamond'];
    switch (block.material) {
        case 'dirt':
            return bestToolOfTypeInInv("shovel", materials);
        case 'wood':
            return bestToolOfTypeInInv("axe", materials);
        case 'flesh':
        case 'plant':
            return bestToolOfTypeInInv("sword", materials);
        case 'rock':
            return bestToolOfTypeInInv("pickaxe", materials);
        case undefined:
            break;
        default:
            bot.chat("What's this material > " + block.material);
            break;
    }
    return null;
}

function bestToolOfTypeInInv(toolname, materials) {
    const tools = materials.map(x => x + '_' + toolname);
    for (let i = tools.length - 1; i >= 0; i--) {
        const tool = tools[i];
        let matches = bot.inventory.items().filter(item => item.name === tool);
        if (matches.length > 0) return matches[0];
    }
    return null;
}

function digBlockAt(position, onComplete) {
    var target = bot.blockAt(position);
    bot.lookAt(target.position);
    const tool = bestTool(target);

    bot.equip(tool, 'hand', () => {
        if (target && bot.canDigBlock(target) && target.name != 'air') {
            bot.dig(target, onComplete)
        } else {
            if (onComplete) onComplete();
        }
    });
}

function info(messageParts) {
    const playerName = messageParts[1];
    bot.chat("Info about " + playerName);

    const player = bot.players[playerName];
    let info = null;
    if (player) {
        info = "Pos: " + player.entity.position + "\r\n";
        info += "Vel: " + player.entity.velocity;
    } else {
        info = 'No-one is called ' + playerName;
    }

    bot.chat(info);
}

function stop() {
    bot.pathfinder.setGoal(null);
}

function follow(target, movement) {
    bot.pathfinder.setMovements(movement);
    bot.pathfinder.setGoal(new GoalFollow(target, 3), true);
}

function goToTarget(target, movement, dist = 0, cb) {
    if (!target) {
        bot.chat('I can\'t see there!');
        cb();
        return;
    }
    const p = target.position;

    bot.pathfinder.setMovements(movement);
    const goal = new GoalNear(p.x, p.y, p.z, dist);
    bot.pathfinder.setGoal(goal);

    const callbackCheck = () => {
        if (goal.isEnd(bot.entity.position.floored())) {
            cb();
        } else {
            setTimeout(callbackCheck.bind(this), 1000);
        }
    };

    if (cb) callbackCheck();
}