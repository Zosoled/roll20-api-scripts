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
    function modifyStat (args) {
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

    // expected parameter array: token_id|damage|apply_armor_y/n
    function npcDamage (args) {
      if (!Array.isArray(args)) {
        throw new CypherError('Invalid command arguments.', 'token_id: string\ndamage: number\napply_armor_y/n: boolean', args)
      }

      if (args.length !== 3) {
        throw new CypherError('Command requires 3 arguments.', 'token_id: string\ndamage: number\napply_armor_y/n: boolean', args.join('\n'))
      }

      const token = getObj('graphic', args[0])
      if (!token) {
        throw new CypherError('Token not found.', 'token_id: string', args[0])
      }

      const character = getObj('character', token.get('represents'))
      if (!character) {
        throw new CypherError('Token does not represent a character.', 'token_id.represents: string', args[0])
      }

      const dmgDealt = parseInt(args[1], 10)
      if (!dmgDealt) {
        throw new CypherError('Damage dealt is not a number.', 'damage: number', args[0])
      }

      const applyArmor = args[2]

      // Apply damage (or healing if dmgDealt is negative ...) to Cypher NPC/Creature
      // And set 'death' marker if health is 0 or less.
      // The Mook or Non Player full Character must have the following attributes:
      // - Level (token bar1)
      // - Health (token bar2)
      // - Armor (token bar3)
      //   * Armor will diminish damage unless applyArmor === 'n'
      const npcName = character.get('name')
      let dmg = dmgDealt
      let npcHealth = 0
      let npcMaxHealth = 0
      let npcArmor = 0
      let attributes = {}
      if (applyArmor !== 'n') {
        npcArmor = parseInt(getAttrByName(character.id, 'armor', 'current'), 10) || 0
      }
      // Is the token linked to the character ('full NPC') or a Mook ?
      const isChar = token.get('bar1_link')
      if (!isChar) {
        // Mook: get the bars value
        npcHealth = parseInt(token.get('bar2_value'))
        npcMaxHealth = parseInt(token.get('bar2_max'))
      } else {
        // Full-character NPC, so get the attributes values
        attributes = findObjs({
          _type: 'attribute',
          _characterid: character.id,
          name: 'health'
        })
        if (!attributes && !attributes.length) {
          throw new CypherError(`${npcName} has no health attribute.`, 'attribute: object', attributes)
        } else {
          npcHealth = parseInt(attributes[0].get('current')) || 0
          npcMaxHealth = parseInt(attributes[0].get('max')) || 0
        }
      }
      // In case the Health attribute has no maximum value
      npcMaxHealth = Math.max(npcHealth, npcMaxHealth)
      if (dmg > 0) {
        dmg = Math.max((dmg - npcArmor), 0)
      }
      const npcHealthFinal = Math.min(Math.max((npcHealth - dmg), 0), npcMaxHealth)
      if (isChar === '') {
        // Mook: update bars only
        token.set('bar2_max', npcMaxHealth)
        token.set('bar2_value', npcHealthFinal)
      } else {
        // Update character attributes
        attributes[0].setWithWorker('max', npcMaxHealth)
        attributes[0].setWithWorker('current', npcHealthFinal)
      }
      token.set('status_dead', (npcHealthFinal === 0))
      sendChat('Cypher System', `/w gm ${npcName} receives ${Math.abs(dmg)} points of ${dmgDealt >= 0 ? `damage (${dmgDealt} - ${npcArmor} Armor)` : 'healing'}. Health: ${npcHealth}->${npcHealthFinal}.`)
    }

    return {
      '!cypher-modstat': modifyStat,
      '!cypher-npcdmg': npcDamage
    }
  })()

  function executeChatCommand (msg) {
    const validCommand = /^!cypher-\w+(\s|%20).+$/
    if (msg.type === 'api' && validCommand.test(msg.content)) {
      const command = msg.content.split(' ')[0]
      const args = msg.content.split(' ')[1].split('|')
      try {
        CypherChatCommands[command](args)
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
