const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
let mcData;

const behaviours = {
    hunt: (bot, movement, amount, maxDist = 30) => {
        const mobs = Object.values(bot.entities)
                            .filter(entity => entity.kind === 'Passive mobs')
                            .filter(mob => !['squid', 'horse', 'salmon', 'wolf', 'bat'].includes(mob.name))
                            .filter(mob => mob.position.distanceTo(bot.entity.position) < maxDist)
                            .sort((mobA, mobB) => {
            return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
        }).slice(0, amount);
        behaviours.kill(bot, movement, mobs, () => {
            bot.chat(`Finished hunting`);
        });
    },

    kill: (bot, movement, mobs, cb) => {
        if(mobs.length == 0) return cb ? cb() : null;
        const tool = behaviours.bestTool(bot, {material: 'flesh'});
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
                            .filter(entity => entity.kind === 'Drops')
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

    harvest: (bot, blockName, movement, amount, mcData) => {
        if(amount <= 0) return bot.chat(`I collected all the ${blockName} you asked for`);

        const lookupBlock = mcData.blocksByName[blockName]; 
        if(!lookupBlock) return bot.chat(`What's a ${blockName}?`);
        const id = lookupBlock.id;
        
        let block = bot.findBlock({
            matching: id,
            point: bot.entity.position,
            maxDistance: 30
        });

        if(!block) {
            bot.chat(`Can't see any more ${blockName} nearby`);
            return;
        } else {
            bot.lookAt(block.position);
            behaviours.goToTarget(bot, block, movement, 1, () => {
                behaviours.digBlockAt(bot, block.position, () => {
                    behaviours.collectDrops(bot, movement, 5, () => {
                        setImmediate(behaviours.harvest.bind(this, bot, blockName, movement, --amount, mcData));
                    });
                });
            });
        }
    },

    inventoryItemByName: (bot, name) => {
        return bot.inventory.items().filter(item => item.name === name)[0];
    },

    tossItem: (bot, name, amount, toPerson) => {
        bot.lookAt(bot.players[toPerson].entity.position, false, () => {
            amount = parseInt(amount, 10);
            const item = behaviours.inventoryItemByName(bot, name);
            if (!item) {
                bot.chat(`I have no ${name}`);
            } else if (amount) {
                bot.toss(item.type, null, amount, checkIfTossed);
            } else {
                bot.tossStack(item, checkIfTossed);
            }
        
            function checkIfTossed (err) {
            if (err) {
                bot.chat(`might be a few short of what you wanted`);
            } else {
                bot.chat(`dropped the ${name}`);
            }
            }
        });
    },

    nearbyBlocks: (bot, maxDist = 30) => {
        bot.chat('One sec, just counting blocks...');
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
        return names.map((name, index) => {
            return {name, amount: amounts[index]}
        }).sort((x,y) => y.amount - x.amount).map(x => `${x.name}x${x.amount}`);
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

    equipByName: (bot, name, mcData, output = true) => {
        const item = mcData[behaviours.itemByNameIndex(bot)][name];
        if(!item) return bot.chat(`Equip a ${name}? What do you mean?`);

        bot.equip(item.id, 'hand', (err) => {
            if (err) {
                if(output) bot.chat(`unable to equip ${name}, ${err.message}`);
                return false;
            } else {
                if(output) bot.chat(`ok, got ${name}`);
                return true;
            }
        });
    },

    sayItems: (bot, items) => {
        const output = items.map(behaviours.itemToString).join(', ')
        if (output) {
            bot.chat(output)
        } else {
            bot.chat('nothing')
        }
    },

    itemToString: (item) => {
        if (item) {
            return `${item.name} x ${item.count}`
        } else {
            return '(nothing)'
        }
    },

    hole: (bot, messageParts, defaultMove) => {
        if(messageParts.length < 2) {
            bot.chat("How big though?");
            return;
        }
        // width, length, depth
        const size = messageParts[1].split('x');
        bot.chat(size[0] + " along x, " + size[1] + " along z and " + size[2] + " deep - got it!");
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

        behaviours.digBlocksInOrder(bot, positions, () => bot.chat("Finished my hole :)"), defaultMove);
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
        const tool = behaviours.bestTool(bot, target);
        
        bot.equip(tool, 'hand', () => {
            if (target && bot.canDigBlock(target) && target.name != 'air') {
                bot.dig(target, onComplete)
            } else {
                if(onComplete) onComplete();
            }
        });
    },

    info: (bot, messageParts) => {
        const playerName = messageParts[1];
        bot.chat("Info about " + playerName);
        
        const player = bot.players[playerName];
        let info = null;
        if(player) {
            info = "Pos: " + player.entity.position + "\r\n";
            info += "Vel: " + player.entity.velocity;
        } else {
            info = 'No-one is called ' + playerName;
        }

        bot.chat(info);
    },

    stop: (bot) => {
        bot.pathfinder.setGoal(null);
    },

    follow: (bot, target, movement) => {
        bot.pathfinder.setMovements(movement);
        bot.pathfinder.setGoal(new GoalFollow(target, 3), true);
    },

    goToTarget: (bot, target, movement, dist = 0, cb) => {
        if (!target) {
            bot.chat('I can\'t see there!');
            if(cb) cb();
            return;
        }
        const p = target.position;

        bot.pathfinder.setMovements(movement);
        const goal = new GoalNear(p.x, p.y, p.z, dist);
        bot.pathfinder.setGoal(goal);

        const callbackCheck = () => {
            if(goal.isEnd(bot.entity.position.floored())) {
                cb();
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
                        const deltaPos=newBlock.position.floored().minus(initialLoc);
                        this.instructions.push(`goto ${behaviours.positionToString(deltaPos)}`);
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

    attackNearestMob: (bot, defaultMove) => {
        const hostiles = Object.values(bot.entities)
                        .filter(entity => entity.kind === 'Hostile mobs')
                        .sort((mobA, mobB) => {
                            return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
                        });
    
        if(hostiles.length > 0) {
            const hostile = hostiles[0];
            if(hostile.position.distanceTo(bot.entity.position) < 10) {
                behaviours.kill(bot, defaultMove, [hostile]);
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
        if(!recipes) return craftComplete(`No recipes for ${itemName}`); //poss callback craftComplete with false?
        bot.craft(recipes[0], amount, craftingTable, craftComplete);
    },

    getRecipe: (bot, itemName, amount, mcData, craftingTable = null) => {
        const item = behaviours.nameToItem(bot, itemName, mcData);
        console.log('item', item);
        if(!item) return null;
        return bot.recipesFor(item.id, null, amount, craftingTable);
    },

    setHome: (bot, position) => {
        bot.homePositon = position;
    },

    getHome: (bot) => {
        if(bot.homePositon) return bot.homePositon;
        return null;
    }
}

module.exports = behaviours;