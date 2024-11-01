import MinecraftData, { Entity, IndexedBlock, IndexedData, Item, Recipe } from "minecraft-data";
import { Bot, Chest } from "mineflayer";
import { Movements } from "mineflayer-pathfinder";
import { Block } from 'prismarine-block'
import PrismarineEntity from 'prismarine-entity';
import {Item as PrismarineItem} from 'prismarine-item';
import { Vec3 } from "vec3";

const Vec3Obj = require('vec3').Vec3;

const { GoalNear, GoalGetToBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
const toolMaterials = ['wooden', 'stone', 'iron', 'diamond', 'netherite', 'golden'];

type OptionalCallback = (() => any) | null | undefined;

export class Behaviours {
    public hunt(bot: Bot, movement: Movements, amount: number, maxDist: number = 30, cb: OptionalCallback = null): void {
        const mobs = Object.values(bot.entities)
            .filter(entity => entity.kind === 'Passive mobs')
            .filter(mob => !['squid', 'horse', 'salmon', 'wolf', 'bat'].includes(mob.name as string))
            .filter(mob => mob.position.distanceTo(bot.entity.position) < maxDist)
            .sort((mobA, mobB) => {
                return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
            }).slice(0, amount);
        this.kill(bot, movement, mobs, cb);
    }

    public kill(bot: Bot, movement: Movements, mobs: PrismarineEntity.Entity[], cb: OptionalCallback) {
        if (mobs.length == 0) return cb ? cb() : null;
        const tool = this.bestToolOfTypeInInv(bot, 'sword', toolMaterials);
        if (tool) {
            bot.equip(tool, 'hand');
        }
        const mob = mobs.shift() as PrismarineEntity.Entity;

        bot.lookAt(mob.position);

        this.follow(bot, mob, movement);
        const attackLoop = () => {
            if (mob.isValid) {
                bot.attack(mob);
                setTimeout(attackLoop, 100);
            } else {
                this.collectDrops(bot, movement, 10, () => {
                    setImmediate(this.kill.bind(this, bot, movement, mobs, cb));
                });
            }
        }
        attackLoop();
    }

    public collectDrops(bot: Bot, movement: Movements, maxDist: number, cb: OptionalCallback) {
        let drops: Entity[] = Object.values(bot.entities)
            .filter(entity => entity !== undefined)
            .filter(entity => entity.kind === 'Drops' || entity.kind === "UNKNOWN")
            .filter(drop => drop.position.distanceTo(bot.entity.position) < maxDist)
            .sort((dropA, dropB) => {
                return (dropA.position.distanceTo(bot.entity.position) - dropB.position.distanceTo(bot.entity.position));
            }) as Entity[];

        if (drops.length == 0) {
            if (cb) cb();
            return;
        }
        this.goToTarget(bot, drops.shift() as any, movement, 0, () => {
            setImmediate(this.collectDrops.bind(this, bot, movement, maxDist, cb));
        });
    }

    public harvest(bot: Bot, blockName: string, movement: Movements, amount: number, mcData: IndexedData, cb: (msg: string) => void) {
        if (amount <= 0) return cb ? cb(`I collected all the ${blockName.split("_").join(" ")} you asked for`) : null;

        const lookupBlock = this.nameToBlock(blockName, mcData);
        console.log(`Found ${lookupBlock?.displayName}`);
        if (!lookupBlock) return cb ? cb(`What's a ${blockName}?`) : null;
        const id = lookupBlock.id;

        let position = bot.findBlocks({
            matching: id,
            point: bot.entity.position,
            maxDistance: 30
        })[0];

        if (!position) {
            return cb ? cb(`Can't see any more ${blockName.split("_").join(" ")}s nearby`) : null;
        } else {
            bot.lookAt(position);
            this.goToTarget(bot, { position }, movement, 1, () => {
                bot.lookAt(position);
                this.digBlockAt(bot, position, () => {
                    this.collectDrops(bot, movement, 5, () => {
                        setImmediate(this.harvest.bind(this, bot, blockName, movement, --amount, mcData, cb));
                    });
                });
            });
        }
    }

    public inventoryItemByName(bot: Bot, name: string) {
        const item = bot.inventory.items().filter(item => item.name === name)[0];
        if (!item) return null;
        return item;
    }

    public tossItem(bot: Bot, name: string, amountStr: string, toPerson: string, cb: (message: string) => any) {
        bot.lookAt(bot.players[toPerson].entity.position, false).then(() => {
            const amount: number = parseInt(amountStr, 10);
            const item = this.inventoryItemByName(bot, name);
            if (!item) {
                cb(`I have no ${name}`);
            } else if (amount) {
                bot.toss(item.type, null, Math.min(item.count, amount));
            } else {
                bot.tossStack(item);
            }
        });
    }

    public nearbyBlocks(bot: Bot, maxDist = 30): string[] {
        let nearbyBlocks: { [blockName: string]: number } = {};
        for (let y = maxDist * -1; y <= maxDist; y++) {
            for (let x = maxDist * -1; x <= maxDist; x++) {
                for (let z = maxDist * -1; z <= maxDist; z++) {
                    let block = bot.blockAt(bot.entity.position.offset(x, y, z));
                    if (!block) continue;
                    const aboveblock = bot.blockAt(block.position.offset(0, 1, 0));
                    if (!aboveblock) continue;

                    if (aboveblock.name != 'air') continue;
                    if (block.name == 'air' || block.name == 'cave_air') continue;
                    nearbyBlocks[block.name] = nearbyBlocks[block.name] ? nearbyBlocks[block.name] + 1 : 1;
                }
            }
        }
        let names = Object.keys(nearbyBlocks);
        let amounts = Object.values(nearbyBlocks);
        const result = names.map((name, index) => {
            return { name, amount: amounts[index] }
        }).sort((x, y) => y.amount - x.amount).map(x => `${x.name}x${x.amount}`);
        return result;
    }

    nearbyBlocksRawMatching(bot: Bot, maxDist = 30, includeBlock: ((block: Block) => boolean) = () => true) {
        let nearbyBlocks = [];
        for (let y = maxDist * -1; y <= maxDist; y++) {
            for (let x = maxDist * -1; x <= maxDist; x++) {
                for (let z = maxDist * -1; z <= maxDist; z++) {
                    let block = bot.blockAt(bot.entity.position.offset(x, y, z));
                    if (block !== null && includeBlock(block)) nearbyBlocks.push(block);
                }
            }
        }
        return nearbyBlocks;
    }

    public itemByNameIndex(bot: Bot): "itemsByName" | "blocksByName" {
        let itemsByName = null;
        if (bot.supportFeature('itemsAreNotBlocks')) {
            itemsByName = 'itemsByName'
        } else if (bot.supportFeature('itemsAreAlsoBlocks')) {
            itemsByName = 'blocksByName'
        } else {
            throw Error("Unknown item index type");
        }
        return itemsByName as "itemsByName" | "blocksByName";
    }

    public nameToItem(bot: Bot, name: string, mcData: IndexedData): IndexedBlock | MinecraftData.Item {
        return mcData[this.itemByNameIndex(bot)][name];
    }

    public nameToBlock(name: string, mcData: IndexedData): IndexedBlock {
        return mcData.blocksByName[name]
    }

    public equipByName(bot: Bot, name: string, mcData: IndexedData, cb: (success: boolean) => void) {
        const item = mcData[this.itemByNameIndex(bot)][name];
        if (!item) {
            cb(false);
            return;
        }

        bot.equip(item.id, 'hand').then(() => {
            cb(true);
        });
    }

    public equipByNameDescriptive(bot: Bot, name: string, mcData: IndexedData, cb: (msg: string) => void) {
        const item = mcData[this.itemByNameIndex(bot)][name];
        if (!item) return cb(`Equip a ${name}? What do you mean?`);

        bot.equip(item.id, 'hand');
    }

    public inventoryAsString(bot: Bot) {
        const output = bot.inventory.items().map(this.itemToString).join(', ')
        return output ? output : 'nothing';
    }

    public itemToString(item: PrismarineItem): string {
        if (item) {
            return `${item.name} x ${item.count}`
        } else {
            return '(nothing)'
        }
    }

    public hole(bot: Bot, messageParts: string[], defaultMove: Movements, cb: (msg: string) => void) {
        if (messageParts.length < 2) {
            cb("How big though?");
            return;
        }
        // width, length, depth
        const size = messageParts[1].split('x');
        cb(size[0] + " along x, " + size[1] + " along z and " + size[2] + " deep - got it!");
        let offsets = {
            x: Math.floor(Number(size[0]) / 2),
            z: Math.floor(Number(size[1]) / 2),
            y: Math.floor(Number(size[2]))
        }
        const center = bot.entity.position;
        const positions = [];
        for (let yO = 0; yO >= offsets.y * -1; yO--) {
            for (let xO = offsets.x * -1; xO <= offsets.x; xO++) {
                for (let zO = offsets.z * -1; zO <= offsets.z; zO++) {
                    positions.push(center.offset(xO, yO, zO));
                }
            }
        }

        this.digBlocksInOrder(bot, positions, () => cb("Finished my hole :)"), defaultMove);
    }

    public visitInOrder(bot: Bot, positions: Vec3[], onComplete: OptionalCallback, defaultMove: Movements) {
        if (positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;

        const nextPosition = positions.shift() as Vec3;
        this.goToTarget(bot, { position: nextPosition }, defaultMove, 0, () => {
            setImmediate(this.visitInOrder.bind(this, bot, positions, onComplete, defaultMove));
        });
    }

    public digBlocksInOrder(bot: Bot, positions: Vec3[], onComplete: OptionalCallback, defaultMove: Movements) {
        if (positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;

        const nextPosition = positions.shift() as Vec3;
        this.goToTarget(bot, { position: nextPosition }, defaultMove, 5, () => {
            this.digBlockAt(bot, nextPosition, this.digBlocksInOrder.bind(this, bot, positions, onComplete, defaultMove));
        });
    }

    public bestTool(bot: Bot, block: Block) {
        const tool = bot.pathfinder.bestHarvestTool(block);
        return tool;
    }

    public bestToolOfTypeInInv(bot: Bot, toolName: string, materials: string[]) {
        const tools = materials.map(x => x + '_' + toolName);
        for (let i = tools.length - 1; i >= 0; i--) {
            const tool = tools[i];
            let matches = bot.inventory.items().filter(item => item.name === tool);
            if (matches.length > 0) return matches[0];
        }
        return null;
    }

    public digBlockAt(bot: Bot, position: Vec3, onComplete: OptionalCallback) {
        const target = bot.blockAt(position);
        if (target == null) {
            if (onComplete) onComplete();
            return;
        }

        bot.lookAt(target.position);
        const tool = this.bestTool(bot, target);

        const doDig = () => {
            if (target && bot.canDigBlock(target) && target.name != 'air') {
                bot.dig(target, true).then(onComplete)
            } else {
                console.log(`${bot.username} couldn't dig`, target!.name);
                if (onComplete) onComplete();
            }
        };

        if (tool) {
            bot.equip(tool, 'hand').then(doDig);
        } else {
            doDig();
        }
    }

    public info(bot: Bot, messageParts: string[]) {
        const playerName = messageParts[1];

        const player = bot.players[playerName];
        console.log(`${bot.username} getting info on ${playerName} (Found: ${!!player})`);
        let info = null;
        if (player) {
            info = `Pos ${player.entity.position}, Vel ${player.entity.velocity} `;
        } else {
            info = 'No-one is called ' + playerName;
        }

        const text = `${playerName}: ${info} `;
        console.log("Info:", text);
        return text;
    }

    public stop(bot: Bot) {
        bot.pathfinder.setGoal(null);
    }

    public follow(bot: Bot, target: PrismarineEntity.Entity, movement: Movements) {
        bot.pathfinder.setMovements(movement);
        bot.pathfinder.setGoal(new GoalFollow(target, 3), true);
    }

    public avoid(bot: Bot, target: PrismarineEntity.Entity, movement: Movements) {
        bot.pathfinder.setMovements(movement);
        bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 20)), true);
    }

    public shift(bot: Bot, movement: Movements) {
        bot.pathfinder.setMovements(movement);
        const offsetX = (Math.random() - 0.5) * 5;
        const offsetZ = (Math.random() - 0.5) * 5;
        const pos = bot.entity.position;
        bot.pathfinder.setGoal(new GoalXZ(pos.x + offsetX, pos.z + offsetZ), true);
    }

    public goToTarget(bot: Bot, target: { position: {x: number, y: number, z: number} }, movement: Movements, dist: number, cb: (success: boolean) => void) {
        if (!target) {
            if (cb) cb(false);
            return;
        }
        const p = target.position;

        bot.pathfinder.setMovements(movement);
        const goal = new GoalNear(p.x, p.y, p.z, dist);
        bot.pathfinder.setGoal(goal);

        const callbackCheck = () => {
            if (goal.isEnd(bot.entity.position.floored())) {
                cb!(true);
            } else {
                setTimeout(callbackCheck.bind(this), 1000);
            }
        };

        callbackCheck();
    }

    public getAdjacentTo(bot: Bot, target: { position: Vec3 }, movement: Movements, cb: ((completed: boolean) => void) | null) {
        if (!target) {
            if (cb) cb(false);
            return;
        }
        const p = target.position;

        bot.pathfinder.setMovements(movement);
        const goal = new GoalGetToBlock(p.x, p.y, p.z);
        bot.pathfinder.setGoal(goal);

        const callbackCheck = () => {
            if (goal.isEnd(bot.entity.position.floored())) {
                cb!(true);
            } else {
                setTimeout(callbackCheck.bind(this), 1000);
            }
        };

        if (cb) callbackCheck();
    }

    public positionToString(pos: Vec3): string {
        return `${pos.x} ${pos.y} ${pos.z} `;
    }


    public isBlockEmpty(b: { boundingBox: string }): boolean {
        return b !== null && b.boundingBox === "empty";
    }

    public isBlockNotEmpty(b: { boundingBox: string }): boolean {
        return b !== null && b.boundingBox !== "empty";
    }

    public attackNearestMob(bot: Bot, defaultMove: Movements, cb: (msg: string) => void) {
        const hostiles = Object.values(bot.entities)
            .filter(entity => entity.kind === 'Hostile mobs')
            .sort((mobA, mobB) => {
                return (mobA.position.distanceTo(bot.entity.position) - mobB.position.distanceTo(bot.entity.position));
            });

        if (hostiles.length > 0) {
            const hostile = hostiles[0];
            if (hostile.position.distanceTo(bot.entity.position) < 10) {
                this.kill(bot, defaultMove, [hostile], () => {
                    if (cb) cb("Got it!");
                });
            } else {
                if (cb) cb("there aren't any nearby mobs though")
            }
        }
    }

    public protectFriendly(self: Bot, other: { entity: { position: Vec3 } }, movement: Movements, maxRange = 30) {
        if (self.entity.position.distanceTo(other.entity.position) < maxRange) {
            this.goToTarget(self, other.entity, movement, 3, () => {
                this.attackNearestMob(self, movement, () => { });
            });
        }
    }

    public craft(bot: Bot, itemName: string, mcData: IndexedData, amount = 1, craftingTable: Block | null = null, craftComplete: null | ((msg: string | void) => void) = null) {
        let recipes = this.getRecipe(bot, itemName, amount, mcData, craftingTable);
        if (!recipes || recipes.length === 0) {
            if (craftComplete) craftComplete(`I don't know the recipe for ${itemName}`);
            return;
        }
        if (recipes[0].inShape) recipes[0].inShape = recipes[0].inShape.reverse();
        bot.craft(recipes[0], amount, craftingTable ? craftingTable : undefined).then(craftComplete ? craftComplete : () => { });
    }

    public getRecipe(bot: Bot, itemName: string, amount: number, mcData: IndexedData, craftingTable: Block | null = null) {
        const item = this.nameToItem(bot, itemName, mcData);
        if (!item) return null;
        return bot.recipesFor(item.id, null, amount, craftingTable);
    }

    public setHome(bot: Bot, position: Vec3): void {
        (bot as any).homePositon = position;
    }

    public getHome(bot: Bot): Vec3 | null {
        if ((bot as any).homePositon) return (bot as any).homePositon as Vec3;
        return null;
    }

    public async fillChest(bot: Bot, chestBlock: PrismarineEntity.Entity | Block, onComplete: OptionalCallback) {
        bot.openContainer(chestBlock).then((window) => {
            const inserts: Promise<void>[] = [];
            let items = bot.inventory.items();
            while (items.length > 0);
            {
                let item = items.shift();
                inserts.push(window.deposit(item!.type, null, item!.count).catch(console.error));
            }
            window.close();

            if (onComplete) Promise.all(inserts).then(onComplete);
        });
    }

    public async emptyChest(bot: Bot, chestBlock: PrismarineEntity.Entity | Block, onComplete: OptionalCallback) {
        const withdrawls: Promise<void>[] = [];
        bot.openContainer(chestBlock).then((window) => {
            let items = window.items();
            while (items.length > 0) {
                const item = items.shift();
                withdrawls.push(window.withdraw(item!.type, null, item!.count).catch(console.error));
            }
            window.close();

            if (onComplete) Promise.all(withdrawls).then(onComplete);
        });
    }

    public emptyNearestChest(bot: Bot, maxDist: number, onComplete: OptionalCallback, invert: boolean = false) {
        const chestBlock = this.nearbyBlocksRawMatching(bot, maxDist, (block) => block.name == 'chest')
            .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];

        if (chestBlock) {
            if (invert) {
                this.fillChest(bot, chestBlock, onComplete);
            } else {
                this.emptyChest(bot, chestBlock, onComplete);
            }
        }
    }

    public nonEmptyAdjacentBlocks(bot: Bot, position: Vec3): Block[] {
        let blocks = [];
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    // skip diagonals
                    const totalOffset = Math.abs(x) + Math.abs(y) + Math.abs(z);
                    if (totalOffset !== 1) continue;

                    const adjacentBlock = bot.blockAt(position.offset(x, y, z));
                    if (adjacentBlock !== null && this.isBlockNotEmpty(adjacentBlock)) blocks.push(adjacentBlock);
                }
            }
        }
        blocks = blocks.sort((a, b) => a.position.y - b.position.y); // default sort, easier to place on bottom of blocks if possible
        return blocks;
    }

    public placeBlockAt(bot: Bot, position: Vec3, blockName: string, mcData: IndexedData, cb: (success: boolean) => void) {
        this.digBlockAt(bot, position, () => {
            this.equipByName(bot, blockName, mcData, (equippedSuccessfully) => {
                if (!equippedSuccessfully) {
                    console.error(`Could not equip ${blockName} for portal building`);
                    return cb(false);
                }
                const adjacentBlocks = this.nonEmptyAdjacentBlocks(bot, position);
                if (adjacentBlocks.length == 0) return cb(false);
                const placementFace = position.minus(adjacentBlocks[0].position);
                bot.placeBlock(adjacentBlocks[0], placementFace).then(() => { cb(true) });
            });
        });
    }

    public placeBlocksInOrder(bot: Bot, positions: Vec3[], blockName: string, mcData: IndexedData, defaultMove: Movements, onComplete: OptionalCallback) {
        if (positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;

        const nextPosition = positions.shift() as Vec3;
        this.getAdjacentTo(bot, { position: nextPosition }, defaultMove, () => {
            this.placeBlockAt(bot, nextPosition, blockName, mcData, this.placeBlocksInOrder.bind(this, bot, positions, blockName, mcData, defaultMove, onComplete));
        });
    }

    public placeBlocksSortByPlacability(bot: Bot, positions: Vec3[], blockName: string, mcData: IndexedData, defaultMove: Movements, onComplete: OptionalCallback) {
        if (positions == null || positions == undefined || positions.length == 0) return onComplete ? onComplete() : null;

        positions = positions.sort((a, b) => this.nonEmptyAdjacentBlocks(bot, b).length - this.nonEmptyAdjacentBlocks(bot, a).length);
        const nextPosition = positions.shift() as Vec3;
        this.getAdjacentTo(bot, { position: nextPosition }, defaultMove, () => {
            this.placeBlockAt(bot, nextPosition, blockName, mcData, this.placeBlocksSortByPlacability.bind(this, bot, positions, blockName, mcData, defaultMove, onComplete));
        });
    }

    public valueIsBetweenInclusive(value: number, left: number, right: number) {
        const small = Math.min(left, right);
        const big = Math.max(left, right);

        return small <= value && value <= big;
    }

    public buildPortal(bot: Bot, bottomLeftPosition: Vec3, topRightPosition: Vec3, mcData: IndexedData, defaultMove: Movements, blockName: string, onComplete: OptionalCallback) {
        let minX = Math.min(bottomLeftPosition.x, topRightPosition.x);
        let maxX = Math.max(bottomLeftPosition.x, topRightPosition.x);
        let minY = Math.min(bottomLeftPosition.y, topRightPosition.y);
        let maxY = Math.max(bottomLeftPosition.y, topRightPosition.y);
        let minZ = Math.min(bottomLeftPosition.z, topRightPosition.z);
        let maxZ = Math.max(bottomLeftPosition.z, topRightPosition.z);

        let blockPositions = [];
        let airPositions: Vec3[] = []
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    let portalBlockPos = new Vec3Obj(x, y, z);
                    // not at edges = air
                    if (((x != minX && x != maxX) || (z != minZ && z != maxZ)) && y != minY && y != maxY) {
                        airPositions.push(portalBlockPos);
                    } else {
                        let currentBlockAtPos = bot.blockAt(portalBlockPos);
                        if (currentBlockAtPos !== null && ((this.isBlockNotEmpty(currentBlockAtPos) && currentBlockAtPos.name !== blockName) || this.isBlockEmpty(currentBlockAtPos))) {
                            blockPositions.push(portalBlockPos);
                        }
                    }
                }
            }
        }
        this.placeBlocksSortByPlacability(bot, blockPositions, blockName, mcData, defaultMove, () => {
            this.digBlocksInOrder(bot, airPositions, onComplete, defaultMove);
        });
    }

    public sleep(bot: Bot, onComplete: ((msg: string) => void)) {
        const bedBlock = this.nearbyBlocksRawMatching(bot, 10, (block) => block.name.endsWith('_bed'))
            .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
        bot.sleep(bedBlock).then(() => onComplete(`zzz`)).catch((err) => {
            console.error(err);
            onComplete(`It's not dark yet`)
        });
    }

    /**
     * Checks for cave air in the surrounding 10x10x10 area
     * If there's more than 5% and no torches in the same
     * area then returns true
     * Doesn't work well for dug tunnels, as they have air,
     * not cave_air
     * @param bot 
     * @returns 
     */
    public shouldPlaceTorch(bot: Bot): boolean {
        const maxDist = 10;
        let torchCount = 0;
        let caveAirCount = 0;
        for (let y = maxDist * -1; y <= maxDist; y++) {
            for (let x = maxDist * -1; x <= maxDist; x++) {
                for (let z = maxDist * -1; z <= maxDist; z++) {
                    let block = bot.blockAt(bot.entity.position.offset(x, y, z));
                    if (!block) continue;
                    
                    if (block.name == 'cave_air') caveAirCount++;
                    if (block.name == 'torch') torchCount++;
                }
            }
        }
        const caveAirPercent = (caveAirCount / (maxDist * 3)) * 100;
        console.log(`Torch check had ${caveAirPercent}% cave air (${caveAirCount}, with ${torchCount} torches)`)
        if(caveAirPercent >= 5) {
            return torchCount == 0;
        }
        return false;
    }
}