/* globals createObj, findObjs, getAttrByName, getObj, log, on, sendChat */
const CypherSystemsByRoll20 = (function () {
  'use strict'
  const version = '1.1.0'
  const modified = '2020-01-04'
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
    // Applies cost of skills and abilities to PC stat pools, and shows chat warnings if one or more pools are at zero.
    function modifyStat (characterId, statName, statCost) {
      const character = getObj('character', characterId)
      if (!character) {
        throw new CypherError('Character ID not found', 'characterId: string', characterId)
      }
      if (!parseInt(statCost, 10)) {
        throw new CypherError('Cost is not a number.', 'statCost: number', statCost)
      }

      let stat1
      let stat2
      let stat3

      let max1 = 0
      let max2 = 0
      let max3 = 0

      let pool1 = 0
      let pool2 = 0
      let pool3 = 0
      let finalPool = 0

      let attr1 = findObjs({
        _type: 'attribute',
        _characterid: character.id,
        name: stat1
      })[0]

      switch (statName) {
        case 'recovery-rolls': {
          if (attr1) {
            attr1.set('current', statCost)
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
          stat1 = 'might'
          stat2 = 'speed'
          stat3 = 'intellect'
          // fallthrough
        case 'speed':
          stat1 = 'speed'
          stat2 = 'might'
          stat3 = 'intellect'
          // fallthrough
        case 'intellect': {
          stat1 = 'intellect'
          stat2 = 'might'
          stat3 = 'speed'
          if (attr1.length) {
            pool1 = parseInt(attr1.get('current')) || 0
            max1 = parseInt(attr1.get('max')) || 0
          } else {
            attr1 = createObj('attribute', {
              characterid: character.id,
              name: stat1,
              current: pool1,
              max: max1
            })
          }

          // If first pool depleted, reduce second stat
          if (statCost > pool1) {
            statCost -= pool1
            attr1.set('current', 0)
            let attr2 = findObjs({
              _type: 'attribute',
              _characterid: character.id,
              name: stat2
            })[0]
            if (attr2.length) {
              pool2 = parseInt(attr2.get('current')) || 0
              max2 = parseInt(attr2.get('max')) || 0
            } else {
              attr2 = createObj('attribute', {
                characterid: character.id,
                name: stat2,
                current: pool2,
                max: max2
              })
            }

            // If second pool depleted, reduce third stat
            if (statCost > pool2) {
              statCost -= pool2
              attr2.set('current', 0)
              let attr3 = findObjs({
                _type: 'attribute',
                _characterid: character.id,
                name: stat3
              })[0]
              if (attr3.length) {
                pool3 = parseInt(attr3.get('current')) || 0
                max3 = parseInt(attr3.get('max')) || 0
              } else {
                attr3 = createObj('attribute', {
                  characterid: character.id,
                  name: stat3,
                  current: pool3,
                  max: max3
                })
              }

              // If third pool depleted, player is dead
              if (statCost >= pool3) {
                attr3.set('current', 0)
                sendChat(`character|${character.id}`, `He's dead, Jim! ${pool1}, ${pool2}, and ${pool3} down to 0.`)
              // One pool remaining
              } else {
                finalPool = pool3 - statCost
                attr3.set('current', finalPool)
                sendChat(`character|${character.id}`, `${stat1} and ${stat2} down to 0. ${stat3}: ${pool3}-${statCost}=${finalPool}`)
              }
            // Two pools remaining
            } else {
              finalPool = pool2 - statCost
              attr2.set('current', finalPool)
              sendChat(`character|${character.id}`, `${stat1} down to 0. ${stat2}: ${pool2}-${statCost}=${finalPool}`)
            }
          // Three pools remaining
          } else {
            finalPool = pool1 - statCost
            attr1.set('current', finalPool)
            sendChat(`character|${character.id}`, `${stat1}: ${pool1}-${statCost}=${finalPool}`)
          }
          break
        }

        default: {
          sendChat(`character|${character.id}`, `&{template:default} {{modstat=1}} {{noAttribute=${statName}}}`)
          break
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
        })
        if (!health.length) {
          throw new CypherError(`${name} has no health attribute.`, 'attribute: object', health)
        }
        health = health[0]
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

    return {
      '!cypher-modstat': modifyStat,
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
