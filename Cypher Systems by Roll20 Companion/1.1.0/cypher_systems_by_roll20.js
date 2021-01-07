/* globals createObj, findObjs, getAttrByName, getObj, log, on, sendChat */
const CypherSystemsByRoll20 = (function () {
  'use strict'
  const version = '1.1.1'
  const modified = '2020-01-06'
  const author = 'Natha (roll20userid:75857)'
  function checkInstall () {
    log(`========================================================================
Cypher Systems by Roll20 Companion v${version} (${modified})
Author: ${author}
This script is designed for the Cypher Systems by Roll20 character sheet.
=========================================================================`)
  }

  function CypherError (message, expected, actual) {
    this.name = 'CypherError'
    this.message = message
    this.expected = expected
    this.actual = actual
    this.toString = function () {
      return `&{template:default} {{name=${this.name}}} {{Message=${this.message}}} {{Expected=${this.expected}}} {{Actual=${this.actual}}}`
    }
  }
  CypherError.prototype = new Error()

  const CypherChatCommands = (function () {
    // private
    // Depletes the three character pools in sequence according to a specific damage cost
    function applyDamage (character, stat1, stat2, stat3, cost) {
      sendChat(`character|${character.id}`, `Took ${cost} damage!`)
      cost = depletePool(character, stat1, cost)
      cost = depletePool(character, stat2, cost)
      cost = depletePool(character, stat3, cost)

      broadcastStatus(character)
    }

    // Reduces a pool by a specific damage cost.
    // If the cost is greater than the pool, set the pool to zero and return the remaining cost.
    function depletePool (character, stat, cost) {
      let pool = 0
      let max = 0
      let attr = findObjs({
        _type: 'attribute',
        _characterid: character.id,
        name: stat
      })[0]
      if (attr) {
        pool = parseInt(attr.get('current')) || 0
        max = parseInt(attr.get('max')) || 0
      } else {
        attr = createObj('attribute', {
          characterid: character.id,
          name: stat,
          current: pool,
          max: max
        })
      }
      attr.set('current', Math.min(max, Math.max(pool - cost, 0)))
      return Math.max(cost - pool, 0)
    }

    // Sends chat message with status of a character's pools.
    // If all pools are depleted, player is dead.
    function broadcastStatus (character) {
      const might = getAttrByName(character.id, 'might')
      const speed = getAttrByName(character.id, 'speed')
      const intellect = getAttrByName(character.id, 'intellect')

      sendChat(`character|${character.id}`, `&{template:default} {{name=Pools}} {{Might=${might}}} {{Speed=${speed}}} {{Intellect=${intellect}}}`)
      if (might + speed + intellect <= 0) {
        sendChat(`character|${character.id}`, `💀 R.I.P. ${character.get('name')} 💀`)
      }
    }

    // public
    return {
      // Applies cost of skills and abilities to PC stat pools.
      '!cypher-modstat': function (characterId, statName, statCost) {
        const character = getObj('character', characterId)
        if (!character) {
          throw new CypherError('Character ID not found', 'characterId: string', characterId)
        }
        if (!parseInt(statCost, 10)) {
          throw new CypherError('Cost is not a number.', 'statCost: number', statCost)
        }

        switch (statName) {
          case 'recovery-rolls': {
            const attr = findObjs({
              _type: 'attribute',
              _characterid: character.id,
              name: statName
            })[0]
            if (attr) {
              attr.set('current', statCost)
            } else {
              createObj('attribute', {
                characterid: character.id,
                name: statName,
                current: statCost
              })
            }
            sendChat(`character|${character.id}`, 'Next recovery period updated.')
            break
          }
          case 'might':
            applyDamage(character, 'might', 'speed', 'intellect', statCost)
            break
          case 'speed':
            applyDamage(character, 'speed', 'might', 'intellect', statCost)
            break
          case 'intellect':
            applyDamage(character, 'intellect', 'might', 'speed', statCost)
            break
          default: {
            sendChat(`character|${character.id}`, `&{template:default} {{modstat=1}} {{noAttribute=${statName}}}`)
            break
          }
        }
      },

      // Apply damage (or healing if dmgDealt is negative) to Cypher NPC/Creature, and set 'death' marker if health is 0 or less.
      // The Mook or full NPC must have the following attributes:
      // - Level (token bar1)
      // - Health (token bar2)
      // - Armor (token bar3)
      //   * Armor will diminish damage unless applyArmor === 'n'
      '!cypher-npcdmg': function (tokenId, dmgDealt, applyArmor) {
        const token = getObj('graphic', tokenId)
        if (!token) {
          throw new CypherError('Token not found.', 'token_id: string', tokenId)
        }

        const character = getObj('character', token.get('represents'))
        if (!character) {
          throw new CypherError('Token does not represent a character.', 'token_id: string', tokenId)
        }

        dmgDealt = parseInt(dmgDealt, 10)
        if (!dmgDealt) {
          throw new CypherError('Damage dealt is not a number.', 'damage: number', dmgDealt)
        }

        const name = character.get('name')
        let armor = parseInt(getAttrByName(character.id, 'armor', 'current'), 10)
        if (!armor || applyArmor === 'n') {
          armor = 0
        }
        const dmgTaken = (dmgDealt > 0)
          ? Math.max((dmgDealt - armor), 0)
          : dmgDealt

        // Health objects differ between full NPCs and mooks, so they must be declared prior to assignment
        let health = {}
        let healthCurrent = 0
        let healthMax = 0

        // Is the token linked to a full NPC or just a Mook?
        const isChar = token.get('bar1_link')
        if (isChar) {
        // Full-character NPC: get the health attribute values
          health = findObjs({
            _type: 'attribute',
            _characterid: character.id,
            name: 'health'
          })[0]
          if (!health) {
            throw new CypherError(`${name} has no health attribute.`, 'attribute: object', health)
          }
          healthCurrent = parseInt(health.get('current'))
          healthMax = parseInt(health.get('max'))
        } else {
        // Mook: get the health bar values
          healthCurrent = parseInt(token.get('bar2_value'))
          healthMax = parseInt(token.get('bar2_max'))
        }

        // If health attribute has no max, set max to current health
        healthMax = Math.max(healthCurrent, healthMax)

        const healthFinal = Math.min(Math.max((healthCurrent - dmgTaken), 0), healthMax)
        if (isChar) {
        // Full NPC: update health attribute
          health.set('current', healthFinal)
          health.set('max', healthMax)
        } else {
        // Mook: update health bars
          token.set('bar2_value', healthFinal)
          token.set('bar2_max', healthMax)
        }
        token.set('status_dead', (healthFinal === 0))
        sendChat('Cypher System', `/w gm ${name} receives ${Math.abs(dmgTaken)} points of ${dmgDealt >= 0 ? `damage (${dmgDealt} - ${armor} Armor)` : 'healing'}. Health: ${healthCurrent}->${healthFinal}.`)
      }
    }
  })()

  function executeChatCommand (msg) {
    const validCommand = /^!cypher-\w+(\s|%20).+$/
    if (msg.type === 'api' && validCommand.test(msg.content)) {
      const command = msg.content.split(' ')[0]
      const args = msg.content.split(' ')[1].split('|')
      try {
        CypherChatCommands[command](...args)
      } catch (e) {
        sendChat('Cypher System', `/w gm Chat command ${command} failed.`)
        sendChat('Cypher System', `/w gm ${e}`)
      }
    }
  }

  function registerEventHandlers () {
    on('chat:message', executeChatCommand)
  }

  return {
    load: () => {
      checkInstall()
      registerEventHandlers()
    }
  }
})()

on('ready', CypherSystemsByRoll20.load)
