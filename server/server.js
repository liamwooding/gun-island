var p2 = Meteor.npmRequire('p2')

Meteor.publish('GameState', function () {
  return GameState.find()
})
Meteor.publish('Characters', function () {
  return Characters.find()
})
Meteor.publish('Players', function () {
  return Players.find()
})
Meteor.publish('Frames', function () {
  return Frames.find({}, { sort: { tick: 1 } })
})
Meteor.publish('Turns', function () {
  return Turns.find({}, {sort: { number: 1 }})
})

var world

Meteor.startup(function () {
  Characters.remove({})
  Meteor.methods({
    addPlayer: function (userId) {
      makeCharacter(userId)
    }
  })

  Turns.allow({
    update: function () {
      return true
    }
  })

  Players.allow({
    insert: function (userId, doc) {
      return doc.userId === userId
    },
    update: function (userId, doc) {
      return doc.userId === userId
    }
  })

  GameState.insert({
    characters: [],
    currentTurn: {
      state: null,
      actionsRemaining: 0
    },
    explosions: [],
    aimArrow: null,
    activeBodies: []
  })


  // We'll start with a world
  world = new p2.World()
  world.sleepMode = p2.World.BODY_SLEEPING

  // Set up our materials
  var projectileMaterial = new p2.Material()
  var terrainMaterial = new p2.Material()
  var characterMaterial = new p2.Material()

  var projectileTerrainContactMaterial = new p2.ContactMaterial(projectileMaterial, terrainMaterial, {
    restitution: 0.7
  })

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

  var pause = true
  var tick = 0
  var explosions = []
})

function tickPhysics () {
  if (pause === true) return
  tick++
  world.step(0.017)
  var frame = {
    bodies: world.bodies.map(function (body) {
      return {
        id: body.id,
        position: body.position,
        shapes: body.shapes,
        shapeOffsets: body.shapeOffsets
      }
    }),
    explosions: explosions,
    tick: tick
  }
  Frames.insert(frame)
  tickPhysics()
}

function makeCharacter (userId) {
  console.log('New player:', userId)
  // Return an object that describes our new character
  var characterBody = new p2.Body({
    mass: 5,
    position: [ Math.random() * 500, 100 ],
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

function nextTurn () {
  Turns.insert({
    number: Turns.count() + 1
  })
}