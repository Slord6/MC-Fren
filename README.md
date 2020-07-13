# MC-Fren
 A helpful minecraft friend. Built on [Mineflayer](https://github.com/PrismarineJS/mineflayer) and uses [Mineflayer-pathfinder](https://github.com/Karang/mineflayer-pathfinder) for pathing.

## Install

- git clone
- npm i
- node .\index.js \<server\> \<port\> \<master\>

`master` is the name of the account you want to control the bots from
example:

`node .\index.js localhost 25565 Steve`

Features:

- 1->N bots, just add or remove the names in the `botNames` array in `index.js`
- Control all bots with "`swarm`" or specific bots with their name, for example: "`swarm sethome`", "`Claude goto home`", "`Dennis harvest 3 iron_ore`"
- For full list of commands see the big `switch` statement in `individual.js`