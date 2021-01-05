/* globals createObj, findObjs, getAttrByName, getObj, log, on, sendChat */
const CypherSystemsByRoll20 = (function () {
  'use strict'
  const version = '1.1.0'
  const modified = '2020-01-01'
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
      return `&{template:default} {{Name=${this.name}}} {{Message=${this.message}}} {{Expected=${this.expected}}} {{Actual=${this.actual}}}`
    }
  }

  CypherError.prototype = new Error()

  const CypherChatCommands = (function () {
    // expected parameter array: [character_id, stat, cost]
    function modstat (args) {
      if (!Array.isArray(args)) {
        throw new CypherError('Invalid command arguments.', 'character_id: string\nstat: number\ncost: number', args)
      }

      if (args.length !== 3) {
        throw new CypherError('Command requires 3 arguments.', 'character_id: string\nstat: number\ncost: number', args.join('\n'))
      }

      const character = getObj('character', args[0])
      if (!character) {
        throw new CypherError('Character ID not found', 'character_id: string', args[0])
      }

      const statName = args[1]
      let statCost = args[2]

      if (statName !== 'might' && statName !== 'speed' && statName !== 'intellect' && statName !== 'recovery-rolls') {
        sendChat(`character|${character.id}`, `&{template:default} {{modStat=1}} {{noAttribute=${statName}}}`)
        return
      }
      let obj1
      const stat1 = statName
      if (stat1 === 'recovery-rolls') {
        const objArray = findObjs({
          _type: 'attribute',
          _characterid: character.id,
          name: stat1
        })
        if (!objArray.length) {
          obj1 = createObj('attribute', {
            characterid: character.id,
            name: stat1,
            current: statCost
          })
        } else {
          objArray[0].setWithWorker('current', statCost)
        }
        sendChat(`character|${character.id}`, 'Next recovery period updated.')
      } else {
        let pool1 = 0
        let max1 = 0
        let finalPool = 0
        let objArray = findObjs({
          _type: 'attribute',
          name: stat1,
          _characterid: character.id
        })
        if (!objArray.length) {
          pool1 = parseInt(getAttrByName(character.id, stat1, 'current')) || 0
          max1 = parseInt(getAttrByName(character.id, stat1, 'max')) || 0
          obj1 = createObj('attribute', {
            characterid: character.id,
            name: stat1,
            current: pool1,
            max: max1
          })
        } else {
          obj1 = objArray[0]
          pool1 = parseInt(obj1.get('current')) || 0
        }
        if (statCost > pool1) {
          // several stats will be diminished
          let pool2
          let pool3
          let max2
          let max3 = 0
          let stat2
          let stat3 = ''
          let obj2
          let obj3
          switch (statName) {
            case 'might':
              stat2 = 'speed'
              stat3 = 'intellect'
              break
            case 'speed':
              stat2 = 'might'
              stat3 = 'intellect'
              break
            case 'intellect':
              stat2 = 'might'
              stat3 = 'speed'
              break
          }
          objArray = findObjs({
            _type: 'attribute',
            _characterid: character.id,
            name: stat2
          })
          if (!objArray.length) {
            pool2 = parseInt(getAttrByName(character.id, stat2, 'current')) || 0
            max2 = parseInt(getAttrByName(character.id, stat2, 'max')) || 0
            obj2 = createObj('attribute', {
              characterid: character.id,
              name: stat2,
              current: pool2,
              max: max2
            })
          } else {
            obj2 = objArray[0]
            pool2 = parseInt(obj2.get('current')) || 0
          }
          objArray = findObjs({
            _type: 'attribute',
            _characterid: character.id,
            name: stat3
          })
          if (!objArray.length) {
            pool3 = parseInt(getAttrByName(character.id, stat3, 'current')) || 0
            max3 = parseInt(getAttrByName(character.id, stat3, 'max')) || 0
            obj3 = createObj('attribute', {
              characterid: character.id,
              name: stat3,
              current: pool3,
              max: max3
            })
          } else {
            obj3 = objArray[0]
            pool3 = parseInt(obj3.get('current')) || 0
          }

          statCost = statCost - pool1
          obj1.setWithWorker('current', 0)
          if (statCost > pool2) {
            statCost = statCost - pool2
            obj2.setWithWorker('current', 0)
            if (statCost > pool3) {
              obj3.setWithWorker('current', 0)
              sendChat(`character|${character.id}`, `He's dead, Jim! ${pool1}, ${pool2}, and ${pool3} down to 0.`)
            } else {
              finalPool = pool3 - statCost
              obj3.setWithWorker('current', finalPool)
              sendChat(`character|${character.id}`, `${stat1} and ${stat2} down to 0. ${stat3}: ${pool3}-${statCost}=${finalPool}`)
            }
          } else {
            finalPool = pool2 - statCost
            obj2.setWithWorker('current', finalPool)
            sendChat(`character|${character.id}`, `${stat1} down to 0. ${stat2}: ${pool2}-${statCost}=${finalPool}`)
          }
        } else {
          // just the current stat is diminished
          finalPool = pool1 - statCost
          obj1.setWithWorker('current', finalPool)
          sendChat(`character|${character.id}`, `${stat1}: ${pool1}-${statCost}=${finalPool}`)
        }
      }
    }

    // Apply damage (or healing if dmgDealt is negative) to Cypher NPC/Creature, and set 'death' marker if health is 0 or less.
    // The Mook or full NPC must have the following attributes:
    // - Level (token bar1)
    // - Health (token bar2)
    // - Armor (token bar3)
    //   * Armor will diminish damage unless applyArmor === 'n'
    function applyDamageOrHealing (tokenId, dmgDealt, applyArmor) {
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

      // Health objects differ between full NPCs and mooks, so they must be declared first
      let health = {}
      let currentHealth = 0
      let maxHealth = 0

      // Is the token linked to a full NPC or just a Mook?
      const isChar = token.get('bar1_link')
      if (isChar) {
        // Full-character NPC: get the health attribute values
        health = findObjs({
          _type: 'attribute',
          _characterid: character.id,
          name: 'health'
        })
        if (!health.length) {
          throw new CypherError(`${name} has no health attribute.`, 'attribute: object', health)
        }
        health = health[0]
        currentHealth = parseInt(health.get('current'))
        maxHealth = parseInt(health.get('max'))
      } else {
        // Mook: get the health bar values
        currentHealth = parseInt(token.get('bar2_value'))
        maxHealth = parseInt(token.get('bar2_max'))
      }

      // If health attribute has no max, set max to current health
      maxHealth = Math.max(currentHealth, maxHealth)

      const npcHealthFinal = Math.min(Math.max((currentHealth - dmgTaken), 0), maxHealth)
      if (!isChar) {
        // Mook: update bars only
        token.set('bar2_value', npcHealthFinal)
        token.set('bar2_max', maxHealth)
      } else {
        // Update character attributes
        health.setWithWorker('max', maxHealth)
        health.setWithWorker('current', npcHealthFinal)
      }
      token.set('status_dead', (npcHealthFinal === 0))
      sendChat('Cypher System', `/w gm ${name} receives ${Math.abs(dmgTaken)} points of ${dmgDealt >= 0 ? `damage (${dmgDealt} - ${armor} Armor)` : 'healing'}. Health: ${currentHealth}->${npcHealthFinal}.`)
    }

    return {
      '!cypher-modstat': modstat,
      '!cypher-npcdmg': applyDamageOrHealing
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
