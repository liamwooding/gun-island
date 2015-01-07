var p2 = Meteor.npmRequire('p2')

Meteor.publish('GameState', function () {
  return GameState.find()
})
Meteor.publish('Characters', function () {
  return Characters.find()
})
Meteor.publish('Turns', function () {
  return Turns.find({}, {
    sort: { number: -1 },
    limit: 1
  })
})

var world
var pause = true
var tick = 0
var explosions = []
var framesToPush = []

// Set up our materials
var projectileMaterial = new p2.Material()
var terrainMaterial = new p2.Material()
var characterMaterial = new p2.Material()

var projectileTerrainContactMaterial = new p2.ContactMaterial(projectileMaterial, terrainMaterial, {
  restitution: 0.7
})

Meteor.startup(function () {
  console.log('starting')
  Characters.remove({})
  GameState.remove({})
  Turns.remove({})

  Meteor.methods({
    addPlayer: function (userId) {
      makeCharacter(userId)
    },
    declareAction: function (userId, action) {
      Characters.update({ userId: userId }, {
        $set: {
          lastTurn: {
            number: Turns.find().count(),
            action: action.action,
            angle: action.angle,
            power: action.power
          }
        }
      })
    }
  })

  Characters.allow({
    update: function (userId, doc) {
      return true
    }
  })

  GameState.insert({
    characters: [],
    currentTurn: {
      state: null,
      actionsRemaining: 0
    },
    aimArrow: null,
    activeBodies: []
  })


  // We'll start with a world
  world = new p2.World()
  //world.sleepMode = p2.World.BODY_SLEEPING

  world.addContactMaterial(projectileTerrainContactMaterial)

  // Then a floor
  var groundBody = new p2.Body({
    mass: 0, // Setting mass to 0 makes this body static
    position: [0, 50]
  })
  var groundShape = new p2.Plane()
  groundShape.styles = {
    lineWidth: 1
  }
  groundShape.material = terrainMaterial
  groundBody.addShape(groundShape)
  world.addBody(groundBody)

  pause = false
  tickPhysics()
})

function tickPhysics (newTurn) {
  if (newTurn === true) {
    var turnNumber = Turns.find().count()
    Characters.find().forEach(function (character) {
      if (character.lastTurn && character.lastTurn.number === turnNumber) {
        if (character.lastTurn.action === 'jump') {
          jump(character.bodyId, character.lastTurn.angle, character.lastTurn.power)
        } else if (character.lastTurn.action === 'shoot') {
          shoot(character.bodyId, character.lastTurn.angle, character.lastTurn.power)
        }
      }
    })
  }
  if (Characters.find().count() === 0) {
    Meteor.setTimeout(function () {
      tickPhysics()
    }, 1000 / 60)
    return
  }
  tick++
  world.step(0.017)
  var bodies = world.bodies.map(function (body) {
    return {
      id: body.id,
      position: body.position,
      shapes: body.shapes,
      shapeOffsets: body.shapeOffsets
    }
  })
  var frame = EJSON.clone({
    bodies: bodies,
    explosions: explosions,
    tick: tick
  })
  framesToPush.push(frame)
  if (framesToPush.length >= 180) {
    Turns.insert({
      frames: framesToPush,
      number: Turns.find().count() + 1
    })
    pause = true
    framesToPush = []
    Meteor.setTimeout(function () {
      pause = false
      tickPhysics(true)
    }, 10000)
  }
  if (!pause) tickPhysics()
}

function makeCharacter (userId) {
  console.log('New player:', userId)
  // Return an object that describes our new character
  var characterBody = new p2.Body({
    mass: 5,
    position: [ Math.random() * 500, 200 ],
    fixedRotation: true
  })

  var characterShape = new p2.Rectangle(5, 20)
  characterBody.addShape(characterShape)

  world.addBody(characterBody)

  characterData = {
    userId: userId,
    health: 100,
    bodyId: characterBody.id,
    takeDamage: function (damage) {
      this.health = Math.round(this.health - damage)
      if (this.health <= 0) this.die()
    },
    die: function () {
      console.log('game over man', this.userId)
      //game.state = 'gameover'
    }
  }

  Characters.insert(characterData)
}

function jump (bodyId, angle, power) {
  var player = world.getBodyById(bodyId)
  player.wakeUp()
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians))
  var stepY = (power * Math.sin(radians))
  player.velocity = [player.velocity[0] +stepX, player.velocity[1] - stepY]
  console.log(player.velocity)
}

function shoot (bodyId, angle, power) {
  var player = world.getBodyById(bodyId)
  // We use the angle to work out how many pixels we should move the projectile each frame
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians)) * 1.5
  var stepY = (power * Math.sin(radians)) * 1.5
  var startX = Math.cos(radians) * 20
  var startY = Math.sin(radians) * 20
  var projectileBody = new p2.Body({
    mass: 3,
    position: [player.position[0] +startX, player.position[1] - startY]
  })
  var projectileShape = new p2.Circle(5)
  projectileShape.material = projectileMaterial
  projectileBody.addShape(projectileShape)

  world.addBody(projectileBody)
  projectileBody.velocity = [stepX, -stepY]
  projectileBody.gameData = {
    bounced: 0
  }

  world.on('impact', function (impact) {
    var impactedProjectile
    if (impact.bodyA.id === projectileBody.id) impactedProjectile = impact.bodyA
    if (impact.bodyB.id === projectileBody.id) impactedProjectile = impact.bodyB
    
    if (impactedProjectile) {
      if (game.characters.some(function (char) { char.id === impact.bodyA.id || char.id === impact.bodyB.id })) {
        projectile.gameData.bounced++
        impactProjectile(impactedProjectile, 100, 0.5, world)
      } else {
        impactProjectile(impactedProjectile, 100, 0.5, world)
      }
    }
  })
}

function impactProjectile (projectile, explosionSize, damageFactor, world) {
  // setTimeout(function () {
  //   projectile.gameData.bounced++
  // }, 25)

  // game.explosions.push({
  //   position: projectile.position,
  //   maxSize: explosionSize,
  //   size: 1
  // })

  // game.characters.forEach(function (char) {
  //   var charBody = world.getBodyById(char.id)
  //   var relativePosition = [
  //     charBody.position[0] - projectile.position[0],
  //     charBody.position[1] - projectile.position[1]
  //   ]
  //   var distance = Math.sqrt(Math.pow((relativePosition[0]), 2) + Math.pow((relativePosition[1]), 2))
  //   var radians = Math.atan2(relativePosition[1], relativePosition[0])

  //   if (distance < explosionSize) {
  //     char.takeDamage((explosionSize - distance) * damageFactor)
  //     var stepX = (explosionSize * Math.cos(radians)) / (Math.sqrt(distance))
  //     var stepY = (explosionSize * Math.sin(radians)) / (Math.sqrt(distance))
  //     console.log(charBody.velocity)
  //     charBody.velocity = [ charBody.velocity[0] + stepX, charBody.velocity[1] + stepY ]
  //     console.log(charBody.velocity)
  //   }
  // })

  world.removeBody(projectile)
}
