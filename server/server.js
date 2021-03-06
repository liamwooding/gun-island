Meteor.publish('GameState', function () {
  return GameState.find()
})
Meteor.publish('Characters', function () {
  return Characters.find()
})
Meteor.publish('Bodies', function () {
  return Bodies.find()
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
var lastTurnTime
var turnTimeout

// Set up our materials
var projectileMaterial = new p2.Material()
var terrainMaterial = new p2.Material()
var characterMaterial = new p2.Material()

var projectileTerrainContactMaterial = new p2.ContactMaterial(projectileMaterial, terrainMaterial, {
  restitution: 0.7
})

Meteor.startup(function () {
  Characters.remove({})
  GameState.remove({})
  Turns.remove({})
  Bodies.remove({})

  Meteor.methods({
    addPlayer: function (userId) {
      makeCharacter(userId)
    },
    declareAction: function (userId, action) {
      var charAction = {
        'lastTurn.number': Turns.find().count(),
        'lastTurn.shotsFired': action.shotsFired
      }
      charAction['lastTurn.shot'+ action.shotsFired] = {
        angle: action.angle,
        power: action.power
      }
      Characters.update({ userId: userId }, {
        $set: charAction
      })
      if (Characters.find({
        'lastTurn.number': Turns.find().count(),
        'lastTurn.shotsFired': Config.actions.shotsPerTurn
      }).count() === Characters.find().count()) {
        console.log('Ending turn early')
        Turns.insert({
          number: Turns.find().count() + 1,
          state: 'play'
        })
        pause = false
        tickPhysics(true)
        Meteor.clearTimeout(turnTimeout)
      }
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
  world = new p2.World({
    gravity: [ 0, 0 ]
  })

  world.on('addBody', function (event) {
    Bodies.insert({
      physicsId: event.body.id,
      position: event.body.position,
      shapes: event.body.shapes,
      data: event.body.data
    })
  })

  world.on('impact', function (impact) {
    var impactedProjectile, typeA, typeB
    if (impact.bodyA.data && impact.bodyA.data.type) typeA = impact.bodyA.data.type
    if (impact.bodyB.data && impact.bodyB.data.type) typeB = impact.bodyB.data.type
    
    if (typeA === 'projectile') impactProjectile(impact.bodyA, 40)
    if (typeB === 'projectile') impactProjectile(impact.bodyB, 40)

    if (typeA === 'character' && typeB === 'projectile') killCharacter(impact.bodyA)
    if (typeB === 'character' && typeA === 'projectile') killCharacter(impact.bodyB)
  })
  genTerrain()

  Turns.insert({
    number: 1,
    state: 'play'
  })

  pause = false
  tickPhysics(true)
})

function tickPhysics (newTurn) {
  if (Characters.find().count() === 0) {
    Meteor.setTimeout(function () {
      tickPhysics(true)
    }, 1000)
    return
  }
  if (newTurn === true) {
    console.log('Rendering')
    lastTurnTime = Date.now()
    var turnNumber = Turns.find().count()
    Characters.find().forEach(function (char) {
      if (char.lastTurn && char.lastTurn.number === turnNumber - 1) {
        if (char.lastTurn.shot1) shoot(char.physicsId, char.lastTurn.shot1.angle, char.lastTurn.shot1.power)
        if (char.lastTurn.shot2) shoot(char.physicsId, char.lastTurn.shot2.angle, char.lastTurn.shot2.power)
      }
    })
  }
  tick++
  world.step(0.017)

  var bodyPositions = world.bodies.map(function (body) {
    if (body.data && body.data.type === 'explosion') {
      body.data.size += body.data.size * 0.4
      if (body.data.size > body.data.maxSize) world.removeBody(body)
    }
    return {
      physicsId: body.id,
      x: body.position[0],
      y: body.position[1],
      angularVelocity: body.angularVelocity
    }
  })

  BodiesStream.emit('positions', bodyPositions)
  BodiesStream.permissions.read(function (userId, eventName) {
    return true
  })

  if (Date.now() >= lastTurnTime + Config.playTime) {
    console.log('Starting new turn')
    
    pause = true
    lastTurnTime = Date.now()
    var lastTurn = Turns.findOne({ number: Turns.find().count() })
    Turns.update(lastTurn, { $set: { state: 'turn' } })
    turnTimeout = Meteor.setTimeout(function () {
      if (pause) {
        Turns.insert({
          number: Turns.find().count() + 1,
          state: 'play'
        })
        pause = false
        tickPhysics(true)
      }
    }, Config.turnTime)
  }
  if (!pause) Meteor.setTimeout(tickPhysics, Math.round(1000 / 60))
}

function makeCharacter (userId) {
  console.log('New player:', userId)
  // Return an object that describes our new character
  var characterBody = new p2.Body({
    mass: 5,
    position: Config.positions[Characters.find().count()],
    fixedRotation: true
  })

  var characterShape = new p2.Circle(15)
  characterBody.addShape(characterShape)
  characterBody.data = {
    type: 'character',
    userId: userId
  }
  characterBody.damping = 0.9
  world.addBody(characterBody)

  characterData = {
    userId: userId,
    health: 100,
    physicsId: characterBody.id,
    number: Characters.find().count(),
    deaths: 0
  }

  Characters.insert(characterData)
}

function killCharacter (character) {
  var mongoChar = Characters.findOne({ physicsId: character.id })
  Characters.update(mongoChar, { $inc: { deaths: 1 } })
  character.position = Config.positions[mongoChar.number].slice()
  character.velocity = [ 0, 0 ]
  console.log(Config.positions[mongoChar.number])
}

function shoot (bodyId, angle, power) {
  var player = world.getBodyById(bodyId)
  var shootCfg = Config.actions.shoot
  // We use the angle to work out how many pixels we should move the projectile each frame
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians))
  var stepY = (power * Math.sin(radians))
  var startX = Math.cos(radians) * 20
  var startY = Math.sin(radians) * 25
  var projectileBody = new p2.Body({
    mass: 1,
    position: [player.position[0] + startX, player.position[1] - startY]
  })
  var projectileShape = new p2.Circle(2)
  projectileShape.material = projectileMaterial
  projectileBody.addShape(projectileShape)
  projectileBody.data = {
    type: 'projectile',
    shooterId: bodyId
  }

  world.addBody(projectileBody)
  projectileBody.velocity = [ stepX * shootCfg.velocityFactor, -stepY * shootCfg.velocityFactor ]
  player.applyForce([ -stepX * shootCfg.kickBackFactor, stepY * shootCfg.kickBackFactor ], player.position )
}

function impactProjectile (projectile, explosionSize) {
  // Characters.find().forEach(function (char) {
  //   var charBody = world.getBodyById(char.physicsId)
  //   var relativePosition = [
  //     charBody.position[0] - projectile.position[0],
  //     charBody.position[1] - projectile.position[1]
  //   ]
  //   var distance = Math.sqrt(Math.pow((relativePosition[0]), 2) + Math.pow((relativePosition[1]), 2))
  //   var radians = Math.atan2(relativePosition[1], relativePosition[0])

  //   if (distance < explosionSize) {
  //     var stepX = (explosionSize * Math.cos(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
  //     var stepY = (explosionSize * Math.sin(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
  //     charBody.applyForce([ charBody.velocity[0] + stepX, charBody.velocity[1] + stepY ], charBody.position)
  //   }
  // })

  Bodies.remove({ physicsId: projectile.id })
  world.removeBody(projectile)
}

function genTerrain () {
  var walls = [
    {
      x: 0,
      y: 400,
      width: 30,
      height: 800
    },
    {
      x: 400,
      y: 800,
      width: 800,
      height: 30
    },
    {
      x: 800,
      y: 400,
      width: 30,
      height: 800
    },
    {
      x: 400,
      y: 0,
      width: 800,
      height: 30
    },
  ]
  walls.forEach(function (island) {
    var boundsBody = new p2.Body({
      type: p2.Body.STATIC,
      position: [ island.x, island.y ]
    })
    boundsShape = new p2.Rectangle(island.width, island.height)
    boundsBody.addShape(boundsShape)
    boundsBody.data = { type: 'bounds' }
    world.addBody(boundsBody)
  })

  var tables = [
    {
      x: 250,
      y: 250,
      radius: 50
    },
    {
      x: 550,
      y: 250,
      radius: 50
    },
    {
      x: 250,
      y: 550,
      radius: 50
    },
    {
      x: 550,
      y: 550,
      radius: 50
    }
  ]

  tables.forEach(function (table) {
    var tableBody = new p2.Body({
      type: p2.Body.STATIC,
      position: [ table.x, table.y ]
    })
    tableShape = new p2.Circle(table.radius)
    tableBody.addShape(tableShape)
    tableBody.data = { type: 'obstacle' }
    world.addBody(tableBody)
  })
}
