pixi = PIXI
hammer = null
stage = null
world = null
ui = null
renderer = null

Game = {
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
  stage = new pixi.Stage(0x58A2C4)
  // We add physics objects to the world, then move the "camera" by changing the world's position
  world = new pixi.DisplayObjectContainer()
  ui = new pixi.DisplayObjectContainer()
  stage.addChild(world)
  // The UI should be static tho
  stage.addChild(ui)
  renderer = new pixi.autoDetectRenderer(window.innerWidth, window.innerHeight, {
    antialias: true
  })
  document.body.appendChild(renderer.view)

  // Setup HammerJS, the mouse/touch gesture library we'll use for the controls
  hammer = new Hammer(renderer.view)
  // HammerJS only listens for horizontal drags by default, here we tell it listen for all directions
  hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL })

  //camera.x = 0 - (ui.worldCanvas.width / 2)
  //camera.y = 0 - (ui.worldCanvas.height / 2)

  // resize canvas when the browser is resized
  window.addEventListener('resize', function () {
    renderer.width = window.innerWidth
    renderer.height = window.innerHeight
  }, true)

  // Set up our click listeners for the action buttons (using jquery, for readability's sake)
  $('.action-buttons').on('mousedown, touchstart', 'button.shoot', function () {
    $(this).addClass('active')
    Game.state = 'aiming-shot'
    aim(function (angle, power) {
      shoot(angle, power)
    })
  })

  Meteor.subscribe('GameState')
  Meteor.subscribe('Turns')
  Meteor.subscribe('Characters', {
    onReady: function () {
      requestAnimationFrame(render)
      if (!localStorage.userId) localStorage.userId = Meteor.uuid()

      if (Characters.find({ userId: localStorage.userId }).count() === 0) {
        Meteor.call('addPlayer', localStorage.userId)
      }
    }
  })
  Meteor.subscribe('Bodies')

  Bodies.find().observeChanges({
    added: function (id, body) {
      console.log('added:', body)
      var graphics = getGraphicsFromBody(body)
      world.addChild(graphics)
    },
    changed: function (id, fields) {
      if (!fields) return
      var body = Bodies.findOne(id)
      var pixiBody = world.children.filter(function (child) {
        return child.graphicsData[0].shape.physicsId === body.physicsId
      })[0]
      pixiBody.position = {
        x: body.position[0],
        y: body.position[1]
      }
    }
  })  

  Turns.find().observeChanges({
    added: function (id, turn) {
      Game.state = turn.state
      Game.lastTurn = turn.time
    },
    changed: function (id, fields) {
      if (!fields) return
      if (fields.state) Game.state = fields.state
      if (Game.state === 'turn') startTurn()
    }
  })

  setupUI()

  setupCameraControls()
  requestAnimationFrame(render)
}

function getGraphicsFromBody (body) {
  var pixiBody
  var shape = body.shapes[0]
  if (shape.type === 4) {
    pixiBody = new pixi.Rectangle(-10000, 0, renderer.view.width + 20000, 1)
  } else if (shape.type === 1) {
    pixiBody = new pixi.Circle(-shape.radius / 2, -shape.radius / 2, shape.radius)
  } else if (shape.type === 32) {
    pixiBody = new pixi.Rectangle(-shape.width / 2, -shape.height / 2, body.shapes[0].width, body.shapes[0].height)
  } else if (shape.vertices) {
    pixiBody = new pixi.Polygon(p2VerticesToPoints(body))
  } else {
    console.warn('The heck is this:', body)
  }
  pixiBody.physicsId = body.physicsId

  var graphics = new pixi.Graphics()
  graphics.beginFill(0x000000)
  graphics.drawShape(pixiBody)
  graphics.endFill()
  graphics.position = {
    x: body.position[0],
    y: body.position[1]
  }
  return graphics
}

function startTurn () {
  console.log('turn starts')
  aim(shoot)
}

function render () {
  renderer.render(stage)
  requestAnimationFrame(render)
}

function p2VerticesToPoints (p2Body) {
  var points = p2Body.shapes[0].vertices.map(function (vertex) {
    return new pixi.Point(vertex[0], vertex[1])
  })
  return points
}

function setupCameraControls () {
  // hammer.off('panstart pan panend')
  // hammer.on('pan', function (event) {
  //   world.position.x -= event.velocityX * (15 / world.scale.x)
  //   world.position.y += event.velocityY * (15 / world.scale.x)
  // })
  $(document).on('mousewheel', function (event) {
    var scale = event.deltaY / 60
    world.scale.x += scale
    world.scale.y += scale
    if (world.scale.x > 10) {
      world.scale.x = world.scale.y = 10
      return
    }
    if (world.scale.x < 0.4) {
      world.scale.x = world.scale.y = 0.4
      return
    }
  })
  // hammer.on('pinchstart', function (event) {
  //   console.log(event)
  //   // var scale = event.deltaY / 60
  //   // world.scale.x += scale
  //   // world.scale.y += scale
  //   // if (world.scale.x > 10) {
  //   //   world.scale.x = world.scale.y = 10
  //   //   return
  //   // }
  //   // if (world.scale.x < 0.4) {
  //   //   world.scale.x = world.scale.y = 0.4
  //   //   return
  //   // }
  // })
}

function setupUI () {
  var aimArrow = new pixi.Rectangle(0, 0, 1, 2)
  var arrowGraphics = new Graphics()
  arrowGraphics.addChild(aimArrow)
  arrowGraphics.visible = false
  ui.addChild(arrowGraphics)
  
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
    console.log(event)
    // HammerJS tells us where the user started dragging relative to the page, not the canvas - translate here
    // We grab the position at the start of the drag and remember it to draw a nice arrow from
    var center = {
      x: event.center.x,
      y: event.center.y
    }
    hammer.on('pan', function (event) {
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
  
  hammer.on('panend', function (event) {
    var power = translateDistanceToPower(event.distance)
    if (power <= 10) return
    hammer.off('panstart pan panend')
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
  var power = distance / renderer.height
  if (power > 0.25) power = 0.25
  // The maths are easier if our 'max power' is 100
  power = power * 400
  return power
}