pixi = PIXI
hammer = null
stage = null
world = null
ui = null
renderer = null
player = null

Game = {
  state: null,
  shotsFired: 0,
  framesToRender: [],
  lastTurn: null,
  aimArrow: null,
  arrowGraphics: null, 
  worldCanvas: null,
  worldContext: null,
  uiCanvas: null,
  uiContext: null
}

Template.game.rendered = function () {
  stage = new pixi.Stage(parseInt(Config.styles.ground.fillStyle.substring(1), 16))
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

  world.pivot = {
    x: renderer.view.width / 2,
    y: renderer.view.height / 2
  }
  world.scale.x = world.scale.y = 0.9

  // Setup HammerJS, the mouse/touch gesture library we'll use for the controls
  hammer = new Hammer(renderer.view)
  // HammerJS only listens for horizontal drags by default, here we tell it listen for all directions
  hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL })

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
      var bodyGraphics = getGraphicsFromBody(body)
      if (body.data && body.data.userId === localStorage.userId) player = bodyGraphics
        bodyGraphics.mongoId = id
      world.addChild(bodyGraphics)
    },
    removed: function (id) {
      var pixiBody = world.children.filter(function (child) {
        return child.mongoId === id
      })[0]
      world.removeChild(pixiBody)
    }
  })

  Turns.find().observeChanges({
    added: function (id, turn) {
      Game.state = turn.state
      Game.lastTurn = turn.time
      if (Game.state === 'play') endTurn()
    },
    changed: function (id, fields) {
      if (!fields) return
      if (fields.state) Game.state = fields.state
      if (Game.state === 'turn') startTurn()
      if (Game.state === 'play') endTurn()
    }
  })

  BodiesStream.on('positions', function (positions) {
    positions.forEach(function (position) {
      var pixiBody = world.children.filter(function (child) {
        return child.graphicsData[0].shape.physicsId === position.physicsId
      })[0]
      if (pixiBody) pixiBody.position = {
        x: position.x,
        y: position.y
      }
    })
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
    pixiBody = new pixi.Circle(0, 0, shape.radius)
  } else if (shape.type === 32) {
    pixiBody = new pixi.Rectangle(-shape.width / 2, -shape.height / 2, body.shapes[0].width, body.shapes[0].height)
  } else if (shape.type === 2 && body.data.type === 'explosion') {
    pixiBody = new pixi.Circle(-body.data.size / 2, -body.data.size / 2, -body.data.size)
  } else if (shape.vertices) {
    pixiBody = new pixi.Polygon(p2VerticesToPoints(body))
  } else {
    console.warn('The heck is this:', shape.type)
  }
  pixiBody.physicsId = body.physicsId
  pixiBody.mongoId = body._id

  var graphics = new pixi.Graphics()
  if (body.data && body.data.type) {
    graphics.beginFill(parseInt(Config.styles[body.data.type].fillStyle.substring(1), 16))
    graphics.lineWidth = Config.styles[body.data.type].lineWidth || 0
    graphics.lineColor = Config.styles[body.data.type].lineColor || 0xFFFFFF
  } else graphics.beginFill(0xFFFFFF)

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
  $('#turn-timer').remove()
  $('body').append('<div id=turn-timer>')
  setTimeout(function () {
    $('#turn-timer').addClass('active')
  }, 15)
  aim(shoot)
}


function endTurn () {
  $('#turn-timer').remove()
  Game.shotsFired = 0
}

function render () {
  if (player) world.position = {
    x: (renderer.view.width / 2 - player.position.x) * world.scale.x + (renderer.view.width/2),
    y: (renderer.view.height / 2 - player.position.y) * world.scale.y + (renderer.view.height/2)
  }
  renderer.render(stage)
  requestAnimationFrame(render)
}

function setupCameraControls () {
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
}

function setupUI () {
  Game.aimArrow = new pixi.Rectangle(0, 0, 1, 2)
  Game.arrowGraphics = new pixi.Graphics()
  Game.arrowGraphics.beginFill(0x000000)
  Game.arrowGraphics.drawShape(Game.aimArrow)
  Game.arrowGraphics.endFill()
  Game.arrowGraphics.visible = false
  ui.addChild(Game.arrowGraphics)
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
      x: event.center.x,
      y: event.center.y
    }
    hammer.on('pan', function (event) {
      // The distance of the drag is measured in pixels, so we have to standardise it before
      // translating it into the 'power' of our shot. You might want to console.log out event.angle
      // here to see how HammerJS gives us angles.
      var power = translateDistanceToPower(event.distance)
      Game.arrowGraphics.visible = power > 10
      updateArrow(center, event.angle, power)
    })
  })
  
  hammer.on('panend', function (event) {
    Game.arrowGraphics.visible = false
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

function shoot (angle, power) {
  power = 100
  Game.shotsFired++
  var radians = angle * Math.PI / 180
  player.moveTo(player.position)
  player.lineTo(player.position.x + (power * Math.cos(radians) * 2), renderer.view.height - player.position.y - (power * Math.sin(radians) * 2))

  Meteor.call('declareAction', localStorage.userId, {
    action: 'shoot',
    angle: angle,
    power: power,
    shotsFired: Game.shotsFired
  })
  if (Game.shotsFired < Config.actions.shotsPerTurn) aim(shoot)
}

function updateArrow (center, angle, power) {
  var radians = angle * Math.PI / 180
  Game.arrowGraphics.clear()
  Game.arrowGraphics.lineStyle(2, 0)
  // Game.arrowGraphics.position = {
  //   x: center.x,
  //   y: renderer.view.height - center.y
  // }
  Game.arrowGraphics.moveTo(center.x, renderer.view.height - center.y)
  Game.arrowGraphics.lineTo(center.x + (power * Math.cos(radians) * 2), renderer.view.height - center.y - (power * Math.sin(radians) * 2))
}

function p2VerticesToPoints (p2Body) {
  var points = p2Body.shapes[0].vertices.map(function (vertex) {
    return new pixi.Point(vertex[0], vertex[1])
  })
  return points
}

function translateDistanceToPower (distance) {
  // Divide the height of the canvas by the distance of our drag - we'll set a 'power limit' of 50% screen height
  var power = distance / renderer.height
  if (power > 0.25) power = 0.25
  // The maths are easier if our 'max power' is 100
  power = power * 400
  return power
}