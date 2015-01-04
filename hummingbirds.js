// Set up the state of our game first
var game = {
  characters: [],
  currentTurn: {
    state: null,
    actionsRemaining: 0
  },
  explosions: [],
  aimArrow: null,
  activeBodies: []
}
var styles = {
  colours: {
    sky: '#58A2C4',
    ground: '#FFFFFF',
    player1: '#CB461D',
    player2: '#10326F',
    ball1: '#AE1E3B',
    ball2: '#AE1E3B',
    explosion: '#F1D432',
    jumpArrow: '#FFFFFF',
    shotArrow: '#AE1E3B'
  }
}
// Setup our canvas for drawing the game world onto
var worldCanvas = document.getElementById('world')
worldCanvas.width = window.innerWidth
worldCanvas.height = window.innerHeight
var worldContext = worldCanvas.getContext('2d')
// Setup a canvas for drawing UI elements onto
var uiCanvas = document.getElementById('ui')
uiCanvas.width = window.innerWidth
uiCanvas.height = window.innerHeight
var uiContext = uiCanvas.getContext('2d')
// Setup HammerJS, the mouse/touch gesture library we'll use for the controls
var hammer = new Hammer(uiCanvas)
// HammerJS only listens for horizontal drags by default, here we tell it listen for all directions
hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL })

var camera = {
  zoom: 1,
  x: 0,
  y: 0
}

var messages = {
  'aiming-jump': 'Aim a jump by dragging in the opposite direction',
  'aiming-shot': 'Shots bounce once before exploding'
}

// resize canvas when the browser is resized
window.addEventListener('resize', function () {
  worldCanvas.width = window.innerWidth
  worldCanvas.height = window.innerHeight
  uiCanvas.width = window.innerWidth
  uiCanvas.height = window.innerHeight
}, true)

// We'll start with a world
var world = new p2.World()
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

makeCharacter('player1', { x: 50, y: 61 })
makeCharacter('player2', { x: worldCanvas.width - 50, y: 61 })

// Set up our click listeners for the action buttons (using jquery, for readability's sake)
$('button.jump').on('click', function () {
  $(this).addClass('active')
  game.currentTurn.state = 'aiming-jump'
  aim(function (angle, power) {
    jump(angle, power, function () {
      console.log('jumped!')
    })
  })
})
$('button.shoot').on('click', function () {
  $(this).addClass('active')
  game.currentTurn.state = 'aiming-shot'
    aim(function (angle, power) {
      fireProjectile(angle, power)
    })
})
$('button.active').on('click', function () {
  $(this).removeClass('active')
  setupCameraControls()
})

setupCameraControls()

// Used by our animation loop to store the time
var then = null

requestAnimationFrame(render)

function render (now) {
  // dt stands for delta time, our 'time between frames' - used for smooth animating
  var dt = (now - (then || now)) / 1000
  then = now

  world.step(0.017, dt, 3)

  worldContext.clearRect(0, 0, worldCanvas.width, worldCanvas.height)
  world.bodies.forEach(function (body) {
    drawBody(body)
  })

  drawUI()
  var sleeping = game.activeBodies.every(function (bodyId) {
    var body = world.getBodyById(bodyId)
    return body.sleepState === p2.Body.SLEEPING
  })
  if (sleeping && game.currentTurn.actionsRemaining == 0) nextTurn()

  requestAnimationFrame(render)
}

function translateToCamera (position) {
  var x = (position[0] - camera.x) * camera.zoom
  var y = (position[1] - camera.y) * camera.zoom
  return [x, y]
}

function scaleToCamera (position) {
  var x = position[0] * camera.zoom
  var y = position[1] * camera.zoom
  return [x, y]
}

function setupCameraControls () {
  hammer.off('panstart pan panend')
  hammer.on('pan', function (event) {
    camera.x += event.velocityX
    camera.y -= event.velocityY
  })
  $(document).on('mousewheel', function(event) {
    camera.zoom += event.deltaY / 20
  })
}

function drawBody (body) {
  body.shapes.forEach(function (shape, i) {
    worldContext.beginPath()
    worldContext.fillStyle = shape.styles && shape.styles.fillStyle ? shape.styles.fillStyle : '#000000'
    worldContext.strokeStyle = shape.styles && shape.styles.strokeStyle ? shape.styles.strokeStyle : '#000000'
    worldContext.lineWidth = shape.styles && shape.styles.lineWidth ? shape.styles.lineWidth : 2
    
    if (shape.type === p2.Shape.PLANE) {
      worldContext.moveTo(0, translateToCamera(body.position)[1])
      worldContext.lineTo(worldCanvas.width, translateToCamera(body.position)[1])
    } else if (shape.type === p2.Shape.CIRCLE) {
      var shapePosition = [body.position[0] +  body.shapeOffsets[i][0], body.position[1] +  body.shapeOffsets[i][1]]
      shapePosition = translateToCamera(shapePosition)
      worldContext.arc(shapePosition[0], shapePosition[1], shape.radius, 0, 2 * Math.PI)
    } else {
      var shapePosition = [body.position[0] +  body.shapeOffsets[i][0], body.position[1] +  body.shapeOffsets[i][1]]
      shapePosition = translateToCamera(shapePosition)
      var vertices = shape.vertices.map(function (vertex) {
        return scaleToCamera(vertex)
      })
      worldContext.moveTo(shapePosition[0] + vertices[0][0], shapePosition[1] + vertices[0][1])
      vertices.slice(1, vertices.length).forEach(function (vertex) {
        worldContext.lineTo(shapePosition[0] + vertex[0], shapePosition[1] + vertex[1])
      })
    }
    worldContext.closePath()
    worldContext.fill()
    worldContext.stroke()
  })
}

function makeCharacter (name, position) {
  console.log(name, position)
  // Return an object that describes our new character
  var characterBody = new p2.Body({
    mass: 5,
    position: [ position.x, position.y ],
    fixedRotation: true
  })

  var characterShape = new p2.Rectangle(5, 20)
  characterBody.addShape(characterShape)

  world.addBody(characterBody)

  characterData = {
    name: name,
    health: 100,
    id: characterBody.id,
    takeDamage: function (damage) {
      this.health = Math.round(this.health - damage)
      if (this.health <= 0) this.die()
    },
    die: function () {
      console.log('game over man')
      game.state = 'gameover'
    }
  }

  game.characters.push(characterData)
  game.activeBodies.push(characterBody.id)
}

function drawUI () {
  var translatedPlayerPosition = translateToCamera(world.getBodyById(game.characters[0].id).position)
  $('.action-buttons').offset({left: translatedPlayerPosition[0], top: uiCanvas.height - translatedPlayerPosition[1]})

  // We draw anything which isn't governed by the physics engine in this function
  uiContext.clearRect(0, 0, uiCanvas.width, uiCanvas.height)

  // Draw any ongoing explosions
  game.explosions.forEach(function (explosion, i) {
    if (explosion.size >= explosion.maxSize) game.explosions.splice(i, 1)
    uiContext.beginPath()
    var translatedPosition = translateToCamera(explosion.position)
    uiContext.arc(translatedPosition[0], uiCanvas.height - translatedPosition[1], explosion.size, 0, Math.PI * 2, false)
    uiContext.lineWidth = explosion.size * 0.1
    uiContext.strokeStyle = styles.colours.ball1
    uiContext.fillStyle = styles.colours.explosion
    uiContext.stroke()
    uiContext.fill()
    explosion.size += explosion.size * 0.4
  })

  if (game.aimArrow && game.aimArrow.power > 10) {
    // Do some maths I copied from the internet
    var radians = game.aimArrow.angle * Math.PI / 180
    var arrowToX = game.aimArrow.start.x - (game.aimArrow.power * Math.cos(radians) * 2)
    var arrowToY = game.aimArrow.start.y - (game.aimArrow.power * Math.sin(radians) * 2)
    // Draw the line
    uiContext.moveTo(game.aimArrow.start.x, game.aimArrow.start.y)
    uiContext.lineTo(arrowToX, arrowToY)
    if (game.currentTurn.state == 'aiming-jump') uiContext.strokeStyle = styles.colours.jumpArrow
    if (game.currentTurn.state == 'aiming-shot') uiContext.strokeStyle = styles.colours.shotArrow
    uiContext.lineWidth = 2
    uiContext.stroke()
    uiContext.beginPath()
    uiContext.arc(game.aimArrow.start.x, game.aimArrow.start.y, 200, radians - 0.02 + Math.PI, radians + 0.02 + Math.PI)
    uiContext.stroke()
  }

  uiContext.fillStyle = 'white'
  var messageText = messages[game.currentTurn.state]
  if (messageText && game.state != 'gameover') uiContext.fillText(messageText, uiCanvas.width - 30 - (uiContext.measureText(messageText).width), 40)

  if (game.state == 'gameover') {
    uiContext.fillStyle = 'white'
    uiContext.fillText('Game over!', uiCanvas.width / 2 - (uiContext.measureText('Game over').width / 2), uiCanvas.height / 2 - 20)
  } else {
    var i = 0
    game.characters.forEach(function (char) {
      uiContext.fillStyle = styles.colours[game.characters[i].name]
      uiContext.font = '20px courier'
      var text = char.name + ': ' + char.health
      uiContext.fillText(text, 30, (i + 1) * 40)
      i++
    })
    drawPlayerMarker(game.characters[0])
  }
}

function drawPlayerMarker (player) {
  // Get the position of the player and draw a lil white triangle above it
  var body = world.getBodyById(player.id)
  uiContext.beginPath()
  var translatedPosition = translateToCamera(body.position)
  uiContext.moveTo(translatedPosition[0], worldCanvas.height - translatedPosition[1] - 40)
  uiContext.lineTo(translatedPosition[0] - 10, worldCanvas.height - translatedPosition[1] - 60)
  uiContext.lineTo(translatedPosition[0] + 10, worldCanvas.height - translatedPosition[1] - 60)
  uiContext.closePath()
  uiContext.strokeStyle = 'white'
  uiContext.lineWidth = 3
  uiContext.stroke()
}

function nextTurn () {
  console.log('next turn')
  // We take the last character from our array of characters and 'pop' it off - this is our current player
  var player = game.characters.pop()
  // We then put that character back at the start of the array, using the bizarrely-named 'unshift'
  game.characters.unshift(player)

  game.currentTurn.actionsRemaining = 3

  $('.action-buttons').show()
}

function aim (callback) {
  hammer.off('panstart pan panend')
  // Start listening for the start of a mouse/finger drag
  /*
  * We're calling hammer.on three times here, to listen for three different types of events; 'panstart'
  * fires when the user starts to drag, 'pan' will fire every time the user drags their pointer on the 
  * canvas while their mouse or finger is pressed down, and 'panend' will fire once when they release. The 
  * second parameter passed to hammer.on parameter is the callback function that the input event is passed
  * to. Hammer will continue to listen and run these functions until we call hammer.off('pan') for each event 
  * to tell it to stop.
  */
  hammer.on('panstart', function (event) {
    // HammerJS tells us where the user started dragging relative to the page, not the canvas - translate here
    // We grab the position at the start of the drag and remember it to draw a nice arrow from
    var center = {
      x: event.center.x - uiCanvas.getBoundingClientRect().left,
      y: event.center.y - uiCanvas.getBoundingClientRect().top
    }
    hammer.on('pan', function (event) {
      // The distance of the drag is measured in pixels, so we have to standardise it before
      // translating it into the 'power' of our shot. You might want to console.log out event.angle
      // here to see how HammerJS gives us angles.
      var power = translateDistanceToPower(event.distance)
      game.aimArrow = {
        start: center,
        angle: event.angle,
        power: power
      }
    })
  })
  
  hammer.on('panend', function (event) {
    var power = translateDistanceToPower(event.distance)
    if (power <= 10) return
    hammer.off('panstart pan panend')
    // The player has stopped dragging, let loose!
    callback(event.angle, power)
    game.aimArrow = null
    // Stop listening to input until the next turn
  })
}

function jump (angle, power) {
  $('.action-buttons').hide()
  var player = world.getBodyById(game.characters[0].id)
  player.wakeUp()
  game.currentTurn.actionsRemaining--
  game.currentTurn.state = 'jumping'
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians))
  var stepY = (power * Math.sin(radians))
  console.log(stepX, stepY)
  player.velocity = [-stepX, stepY]
  game.activeBodies.push(player.id)
  console.log(player.velocity)
}

function fireProjectile (angle, power) {
  $('.action-buttons').hide()
  var player = world.getBodyById(game.characters[0].id)
  game.currentTurn.actionsRemaining--
  game.currentTurn.state = 'firing'
  game.characters.forEach(function (char) { char.treatment = 'static' })
  // We use the angle to work out how many pixels we should move the projectile each frame
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians)) * 1.5
  var stepY = (power * Math.sin(radians)) * 1.5
  var startX = Math.cos(radians) * 20
  var startY = Math.sin(radians) * 20
  console.log(startX, startY)
  var projectileBody = new p2.Body({
    mass: 3,
    position: [player.position[0] + -startX, player.position[1] + startY]
  })
  var projectileShape = new p2.Circle(5)
  projectileShape.material = projectileMaterial
  projectileBody.addShape(projectileShape)

  world.addBody(projectileBody)
  projectileBody.velocity = [-stepX, stepY]
  projectileBody.gameData = {
    bounced: 0
  }

  game.activeBodies.push(projectileBody.id)

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

function translateDistanceToPower (distance) {
  // Divide the height of the canvas by the distance of our drag - we'll set a 'power limit' of 50% screen height
  var power = distance / worldCanvas.height
  if (power > 0.5) power = 0.5
  // The maths are easier if our 'max power' is 100
  power = power * 200
  return power
}

function impactProjectile (projectile, explosionSize, damageFactor, world) {
  setTimeout(function () {
    projectile.gameData.bounced++
  }, 25)

  game.explosions.push({
    position: projectile.position,
    maxSize: explosionSize,
    size: 1
  })

  game.characters.forEach(function (char) {
    var charBody = world.getBodyById(char.id)
    var relativePosition = [
      charBody.position[0] - projectile.position[0],
      charBody.position[1] - projectile.position[1]
    ]
    var distance = Math.sqrt(Math.pow((relativePosition[0]), 2) + Math.pow((relativePosition[1]), 2))
    var radians = Math.atan2(relativePosition[1], relativePosition[0])

    if (distance < explosionSize) {
      char.takeDamage((explosionSize - distance) * damageFactor)
      var stepX = (explosionSize * Math.cos(radians)) / (Math.sqrt(distance))
      var stepY = (explosionSize * Math.sin(radians)) / (Math.sqrt(distance))
      console.log(charBody.velocity)
      charBody.velocity = [ charBody.velocity[0] + stepX, charBody.velocity[1] + stepY ]
      console.log(charBody.velocity)
    }
  })

  world.removeBody(projectile)
  game.activeBodies.forEach(function (bodyId, i) {
    if (bodyId == projectile.id) game.activeBodies.splice(i, 1)
  })
  game.currentTurn.actionsRemaining--
  nextTurn()
}

// function genTerrain (floor, height, world) {
//   var renderer = world.renderer()
//   var xPoints = []
//   var yPoints = []
//   // Get a number between 5 and 15. This will be the number of angles along our line
//   var numberOfPoints = Math.round(10 + (Math.random() * 20))
//   // Loop over this number, generating a number at least as high as 'floor' and as large as 'floor + height'
//   // These will represent the height of the peaks and valleys of our terrain
//   for (var i = 0; i < numberOfPoints; i++) {
//     var point = floor + (Math.random() * height)
//     yPoints.push(point)
//   }
//   // We do something similar again to decide how far apart these points are on the X axis, adding the previous value to
//   // each new random number so we get an increasing list of numbers with random gaps between them
//   for (var i = 0; i < numberOfPoints; i++) {
//     if (i > 0) var point = xPoints[i - 1] + 10 + (Math.random() * 100)
//     else var point = 10 + (Math.random() * 100)
//     xPoints.push(point)
//   }
//   // However, we now have a range of points on the X axis that may be larger than the width of our screen, so we squash them down
//   // Get the last point and divide it by the screen width, then multiply all points by this number
//   var squashFactor = canvas.width / (xPoints[xPoints.length - 1] / 2)

//   var compoundShape = Physics.body('compound', {
//     x: 0,
//     y: 0,
//     treatment: 'static',
//     styles: {
//       fillStyle: styles.colours.ground,
//       strokeStyle: styles.colours.ground,
//       lineWidth: 3
//     }
//   })
//   // Array.map() is a neato functional way of turning an array into another array
//   // We're looping through our array and making a new array of vector objects
//   var terrainVertices = xPoints.map(function (xPoint, i) {
//     var globalCoords = {
//       x: Math.round(xPoint * squashFactor),
//       y: Math.round(canvas.height - yPoints[i])
//     }
//     return compoundShape.toBodyCoords(new Physics.vector(globalCoords))
//   })
//   // We'll stretch the shape out way beyond the edges of the screen to be safe
//   var topRightCorner = compoundShape.toBodyCoords(new Physics.vector({
//     x: canvas.width + 10000,
//     y: terrainVertices[terrainVertices.length - 1].y
//   }))
//   var bottomRightCorner = compoundShape.toBodyCoords(new Physics.vector({
//     x: canvas.width + 10000,
//     y: canvas.height
//   }))
//   var bottomLeftCorner = compoundShape.toBodyCoords(new Physics.vector({
//     x: -10000,
//     y: canvas.height
//   }))
//    var topLeftCorner = compoundShape.toBodyCoords(new Physics.vector({
//     x: -10000,
//     y: terrainVertices[0].y
//   }))
//   terrainVertices.push(topRightCorner)
//   terrainVertices.push(bottomRightCorner)
//   terrainVertices.push(bottomLeftCorner)
//   terrainVertices.push(topLeftCorner)
//   // If you console.log(terrainVertices) here, you'll see that we have a list of coordinates describing our terrain
//   // Now, because PhysicsJS doesn't support concave polygons, we have to turn this into a bunch of connected rectangles
//   terrainVertices.forEach(function (vertex, i) {
//     var nextVertex = terrainVertices[i+1]
//     if (nextVertex == undefined) nextVertex = terrainVertices[0]
//     // Bunch of maths I copied off stackoverflow to get the distance and angle (in radians) between this point and the next
//     var distance = Math.sqrt(Math.pow((nextVertex.x - vertex.x), 2) + Math.pow((nextVertex.y - vertex.y), 2))
//     var angle = Math.atan2(nextVertex.y - vertex.y, nextVertex.x - vertex.x)
//     // We're making a rectangle as wide as 'distance', positioned and rotated to bridge the two points
//     var rectangle = Physics.body('rectangle', {
//       x: (vertex.x + nextVertex.x) / 2,
//       y: (vertex.y + nextVertex.y) / 2,
//       width: distance,
//       height: 1,
//       angle: angle
//     })

//     // var relativeCoords = compoundShape.toBodyCoords(new Physics.vector({ x: rectangle.state.pos.x, y: rectangle.state.pos.y }))
//     compoundShape.addChild(rectangle)
//   })
//   compoundShape.state.pos.x = canvas.width * 2
//   compoundShape.state.pos.y = canvas.height * 0.75
//   return compoundShape
// }
