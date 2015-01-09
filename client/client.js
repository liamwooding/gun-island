var plugins = {}

ui = {
  state: null,
  framesToRender: [],
  lastTurn: null,
  aimArrow: {},
  worldCanvas: null,
  worldContext: null,
  uiCanvas: null,
  uiContext: null
}

styles = {
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

camera = {
  zoom: 1,
  x: 0,
  y: 0
}

Template.game.rendered = function () {
  Meteor.subscribe('GameState')
  Meteor.subscribe('Characters', {
    onReady: function () {
      requestAnimationFrame(render)
      if (!localStorage.userId) localStorage.userId = Meteor.uuid()

      if (Characters.find({ userId: localStorage.userId }).count() === 0) {
        console.log(Characters.find({ userId: localStorage.userId }).fetch())
        Meteor.call('addPlayer', localStorage.userId)
      }
    }
  })
  Meteor.subscribe('Turns')
  
  // Setup our canvas for drawing the game world onto
  ui.worldCanvas = document.getElementById('world')
  ui.worldCanvas.width = window.innerWidth
  ui.worldCanvas.height = window.innerHeight
  ui.worldContext = ui.worldCanvas.getContext('2d')
  // Setup a canvas for drawing UI elements onto
  ui.uiCanvas = document.getElementById('uiCanvas')
  ui.uiCanvas.width = window.innerWidth
  ui.uiCanvas.height = window.innerHeight
  ui.uiContext = ui.uiCanvas.getContext('2d')
  // Setup HammerJS, the mouse/touch gesture library we'll use for the controls
  plugins.hammer = new Hammer(document.getElementById('ui'))
  // HammerJS only listens for horizontal drags by default, here we tell it listen for all directions
  plugins.hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL })

  //camera.x = 0 - (ui.worldCanvas.width / 2)
  //camera.y = 0 - (ui.worldCanvas.height / 2)

  // resize canvas when the browser is resized
  window.addEventListener('resize', function () {
    ui.worldCanvas.width = window.innerWidth
    ui.worldCanvas.height = window.innerHeight
    ui.uiCanvas.width = window.innerWidth
    ui.uiCanvas.height = window.innerHeight
  }, true)

  // Set up our click listeners for the action buttons (using jquery, for readability's sake)
  $('.action-buttons').on('mousedown', 'button.jump', function () {
    $(this).addClass('active')
    ui.state = 'aiming-jump'
    aim(function (angle, power) {
      jump(angle, power)
    })
  })
  $('.action-buttons').on('mousedown', 'button.shoot', function () {
    $(this).addClass('active')
    ui.state = 'aiming-shot'
    aim(function (angle, power) {
      shoot(angle, power)
    })
  })

  setupCameraControls()

  Turns.find().observeChanges({
    added: function (id, turn) {
      ui.state = 'rendering'
      ui.lastTurn = turn.time
      ui.framesToRender = ui.framesToRender.concat(turn.frames)
    }
  })
}

function render (now) {
  var frame = ui.framesToRender[0]

  if (!frame || !Characters.findOne({ userId: localStorage.userId })) {
    requestAnimationFrame(render)
    return
  }

  ui.worldContext.clearRect(0, 0, ui.worldCanvas.width, ui.worldCanvas.height)
  if (frame) {
    frame.bodies.forEach(function (body) {
      drawBody(body)
    })
  }

  drawUI(frame)

  if (ui.state !== 'action') {
    if (ui.framesToRender.length > 1) {
      var idealFrameSpeed = 1000 / 60
      var lag = (ui.framesToRender.length * idealFrameSpeed) - (ui.lastTurn + Config.playTime - Date.now())
      var skipFrames = Math.round((lag / idealFrameSpeed) / 5)
      console.log(skipFrames)
      if (lag > 0) ui.framesToRender.splice(0, skipFrames > 0 ? skipFrames : 1)
      else ui.framesToRender.shift()
    } else {
      ui.state = 'action'
    }
  }
  requestAnimationFrame(render)
}

function translateToCamera (position) {
  var x = ((position[0] - camera.x) * camera.zoom)
  var y = ((position[1] - camera.y) * camera.zoom)
  return [x, y]
}

function scaleToCamera (position) {
  var x = position[0] * camera.zoom
  var y = position[1] * camera.zoom
  return [x, y]
}

function setupCameraControls () {
  plugins.hammer.off('panstart pan panend')
  plugins.hammer.on('pan', function (event) {
    camera.x += event.velocityX * (15 / camera.zoom)
    camera.y -= event.velocityY * (15 / camera.zoom)
  })
  $(document).on('mousewheel', function(event) {
    camera.zoom += event.deltaY / 60
    if (camera.zoom > 10) {
      camera.zoom = 10
      return
    }
    if (camera.zoom < 1) {
      camera.zoom = 1
      return
    }
  })
}

function drawBody (body) {
  body.shapes.forEach(function (shape, i) {
    ui.worldContext.beginPath()
    ui.worldContext.fillStyle = shape.styles && shape.styles.fillStyle ? shape.styles.fillStyle : '#000000'
    ui.worldContext.strokeStyle = shape.styles && shape.styles.strokeStyle ? shape.styles.strokeStyle : '#000000'
    ui.worldContext.lineWidth = shape.styles && shape.styles.lineWidth ? shape.styles.lineWidth : 2
    
    if (shape.type === p2.Shape.PLANE) {
      ui.worldContext.moveTo(0, translateToCamera(body.position)[1])
      ui.worldContext.lineTo(ui.worldCanvas.width, translateToCamera(body.position)[1])
    } else if (shape.type === p2.Shape.CIRCLE) {
      var shapePosition = [body.position[0] +  body.shapeOffsets[i][0], body.position[1] +  body.shapeOffsets[i][1]]
      shapePosition = translateToCamera(shapePosition)
      ui.worldContext.arc(shapePosition[0], shapePosition[1], shape.radius, 0, 2 * Math.PI)
    } else if (shape.type === p2.Shape.PARTICLE) {
      console.log(body)
      var shapePosition = [body.position[0] +  body.shapeOffsets[i][0], body.position[1] +  body.shapeOffsets[i][1]]
      shapePosition = translateToCamera(shapePosition)
      ui.worldContext.arc(shapePosition[0], shapePosition[1], body.data.size, 0, 2 * Math.PI)
    } else {
      console.log(body)
      var shapePosition = [body.position[0] +  body.shapeOffsets[i][0], body.position[1] +  body.shapeOffsets[i][1]]
      shapePosition = translateToCamera(shapePosition)
      var vertices = shape.vertices.map(function (vertex) {
        return scaleToCamera(vertex)
      })
      ui.worldContext.moveTo(shapePosition[0] + vertices[0][0], shapePosition[1] + vertices[0][1])
      vertices.slice(1, vertices.length).forEach(function (vertex) {
        ui.worldContext.lineTo(shapePosition[0] + vertex[0], shapePosition[1] + vertex[1])
      })
    }
    ui.worldContext.closePath()
    ui.worldContext.fill()
    ui.worldContext.stroke()
  })
}

function drawUI (frame) {
  if (!getPlayerPosition()) return
  var translatedPlayerPosition = translateToCamera(getPlayerPosition())
  if (ui.state === 'action') {
    $('.action-buttons').show()
    $('.action-buttons').offset({left: translatedPlayerPosition[0], top: ui.uiCanvas.height - translatedPlayerPosition[1]})
  } else $('.action-buttons').hide()

  // We draw anything which isn't governed by the physics engine in this function
  ui.uiContext.clearRect(0, 0, ui.uiCanvas.width, ui.uiCanvas.height)

  // Draw any ongoing explosions
  frame.explosions.forEach(function (explosion, i) {
    if (explosion.size >= explosion.maxSize) game.explosions.splice(i, 1)
    ui.uiContext.beginPath()
    var translatedPosition = translateToCamera(explosion.position)
    ui.uiContext.arc(translatedPosition[0], ui.uiCanvas.height - translatedPosition[1], explosion.size, 0, Math.PI * 2, false)
    ui.uiContext.lineWidth = explosion.size * 0.1
    ui.uiContext.strokeStyle = styles.colours.ball1
    ui.uiContext.fillStyle = styles.colours.explosion
    ui.uiContext.stroke()
    ui.uiContext.fill()
    explosion.size += explosion.size * 0.4
  })

  if (ui.aimArrow && ui.aimArrow.power > 10) {
    // Do some maths I copied from the internet
    var radians = ui.aimArrow.angle * Math.PI / 180
    var arrowToX = ui.aimArrow.start.x + (ui.aimArrow.power * Math.cos(radians) * 2)
    var arrowToY = ui.aimArrow.start.y + (ui.aimArrow.power * Math.sin(radians) * 2)
    // Draw the line
    ui.uiContext.moveTo(ui.aimArrow.start.x, ui.aimArrow.start.y)
    ui.uiContext.lineTo(arrowToX, arrowToY)
    if (ui.state == 'aiming-jump') ui.uiContext.strokeStyle = styles.colours.jumpArrow
    if (ui.state == 'aiming-shot') ui.uiContext.strokeStyle = styles.colours.shotArrow
    ui.uiContext.lineWidth = 2
    ui.uiContext.stroke()
    ui.uiContext.beginPath()
    ui.uiContext.arc(ui.aimArrow.start.x, ui.aimArrow.start.y, 200, radians - 0.02, radians + 0.02)
    ui.uiContext.stroke()
  }

  ui.uiContext.fillStyle = 'white'
  
  if (ui.lastTurn && ui.lastTurn + Config.playTime < Date.now()) {
    ui.uiContext.font = '20px courier'
    var text = Date.now() - (ui.lastTurn + Config.playTime)
    ui.uiContext.fillText(text, 30, 40)
  }

  drawPlayerMarker(getPlayerPosition())
}

function getPlayerPosition () {
  var bodyId = Characters.findOne({ userId: localStorage.userId }).bodyId
  var playerBody = ui.framesToRender[0].bodies.filter(function (body) {
    if (body.id === bodyId) return body
  })[0]
  return playerBody.position
}

function drawPlayerMarker (position) {
  // Get the position of the player and draw a lil white triangle above it
  ui.uiContext.beginPath()
  var translatedPosition = translateToCamera(position)
  ui.uiContext.moveTo(translatedPosition[0], ui.worldCanvas.height - translatedPosition[1] - 40)
  ui.uiContext.lineTo(translatedPosition[0] - 10, ui.worldCanvas.height - translatedPosition[1] - 60)
  ui.uiContext.lineTo(translatedPosition[0] + 10, ui.worldCanvas.height - translatedPosition[1] - 60)
  ui.uiContext.closePath()
  ui.uiContext.strokeStyle = 'white'
  ui.uiContext.lineWidth = 3
  ui.uiContext.stroke()
}

function aim (callback) {
  plugins.hammer.off('panstart pan panend')
  // Start listening for the start of a mouse/finger drag
  /*
  * We're calling hammer.on three times here, to listen for three different types of events; 'panstart'
  * fires when the user starts to drag, 'pan' will fire every time the user drags their pointer on the 
  * canvas while their mouse or finger is pressed down, and 'panend' will fire once when they release. The 
  * second parameter passed to hammer.on parameter is the callback function that the input event is passed
  * to. Hammer will continue to listen and run these functions until we call hammer.off('pan') for each event 
  * to tell it to stop.
  */
  plugins.hammer.on('panstart', function (event) {
    // HammerJS tells us where the user started dragging relative to the page, not the canvas - translate here
    // We grab the position at the start of the drag and remember it to draw a nice arrow from
    var center = {
      x: event.center.x - ui.uiCanvas.getBoundingClientRect().left,
      y: event.center.y - ui.uiCanvas.getBoundingClientRect().top
    }
    plugins.hammer.on('pan', function (event) {
      // The distance of the drag is measured in pixels, so we have to standardise it before
      // translating it into the 'power' of our shot. You might want to console.log out event.angle
      // here to see how HammerJS gives us angles.
      var power = translateDistanceToPower(event.distance)
      ui.aimArrow = {
        start: center,
        angle: event.angle,
        power: power
      }
    })
  })
  
  plugins.hammer.on('panend', function (event) {
    var power = translateDistanceToPower(event.distance)
    if (power <= 10) return
    plugins.hammer.off('panstart pan panend')
    setupCameraControls()
    // The player has stopped dragging, let loose!
    callback(event.angle, power)
    ui.aimArrow = null
    // Stop listening to input until the next turn
  })
}

function jump (angle, power) {
  $('.action-buttons').hide()
  $('.action-buttons .active').removeClass('active')

  Meteor.call('declareAction', localStorage.userId, {
    action: 'jump',
    angle: angle,
    power: power
  })
}

function shoot (angle, power) {
  $('.action-buttons').hide()
  $('.action-buttons .active').removeClass('active')

  Meteor.call('declareAction', localStorage.userId, {
    action: 'shoot',
    angle: angle,
    power: power
  })
}

function translateDistanceToPower (distance) {
  // Divide the height of the canvas by the distance of our drag - we'll set a 'power limit' of 50% screen height
  var power = distance / ui.worldCanvas.height
  if (power > 0.25) power = 0.25
  // The maths are easier if our 'max power' is 100
  power = power * 400
  return power
}