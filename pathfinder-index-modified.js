/*
Modified verstion of index.js from mineflayer-pathfinder, https://github.com/Karang/mineflayer-pathfinder
Replace original to have better tool type selection when pathing
Distributed as per the licence:
MIT License

Copyright (c) 2020 Karang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const { performance } = require('perf_hooks')

const astar = require('./lib/astar')

const Vec3 = require('vec3').Vec3

const THINK_TIMEOUT = 100 // ms

function bestToolOfTypeInInv (bot, toolname, materials) {
  const tools = materials.map(x => x + '_' + toolname);
  for(let i = tools.length - 1; i >= 0; i--) {
      const tool = tools[i];
      let matches = bot.inventory.items().filter(item => item.name === tool);
      if(matches.length > 0) return matches[0];
  }
  return null;
}

function inject (bot) {
  bot.pathfinder = {}

  bot.pathfinder.bestHarvestTool = function (block) {
    const items = bot.inventory.items()
    for (const i in block.harvestTools) {
      const id = parseInt(i, 10)
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    
    if(block.name == 'air') return null;
    const materials = ['wooden', 'stone', 'gold', 'iron', 'diamond'];
    switch(block.material) {
        case 'dirt':
            return bestToolOfTypeInInv(bot, "shovel", materials);
        case 'wood':
            return bestToolOfTypeInInv(bot, "axe", materials);
        case 'flesh':
        case 'plant':
            return bestToolOfTypeInInv(bot, "sword", materials);
        case 'rock':
            return bestToolOfTypeInInv(bot, "pickaxe", materials);
        case undefined:
            break;
        default:
            bot.chat("What's this material > " + block.material);
            break;
    }
    return null;
  }

  bot.pathfinder.getPathTo = function (movements, goal, done, timeout) {
    const maxBlockPlace = movements.countScaffoldingItems()
    const p = bot.entity.position
    astar({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), remainingBlocks: maxBlockPlace }, movements, goal, timeout || THINK_TIMEOUT, done)
  }

  let stateMovements = null
  let stateGoal = null
  let dynamicGoal = false
  let path = []
  let pathUpdated = false
  let digging = false
  let placing = false
  let placingBlock = null
  let thinking = false
  let lastNodeTime = performance.now()

  function resetPath () {
    path = []
    if (digging) bot.stopDigging()
    digging = false
    placing = false
    pathUpdated = false
    bot.clearControlStates()
  }

  bot.pathfinder.setGoal = function (goal, dynamic = false) {
    stateGoal = goal
    dynamicGoal = dynamic
    resetPath()
  }

  bot.pathfinder.setMovements = function (movements) {
    stateMovements = movements
    resetPath()
  }

  bot.pathfinder.isMoving = function () {
    return path.length > 0 || thinking
  }

  bot.pathfinder.isMining = function () {
    return digging
  }

  bot.pathfinder.isBuilding = function () {
    return placing
  }

  bot.pathfinder.isThinking = function () {
    return thinking
  }

  bot.on('physicTick', monitorMovement)

  function isPositionNearPath (pos, path) {
    for (const i in path) {
      const node = path[i]
      const dx = Math.abs(node.x - pos.x)
      const dy = Math.abs(node.y - pos.y)
      const dz = Math.abs(node.z - pos.z)
      if (dx <= 3 && dy <= 3 && dz <= 3) return true
    }
    return false
  }

  function fullStop () {
    bot.clearControlStates()

    // Force horizontal velocity to 0 (otherwise inertia can move us too far)
    // Kind of cheaty, but the server will not tell the difference
    bot.entity.velocity.x = 0
    bot.entity.velocity.z = 0

    const blockX = Math.floor(bot.entity.position.x) + 0.5
    const blockZ = Math.floor(bot.entity.position.z) + 0.5

    // Make sure our bounding box don't collide with neighboring blocks
    // otherwise recenter the position
    if (Math.abs(bot.entity.position.x - blockX) > 0.2) { bot.entity.position.x = blockX }
    if (Math.abs(bot.entity.position.z - blockZ) > 0.2) { bot.entity.position.z = blockZ }
  }

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (isPositionNearPath(oldBlock.position, path) && oldBlock.type !== newBlock.type) {
      resetPath()
    }
  })

  bot.on('chunkColumnLoad', (chunk) => {
    resetPath()
  })

  class PlayerState {
    constructor (bot, control) {
      // Input / Outputs
      this.pos = bot.entity.position.clone()
      this.vel = bot.entity.velocity.clone()
      this.onGround = bot.entity.onGround
      this.isInWater = bot.entity.isInWater
      this.isInLava = bot.entity.isInLava
      this.isInWeb = bot.entity.isInWeb
      this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
      this.isCollidedVertically = bot.entity.isCollidedVertically
      this.jumpTicks = bot.jumpTicks
      this.jumpQueued = bot.jumpQueued

      // Input only (not modified)
      this.yaw = bot.entity.yaw
      this.control = control
    }

    apply (bot) {
      bot.entity.position = this.pos
      bot.entity.velocity = this.vel
      bot.entity.onGround = this.onGround
      bot.entity.isInWater = this.isInWater
      bot.entity.isInLava = this.isInLava
      bot.entity.isInWeb = this.isInWeb
      bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
      bot.entity.isCollidedVertically = this.isCollidedVertically
      bot.jumpTicks = this.jumpTicks
      bot.jumpQueued = this.jumpQueued
    }
  }

  function canStraightPathTo (pos) {
    const state = new PlayerState(bot, {
      forward: true,
      back: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      sneak: false
    })
    const delta = pos.minus(bot.entity.position)
    state.yaw = Math.atan2(-delta.x, -delta.z)
    const world = { getBlock: (pos) => { return bot.blockAt(pos, false) } }
    for (let step = 0; step < 1000; step++) {
      bot.physics.simulatePlayer(state, world)
      if (pos.distanceTo(state.pos) <= 2) return true
      // TODO: check blocks to avoid
      if (!state.onGround || state.isCollidedHorizontally) return false
    }
    return false
  }

  function monitorMovement () {
    // Test freemotion
    if (stateMovements && stateMovements.allowFreeMotion && stateGoal && stateGoal.entity) {
      const target = stateGoal.entity
      if (canStraightPathTo(target.position)) {
        bot.lookAt(target.position.offset(0, 1.6, 0))

        if (target.position.distanceTo(bot.entity.position) > Math.sqrt(stateGoal.rangeSq)) {
          bot.setControlState('forward', true)
        } else {
          bot.clearControlStates()
        }
        return
      }
    }

    if (stateGoal && stateGoal.hasChanged()) {
      resetPath()
    }

    if (path.length === 0) {
      lastNodeTime = performance.now()
      if (stateGoal && stateMovements && !thinking) {
        if (stateGoal.isEnd(bot.entity.position.floored()) || pathUpdated) {
          if (!dynamicGoal) {
            bot.emit('goal_reached', stateGoal)
            stateGoal = null
          }
        } else {
          thinking = true
          bot.pathfinder.getPathTo(stateMovements, stateGoal, (results) => {
            bot.emit('path_update', results)
            path = results.path
            thinking = false
            pathUpdated = true
          })
        }
      }
      return
    }

    let nextPoint = path[0]
    bot.physics.adjustPositionHeight(nextPoint)
    const p = bot.entity.position

    // Handle digging
    if (digging || nextPoint.toBreak.length > 0) {
      if (!digging && bot.entity.onGround) {
        digging = true
        const b = nextPoint.toBreak.shift()
        const block = bot.blockAt(new Vec3(b.x, b.y, b.z), false)
        const tool = bot.pathfinder.bestHarvestTool(block)
        fullStop()
        bot.equip(tool, 'hand', function () {
          bot.dig(block, function (err) {
            lastNodeTime = performance.now()
            if (err) resetPath()
            digging = false
          })
        })
      }
      return
    }
    // Handle block placement
    // TODO: sneak when placing or make sure the block is not interactive
    if (placing || nextPoint.toPlace.length > 0) {
      if (!placing) {
        placing = true
        placingBlock = nextPoint.toPlace.shift()
        fullStop()
      }
      const block = stateMovements.getScaffoldingItem()
      if (!block) {
        resetPath()
        return
      }
      let canPlace = true
      if (placingBlock.jump) {
        bot.setControlState('jump', true)
        canPlace = placingBlock.y + 1 < bot.entity.position.y
      }
      if (canPlace) {
        bot.equip(block, 'hand', function () {
          const refBlock = bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), false)
          bot.placeBlock(refBlock, new Vec3(placingBlock.dx, placingBlock.dy, placingBlock.dz), function (err) {
            placing = false
            lastNodeTime = performance.now()
            if (err) resetPath()
          })
        })
      }
      return
    }

    const dx = nextPoint.x - p.x
    const dy = nextPoint.y - p.y
    const dz = nextPoint.z - p.z
    if ((dx * dx + dz * dz) <= 0.15 * 0.15 && (bot.entity.onGround || bot.entity.isInWater)) {
      // arrived at next point
      lastNodeTime = performance.now()
      path.shift()
      if (path.length === 0) { // done
        if (!dynamicGoal && stateGoal.isEnd(p.floored())) {
          bot.emit('goal_reached', stateGoal)
          stateGoal = null
        }
        fullStop()
        return
      }
      // not done yet
      nextPoint = path[0]
      if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
        fullStop()
        return
      }
    }
    let gottaJump = false
    const horizontalDelta = Math.sqrt(dx * dx + dz * dz)

    if (dy > 0.6) {
      // gotta jump up when we're close enough
      gottaJump = horizontalDelta < 1.75
    } else if (dy < -0.1) {
      // possibly jump over a hole
      gottaJump = horizontalDelta > 1.5 && horizontalDelta < 2.5
    }
    gottaJump = gottaJump || bot.entity.isInWater
    bot.setControlState('jump', gottaJump)

    // run toward next point
    bot.look(Math.atan2(-dx, -dz), 0)

    const lx = -Math.sin(bot.entity.yaw)
    const lz = -Math.cos(bot.entity.yaw)

    const frontBackProj = lx * dx + lz * dz
    bot.setControlState('forward', frontBackProj > 0)
    bot.setControlState('back', frontBackProj < 0)

    // check for futility
    if (performance.now() - lastNodeTime > 1500) {
      // should never take this long to go to the next node
      resetPath()
    }
  }
}

module.exports = {
  pathfinder: inject,
  Movements: require('./lib/movements'),
  goals: require('./lib/goals')
}
