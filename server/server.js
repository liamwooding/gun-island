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

  genTerrain(150, 30)

  pause = false
  tickPhysics()
})

function tickPhysics (newTurn) {
  if (Characters.find().count() === 0) {
    Meteor.setTimeout(function () {
      tickPhysics()
    }, 1000)
    return
  }
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
  tick++
  world.step(0.017)
  world.bodies.forEach(function (body) {
    if (body.data && body.data.type === 'explosion') {
      body.data.size += body.data.size * 0.4
      if (body.data.size > body.data.maxSize) world.removeBody(body)
    }
  })
  var bodies = world.bodies.map(function (body) {
    return {
      id: body.id,
      position: body.position,
      shapes: body.shapes,
      shapeOffsets: body.shapeOffsets,
      data: body.data
    }
  })
  var frame = EJSON.clone({
    bodies: bodies,
    explosions: explosions,
    tick: tick
  })
  framesToPush.push(frame)
  if (framesToPush.length >= Config.playTime / 16.7) {
    Turns.insert({
      frames: framesToPush,
      number: Turns.find().count() + 1,
      time: Date.now()
    })
    pause = true
    framesToPush = []
    Meteor.setTimeout(function () {
      pause = false
      tickPhysics(true)
    }, Config.playTime + Config.turnTime)
  }
  if (!pause) tickPhysics()
}

function makeCharacter (userId) {
  console.log('New player:', userId)
  // Return an object that describes our new character
  var characterBody = new p2.Body({
    mass: 5,
    position: [ 100 + (Math.random() * 500), 200 ],
    fixedRotation: true
  })

  var characterShape = new p2.Rectangle(15, 20)
  characterBody.addShape(characterShape)

  world.addBody(characterBody)

  characterData = {
    userId: userId,
    health: 100,
    bodyId: characterBody.id
  }

  Characters.insert(characterData)
}

function jump (bodyId, angle, power) {
  var player = world.getBodyById(bodyId)
  player.wakeUp()
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians)) * Config.actions.jump.velocityFactor
  var stepY = (power * Math.sin(radians)) * Config.actions.jump.velocityFactor
  player.velocity = [player.velocity[0] + stepX, player.velocity[1] - stepY]
  console.log(player.velocity)
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
  console.log(startX, startY)
  var projectileBody = new p2.Body({
    mass: Config.actions.shoot.bulletMass,
    position: [player.position[0] + startX, player.position[1] - startY]
  })
  var projectileShape = new p2.Circle(5)
  projectileShape.material = projectileMaterial
  projectileBody.addShape(projectileShape)
  projectileBody.data = {
    shooterId: bodyId
  }

  world.addBody(projectileBody)
  projectileBody.velocity = [player.velocity[0] + (stepX * shootCfg.velocityFactor), player.velocity[1] + (-stepY * shootCfg.velocityFactor)]
  player.velocity = [player.velocity[0] - (stepX * shootCfg.kickBackFactor), player.velocity[1] + (stepY * shootCfg.kickBackFactor)]

  world.on('impact', function (impact) {
    var impactedProjectile
    if (impact.bodyA.id === projectileBody.id) impactedProjectile = impact.bodyA
    if (impact.bodyB.id === projectileBody.id) impactedProjectile = impact.bodyB
    
    if (impactedProjectile) {
      impactProjectile(impactedProjectile, 100)
    }
  })
}

function impactProjectile (projectile, explosionSize) {
  Characters.find().forEach(function (char) {
    var charBody = world.getBodyById(char.bodyId)
    var relativePosition = [
      charBody.position[0] - projectile.position[0],
      charBody.position[1] - projectile.position[1]
    ]
    var distance = Math.sqrt(Math.pow((relativePosition[0]), 2) + Math.pow((relativePosition[1]), 2))
    var radians = Math.atan2(relativePosition[1], relativePosition[0])

    if (distance < explosionSize) {
      var stepX = (explosionSize * Math.cos(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
      var stepY = (explosionSize * Math.sin(radians)) / (Math.sqrt(distance)) * Config.actions.shoot.explosionForce
      charBody.velocity = [ charBody.velocity[0] + stepX, charBody.velocity[1] + stepY ]
    }
  })

  var explosionBody = new p2.Body({
    type: p2.Body.STATIC,
    mass: 1,
    position: projectile.position
  })
  var explosionShape = new p2.Particle()
  explosionBody.addShape(explosionShape)
  explosionBody.data = {
    type: 'explosion',
    size: 1,
    maxSize: explosionSize
  }
  world.addBody(explosionBody)
  world.removeBody(projectile)
}

function genTerrain (height, variance) {
  var xPoints = []
  var yPoints = []
  // Get a number between 5 and 15. This will be the number of angles along our line
  var numberOfPoints = Math.round(20 + (Math.random() * 20))
  // Loop over this number, generating a number at least as high as 'floor' and as large as 'floor + height'
  // These will represent the height of the peaks and valleys of our terrain
  for (var i = 0; i < numberOfPoints; i++) {
    var point
    if (i === 0) point = Math.random() * height
    else {
      point = yPoints[i-1] + (Math.random() * variance) - (variance / 2) 
    } 
    yPoints.push(point)
  }
  // We do something similar again to decide how far apart these points are on the X axis, adding the previous value to
  // each new random number so we get an increasing list of numbers with random gaps between them
  for (var i = 0; i < numberOfPoints; i++) {
    if (i > 0) var point = xPoints[i - 1] + 10 + (Math.random() * 100)
    else var point = 10 + (Math.random() * 100)
    xPoints.push(point)
  }
  // However, we now have a range of points on the X axis that may be larger than the width of our screen, so we squash them down
  // Get the last point and divide it by the screen width, then multiply all points by this number
  var squashFactor = 600 / (xPoints[xPoints.length - 1])
  
  // Array.map() is a neato functional way of turning an array into another array
  // We're looping through our array and making a new array of vector objects
  var terrainVertices = xPoints.map(function (xPoint, i) {
    return [
      Math.round(xPoint * squashFactor),
      Math.round(yPoints[i])
    ]
  })
  // We'll stretch the shape out way beyond the edges of the screen to be safe
  var bottomRightCorner = [600, -400]
  var bottomLeftCorner = [0, -400]
  terrainVertices.push(bottomRightCorner)
  terrainVertices.push(bottomLeftCorner)

  var islandBody = new p2.Body({
    position: [200, 0]
  })
  islandBody.fromPolygon(terrainVertices)

  world.addBody(islandBody)
}
