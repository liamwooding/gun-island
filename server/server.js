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

  world.on('impact', function (impact) {
    var impactedProjectile
    if (impact.bodyA.data && impact.bodyA.data.type === 'projectile') impactedProjectile = impact.bodyA
    if (impact.bodyB.data && impact.bodyB.data.type === 'projectile') impactedProjectile = impact.bodyB
    
    if (impactedProjectile) {
      impactProjectile(impactedProjectile, 40)
    }
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

  world.bodies.forEach(function (body) {
    if (body.data && body.data.type === 'explosion') {
      body.data.size += body.data.size * 0.4
      if (body.data.size > body.data.maxSize) world.removeBody(body)
    }
    var bodyObject = {
      physicsId: body.id,
      position: body.position,
      shapes: body.shapes,
      data: body.data
    }
    var mongoBody = Bodies.findOne({ physicsId: body.id })
    if (mongoBody) Bodies.update(mongoBody, bodyObject)
    else Bodies.insert(bodyObject)
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
    position: [ 100 + (Math.random() * 500), 500 ],
    fixedRotation: true
  })

  var characterShape = new p2.Rectangle(15, 20)
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
    physicsId: characterBody.id
  }

  Characters.insert(characterData)
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
    mass: Config.actions.shoot.bulletMass,
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
  Characters.find().forEach(function (char) {
    var charBody = world.getBodyById(char.physicsId)
    var relativePosition = [
      charBody.position[0] - projectile.position[0],
      charBody.position[1] - projectile.position[1]
    ]
    var distance = Math.sqrt(Math.pow((relativePosition[0]), 2) + Math.pow((relativePosition[1]), 2))
    var radians = Math.atan2(relativePosition[1], relativePosition[0])

    if (distance < explosionSize) {
      var stepX = (explosionSize * Math.cos(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
      var stepY = (explosionSize * Math.sin(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
      charBody.applyForce([ charBody.velocity[0] + stepX, charBody.velocity[1] + stepY ], charBody.position)
    }
  })

  Bodies.remove({ physicsId: projectile.id })
  world.removeBody(projectile)
}

function genTerrain () {
  var obstacles = [
    {
      x: 500,
      y: 400,
      width: 150,
      height: 200
    },
    {
      x: 0,
      y: 400,
      width: 150,
      height: 150
    },
    {
      x: 300,
      y: 800,
      width: 800,
      height: 50
    },
    {
      x: 900,
      y: 500,
      width: 50,
      height: 200
    },
  ]

  obstacles.forEach(function (island) {
    var obstacleBody = new p2.Body({
      type: p2.Body.STATIC,
      position: [ island.x, island.y ]
    })
    obstacleShape = new p2.Rectangle(island.width, island.height)
    obstacleBody.addShape(obstacleShape)
    obstacleBody.data = { type: 'obstacle' }
    world.addBody(obstacleBody)
  })
}
