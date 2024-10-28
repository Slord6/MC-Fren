const { Vec3 } = require('vec3');

const { GoalNear, GoalGetToBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
let mcData;
const toolMaterials = ['wooden', 'stone', 'iron', 'diamond', 'netherite', 'golden'];

const behaviours = {
    hunt: (bot, movement, amount, maxDist = 30, cb = null) => {
        const mobs = Object.values(bot.entities)
                            .filter(entity => entity.kind === 'Passive mobs')
                            .filter(mob => !['squid', 'horse', 'salmon', 'wolf', 'bat'].includes(mob.name))
                            .filter(mob => mob.position.distanceTo(bot.entity.position) < maxDist)
                            .sort((mobA, mobB) => {
            return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
        }).slice(0, amount);
        behaviours.kill(bot, movement, mobs, cb);
    },

    kill: (bot, movement, mobs, cb) => {
        if(mobs.length == 0) return cb ? cb() : null;
        const tool = behaviours.bestToolOfTypeInInv(bot, 'sword', toolMaterials);
        if(tool) {
            bot.equip(tool, 'hand');
        }
        const mob = mobs.shift();

        bot.lookAt(mob.position);

        behaviours.follow(bot, mob, movement);
        const attackLoop = () => {
            if(mob.isValid) {
                bot.attack(mob);
                setTimeout(attackLoop, 100);
            } else {
                behaviours.collectDrops(bot, movement, 10, () => {
                    setImmediate(behaviours.kill.bind(this, bot, movement, mobs, cb));
                });
            }
        }
        attackLoop();
    },

    collectDrops: (bot, movement, maxDist, cb) => {
        drops = Object.values(bot.entities)
                            .filter(entity => entity.kind === 'Drops' || entity.kind === "UNKNOWN")
                            .filter(drop => drop.position.distanceTo(bot.entity.position) < maxDist)
                            .sort((dropA, dropB) => {
            return (dropA.position.distanceTo(bot.entity.position) - dropB.position.distanceTo(bot.entity.position));
        });
        
        if(drops.length == 0) {
            cb();
            return;
        }
        behaviours.goToTarget(bot, drops.shift(), movement, 0, () => {
            setImmediate(behaviours.collectDrops.bind(this, bot, movement, maxDist, cb));
        });
    },

    harvest: (bot, blockName, movement, amount, mcData, cb) => {
        if(amount <= 0) return cb ? cb(`I collected all the ${blockName.split("_").join(" ")} you asked for`) : null;

        const lookupBlock = behaviours.nameToBlock(blockName, mcData); 
        if(!lookupBlock) return cb ? cb(`What's a ${blockName}?`) : null;
        const id = lookupBlock.id;
        
        let block = bot.findBlockSync({
            matching: id,
            point: bot.entity.position,
            maxDistance: 30
        })[0];

        if(!block) {
            return cb ? cb(`Can't see any more ${blockName.split("_").join(" ")}s nearby`) : null;
        } else {
            bot.lookAt(block.position);
            behaviours.goToTarget(bot, block, movement, 1, () => {
                bot.lookAt(block.position);
                behaviours.digBlockAt(bot, block.position, () => {
                    behaviours.collectDrops(bot, movement, 5, () => {
                        setImmediate(behaviours.harvest.bind(this, bot, blockName, movement, --amount, mcData, cb));
                    });
                });
            });
        }
    },

    inventoryItemByName: (bot, name) => {
        return bot.inventory.items().filter(item => item.name === name)[0];
    },

    tossItem: (bot, name, amount, toPerson, cb) => {
        bot.lookAt(bot.players[toPerson].entity.position, false, () => {
            amount = parseInt(amount, 10);
            const item = behaviours.inventoryItemByName(bot, name);
            if (!item) {
                cb(`I have no ${name}`);
            } else if (amount) {
                bot.toss(item.type, null, amount, checkIfTossed);
            } else {
                bot.tossStack(item, checkIfTossed);
            }
        
            function checkIfTossed (err) {
                if (err) {
                    cb(`might be a few short of what you wanted`);
                } else {
                    cb(`dropped the ${name}`);
                }
            }
        });
    },

    nearbyBlocks: (bot, maxDist = 30) => {
        let nearbyBlocks = {};
        for(let y = maxDist * -1; y <= maxDist; y++) {
            for(let x = maxDist * -1; x <= maxDist; x++) {
                for(let z = maxDist * -1; z <= maxDist; z++) {
                    let block = bot.blockAt(bot.entity.position.offset(x, y, z));

                    if(bot.blockAt(block.position.offset(0, 1, 0)).name != 'air') continue;
                    if(block.name == 'air' || block.name == 'cave_air') continue;
                    nearbyBlocks[block.name] = nearbyBlocks[block.name] ? nearbyBlocks[block.name] + 1 : 1;
                }
            }
        }
        let names = Object.keys(nearbyBlocks);
        let amounts = Object.values(nearbyBlocks);
        const result = names.map((name, index) => {
            return {name, amount: amounts[index]}
        }).sort((x,y) => y.amount - x.amount).map(x => `${x.name}x${x.amount}`);
        return result;
    },

    nearbyBlocksRawMatching: (bot, maxDist = 30, includeBlock = () => true) => {
        let nearbyBlocks = [];
        for(let y = maxDist * -1; y <= maxDist; y++) {
            for(let x = maxDist * -1; x <= maxDist; x++) {
                for(let z = maxDist * -1; z <= maxDist; z++) {
                    let block = bot.blockAt(bot.entity.position.offset(x, y, z));
                    if(includeBlock(block)) nearbyBlocks.push(block);
                }
            }
        }
        return nearbyBlocks;
    },

    itemByNameIndex: (bot) => {
        let itemsByName
        if (bot.supportFeature('itemsAreNotBlocks')) {
            itemsByName = 'itemsByName'
        } else if (bot.supportFeature('itemsAreAlsoBlocks')) {
            itemsByName = 'blocksByName'
        }
        return itemsByName;
    },

    nameToItem: (bot, name, mcData) => {
        return mcData[behaviours.itemByNameIndex(bot)][name]
    },

    nameToBlock: (name, mcData) => {
        return mcData.blocksByName[name]
    },

    equipByName: (bot, name, mcData, cb) => {
        const item = mcData[behaviours.itemByNameIndex(bot)][name];
        // console.log(`item to equip: ${item.id}, ${item.name} (${name})`);
        if(!item) return cb(false);

        bot.equip(item.id, 'hand', (err) => {
            if (err) {
                console.error(err);
                return cb(false);
            } else {
                return cb(true);
            }
        });
    },

    equipByNameDescriptive: (bot, name, mcData, cb) => {
        const item = mcData[behaviours.itemByNameIndex(bot)][name];
        if(!item) return cb(`Equip a ${name}? What do you mean?`);

        bot.equip(item.id, 'hand', (err) => {
            if (err) {
                return cb(`unable to equip ${name}, ${err.message}`);
            } else {
                return cb(`ok, got ${name}`);
            }
        });
    },

    inventoryAsString: (bot, items) => {
        const output = items.map(behaviours.itemToString).join(', ')
        return output ? output : 'nothing';
    },

    itemToString: (item) => {
        if (item) {
            return `${item.name} x ${item.count}`
        } else {
            return '(nothing)'
        }
    },

    hole: (bot, messageParts, defaultMove, cb) => {
        if(messageParts.length < 2) {
            cb("How big though?");
            return;
        }
        // width, length, depth
        const size = messageParts[1].split('x');
        cb(size[0] + " along x, " + size[1] + " along z and " + size[2] + " deep - got it!");
        let offsets = {
            x: Math.floor(Number(size[0])/2),
            z: Math.floor(Number(size[1])/2),
            y: Math.floor(Number(size[2]))
        }
        const center = bot.entity.position;
        const positions = [];
        for(let yO = 0; yO >= offsets.y * -1; yO--) {
            for(let xO = offsets.x * -1; xO <= offsets.x; xO++) {
                for(let zO = offsets.z * -1; zO <= offsets.z; zO++) {
                    positions.push(center.offset(xO, yO, zO));
                }
            }
        }

        behaviours.digBlocksInOrder(bot, positions, () => cb("Finished my hole :)"), defaultMove);
    },

    visitInOrder: (bot, positions, onComplete, defaultMove) => {
        if(positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;
        
        const nextPosition = positions.shift();
        behaviours.goToTarget(bot, {position: nextPosition}, defaultMove, 0, () => {
            setImmediate(behaviours.visitInOrder.bind(this, bot, positions, onComplete, defaultMove));
        });
    },

    digBlocksInOrder: (bot, positions, onComplete, defaultMove) => {
        if(positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;
        
        const nextPosition = positions.shift();
        behaviours.goToTarget(bot, {position: nextPosition}, defaultMove, 5, () => {
            behaviours.digBlockAt(bot, nextPosition, behaviours.digBlocksInOrder.bind(this, bot, positions, onComplete, defaultMove));
        });
    },

    bestTool: (bot, block) => {
        let tool = bot.pathfinder.bestHarvestTool(block);
        return tool;
    },

    bestToolOfTypeInInv: (bot, toolname, materials) => {
        const tools = materials.map(x => x + '_' + toolname);
        for(let i = tools.length - 1; i >= 0; i--) {
            const tool = tools[i];
            let matches = bot.inventory.items().filter(item => item.name === tool);
            if(matches.length > 0) return matches[0];
        }
        return null;
    },

    digBlockAt: (bot, position, onComplete) => {
        var target = bot.blockAt(position);
        bot.lookAt(target.position);
        const tool = behaviours.bestTool(bot, target) ?? 0;
        
        const doDig = () => {
            if (target && bot.canDigBlock(target) && target.name != 'air') {
                bot.dig(target, true).then(onComplete)
            } else {
                console.log(`${bot.username} couldn't dig`, target.name);
                if(onComplete) onComplete();
            }
        };

        if(tool) {
            bot.equip(tool, 'hand').then(doDig);
        } else {
            doDig();
        }
    },

    info: (bot, messageParts) => {
        const playerName = messageParts[1];
        
        const player = bot.players[playerName];
        console.log(`${bot.username} getting info on ${playerName} (Found: ${!!player})`);
        let info = null;
        if(player) {
            info = `Pos ${player.entity.position}, Vel ${player.entity.velocity}`;
        } else {
            info = 'No-one is called ' + playerName;
        }

        const text = `${playerName}: ${info}`;
        console.log("Info:", text);
        return text;
    },

    stop: (bot) => {
        bot.pathfinder.setGoal(null);
    },

    follow: (bot, target, movement) => {
        bot.pathfinder.setMovements(movement);
        bot.pathfinder.setGoal(new GoalFollow(target, 3), true);
    },

    avoid: (bot, target, movement) => {
        bot.pathfinder.setMovements(movement);
        bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 20)), true);
    },

    shift: (bot, movement) => {
        bot.pathfinder.setMovements(movement);
        const offsetX = (Math.random() - 0.5) * 5;
        const offsetZ = (Math.random() - 0.5) * 5;
        const pos = bot.entity.position;
        bot.pathfinder.setGoal(new GoalXZ(pos.x + offsetX, pos.z + offsetZ), true);
    },

    goToTarget: (bot, target, movement, dist = 0, cb) => {
        if (!target) {
            if(cb) cb(false);
            return;
        }
        const p = target.position;

        bot.pathfinder.setMovements(movement);
        const goal = new GoalNear(p.x, p.y, p.z, dist);
        bot.pathfinder.setGoal(goal);

        const callbackCheck = () => {
            if(goal.isEnd(bot.entity.position.floored())) {
                cb(true);
            } else {
                setTimeout(callbackCheck.bind(this), 1000);
            }
        };

        if(cb) callbackCheck();
    },

    getAdjacentTo: (bot, target, movement, cb) => {
        if (!target) {
            if(cb) cb(false);
            return;
        }
        const p = target.position;

        bot.pathfinder.setMovements(movement);
        const goal = new GoalGetToBlock(p.x, p.y, p.z);
        bot.pathfinder.setGoal(goal);

        const callbackCheck = () => {
            if(goal.isEnd(bot.entity.position.floored())) {
                cb(true);
            } else {
                setTimeout(callbackCheck.bind(this), 1000);
            }
        };

        if(cb) callbackCheck();
    },

    positionToString: (pos) => `${pos.x} ${pos.y} ${pos.z}`,

    watchFuncs: null,
    instructions: null,
    learn: (bot, target, done) => {
        this.instructions = [];
        let initialLoc = target.position;
        this.watchFuncs = {
            done,
            listener: (oldBlock,newBlock) => 
            {
                if(newBlock==null) return;
                bot.chat("mmm")
                if(target.position.floored().distanceTo(newBlock.position.floored())<5)
                {
                    bot.chat("Yep...");
                    let action;
                    if(behaviours.isBlockEmpty(newBlock)) action="dig";
                    else if(behaviours.isBlockNotEmpty(newBlock)) action="place";
                    else action="";
                    if(action!=="")
                    {
                        bot.chat("gotcha");
                        // const deltaPos=newBlock.position.floored().minus(initialLoc);
                        this.instructions.push(`goto ${behaviours.positionToString(newBlock.position.floored())}`);
                    }
                }
            }
    
        };
        bot.on('blockUpdate', this.watchFuncs.listener);
        this.watchFuncs.listener(target.position.floored());
    },

    finishLearn: (bot) => {
        if(this.watchFuncs == null) return;
        bot.off('blockUpdate', this.watchFuncs.listener);
        this.watchFuncs.done(this.instructions);
        this.watchFuncs = null;
    },

    
    isBlockEmpty: (b) => {
        return b!==null && b.boundingBox==="empty";
    },

    isBlockNotEmpty: (b) => {
        return b!==null && b.boundingBox!=="empty";
    },

    attackNearestMob: (bot, defaultMove, cb) => {
        const hostiles = Object.values(bot.entities)
                        .filter(entity => entity.kind === 'Hostile mobs')
                        .sort((mobA, mobB) => {
                            return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
                        });
    
        if(hostiles.length > 0) {
            const hostile = hostiles[0];
            if(hostile.position.distanceTo(bot.entity.position) < 10) {
                behaviours.kill(bot, defaultMove, [hostile], () => {
                    if(cb) cb("Got it!");
                });
            } else {
                if(cb) cb("there aren't any nearby mobs though")
            }
        }
    },

    protectFriendly: (self, other, movement, maxRange = 30) => {
        if(self.entity.position.distanceTo(other.entity.position) < maxRange) {
            behaviours.goToTarget(self, other.entity, movement, 3, () => {
                behaviours.attackNearestMob(self, movement);
            });
        }
    },

    craft: (bot, itemName, mcData, amount = 1, craftingTable = null, craftComplete) => {
        let recipes = behaviours.getRecipe(bot, itemName, amount, mcData, craftingTable);
        if(!recipes || recipes.length === 0) return craftComplete(`I don't know the recipe for ${itemName}`);
        if(recipes[0].inShape) recipes[0].inShape = recipes[0].inShape.reverse();
        bot.craft(recipes[0], amount, craftingTable).then(craftComplete);
    },

    getRecipe: (bot, itemName, amount, mcData, craftingTable = null) => {
        const item = behaviours.nameToItem(bot, itemName, mcData);
        if(!item) return null;
        return bot.recipesFor(item.id, null, amount, craftingTable);
    },

    setHome: (bot, position) => {
        bot.homePositon = position;
    },

    getHome: (bot) => {
        if(bot.homePositon) return bot.homePositon;
        return null;
    },

    fillChest: (bot, chestBlock, onComplete) => {
        const chestInstance = bot.openChest(chestBlock);

        chestInstance.on('open', () => {
            const inventoryItems = bot.inventory.items();

            const putItems = async (items) => {
                if(items.length === 0) return chestInstance.close();
                const item = items.shift();
                console.log(`Taking ${item.count} ${item.name}`)
                await behaviours.depositItem(item, item.count, chestInstance, () => putItems(items));
            };
            putItems(inventoryItems);
        });
        chestInstance.on('close', () => {
            chestInstance.off('close', () => null);
            chestInstance.off('open', () => null);
            onComplete();
        });
    },

    emptyChest: (bot, chestBlock, onComplete) => {
        const chestInstance = bot.openChest(chestBlock);

        chestInstance.on('open', () => {
            const chestItems = chestInstance.items();

            const takeItems = async (items) => {
                if(items.length === 0) return chestInstance.close();
                const item = items.shift();
                console.log(`Taking ${item.count} ${item.name}`)
                await behaviours.withdrawItem(item, item.count, chestInstance, () => takeItems(items));
            };
            takeItems(chestItems);
        });
        chestInstance.on('close', () => {
            chestInstance.off('close', () => null);
            chestInstance.off('open', () => null);
            onComplete();
        });
    },

    emptyNearestChest: (bot, maxDist, onComplete) => {
        const chestBlock = behaviours.nearbyBlocksRawMatching(bot, maxDist, (block) => block.name == 'chest').sort((a,b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
        behaviours.emptyChest(bot, chestBlock, onComplete);
    },

    withdrawItem: async (item, amount, chest, onComplete) => {
        try {
            await chest.withdraw(item.type, null, amount, onComplete)
        } catch (err) {
            console.error(err);
            console.error(`unable to withdraw ${amount} ${item.name}`)
        }
    },

    depositItem: async (item, amount, chest, onComplete) => {
        try {
            await chest.deposit(item.type, null, amount, onComplete)
        } catch (err) {
            console.error(err);
            console.error(`unable to deposit ${amount} ${item.name}`)
        }
    },

    nonEmptyAdjacentBlocks: (bot, position) => {
        let blocks = [];
        for(let x = -1; x <= 1; x++) {
            for(let y = -1; y <= 1; y++) {
                for(let z = -1; z <= 1; z++) {
                    // skip diagonals
                    const totalOffset = Math.abs(x) + Math.abs(y) + Math.abs(z);
                    if(totalOffset !== 1) continue;

                    const adjacentBlock = bot.blockAt(position.offset(x, y, z));
                    if(behaviours.isBlockNotEmpty(adjacentBlock)) blocks.push(adjacentBlock);
                }
            }
        }
        blocks = blocks.sort((a,b) => a.position.y - b.position.y); // default sort, easier to place on bottom of blocks if possible
        return blocks;
    },

    // position MUST be a Vec3
    placeBlockAt: (bot, position, blockName, mcData, cb) => {
        behaviours.digBlockAt(bot, position, () => {
            behaviours.equipByName(bot, blockName, mcData, (equippedSuccessfully) => {
                if(!equippedSuccessfully) {
                    console.error(`Could not equip ${blockName} for portal building`);
                    return cb(false);
                }
                const adjacentBlocks = behaviours.nonEmptyAdjacentBlocks(bot, position);
                if(adjacentBlocks.length == 0) return cb(false);
                const placementFace = position.minus(adjacentBlocks[0].position);
                bot.placeBlock(adjacentBlocks[0], placementFace, (err) => {
                    if(err) {
                        console.error(err, adjacentBlocks[0].name, adjacentBlocks[0].position, placementFace);
                        cb(false);
                    } 
                    cb(true);
                });
            });
        });
    },

    placeBlocksInOrder: (bot, positions, blockName, mcData, defaultMove, onComplete) => {
        if(positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;
        
        const nextPosition = positions.shift();
        behaviours.getAdjacentTo(bot, {position: nextPosition}, defaultMove, () => {
            behaviours.placeBlockAt(bot, nextPosition, blockName, mcData, behaviours.placeBlocksInOrder.bind(this, bot, positions, blockName, mcData, defaultMove, onComplete));
        });
    },

    placeBlocksSortByPlacability: (bot, positions, blockName, mcData, defaultMove, onComplete) => {
        if(positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;
        
        positions = positions.sort((a,b) => behaviours.nonEmptyAdjacentBlocks(bot, b).length - behaviours.nonEmptyAdjacentBlocks(bot, a).length);
        const nextPosition = positions.shift();
        behaviours.getAdjacentTo(bot, {position: nextPosition}, defaultMove, () => {
            behaviours.placeBlockAt(bot, nextPosition, blockName, mcData, behaviours.placeBlocksSortByPlacability.bind(this, bot, positions, blockName, mcData, defaultMove, onComplete));
        });
    },

    valueIsBetweenInclusive: (value, left, right) => {
        const small = Math.min(left, right);
        const big = Math.max(left, right);
        
        return small <= value && value <= big;
    },

    buildPortal: (bot, bottomLeftPosition, topRightPosition, mcData, defaultMove, blockName, onComplete) => {
        let minX = Math.min(bottomLeftPosition.x, topRightPosition.x);
        let maxX = Math.max(bottomLeftPosition.x, topRightPosition.x);
        let minY = Math.min(bottomLeftPosition.y, topRightPosition.y);
        let maxY = Math.max(bottomLeftPosition.y, topRightPosition.y);
        let minZ = Math.min(bottomLeftPosition.z, topRightPosition.z);
        let maxZ = Math.max(bottomLeftPosition.z, topRightPosition.z);

        let blockPositions = [];
        let airPositions = []
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    let portalBlockPos = new Vec3(x, y, z);
                    // not at edges = air
                    if(((x != minX && x != maxX) || (z != minZ && z != maxZ)) && y != minY && y != maxY) {
                        airPositions.push(portalBlockPos);
                    } else {
                        let currentBlockAtPos = bot.blockAt(portalBlockPos);
                        if((behaviours.isBlockNotEmpty(currentBlockAtPos) && currentBlockAtPos.name !== blockName) || behaviours.isBlockEmpty(currentBlockAtPos)) {
                            blockPositions.push(portalBlockPos);
                        }
                    }
                }
            }
        }
        behaviours.placeBlocksSortByPlacability(bot, blockPositions, blockName, mcData, defaultMove, () => {
            behaviours.digBlocksInOrder(bot, airPositions, onComplete, defaultMove);
        });
    }
}

module.exports = behaviours;