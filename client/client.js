pixi = PIXI
hammer = null
stage = null
pixiWorld = null
ui = null
renderer = null
player = null
hostUserId = null

p2World = null
var pause = false
var lastTurnTime
var turnTimeout
var receivedUpdate = false

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

Template.username.events({
  'click #username button': function (e) {
    var username = $('#username input').val()
    if (!Meteor.users.findOne({ username: username })) {
      Accounts.createUser({
        username: username,
        password: 'bangbang'
      }, function (err) {
        if (err) console.error(err)
        Meteor.loginWithPassword(username, 'bangbang', function (err) {
          if (err) console.error(err)
          else {
            console.log('Logged in with username', username)
            addPlayer(username)
          }
        })
      })
    } else {
      Meteor.loginWithPassword(username, 'bangbang', function (err) {
        if (err) console.error(err)
        else {
          console.log('Logged in with username', username)
          addPlayer(username)
        }
      })
    }
  }
})

Meteor.startup(initPhysics)

Template.game.rendered = function () {
  stage = new pixi.Stage(parseInt(Config.styles.ground.fillStyle.substring(1), 16))
  // We add physics objects to the world, then move the "camera" by changing the world's position
  pixiWorld = new pixi.DisplayObjectContainer()
  ui = new pixi.DisplayObjectContainer()
  stage.addChild(pixiWorld)
  // The UI should be static tho
  stage.addChild(ui)
  renderer = new pixi.autoDetectRenderer(window.innerWidth, window.innerHeight, {
    antialias: true
  })
  document.body.appendChild(renderer.view)

  pixiWorld.pivot = {
    x: renderer.view.width / 2,
    y: renderer.view.height / 2
  }
  pixiWorld.scale.x = pixiWorld.scale.y = 0.9

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
      declareShot(angle, power)
    })
  })

  Meteor.subscribe('GameState')
  Meteor.subscribe('Turns', {
    onReady: function () {
      Turns.find().observe({
        added: function (turn) {
          Game.lastTurn = turn.time
          console.log('turn added:', turn)
          if (Game.state === 'play') endTurn()
        }
      })
    }
  })
  Meteor.subscribe('Hosts', {
    onReady: function () {
      Hosts.find().observeChanges({
        added: function (id, host) {
          hostUserId = host.userId
        }
      })
    }
  })
  Meteor.subscribe('Bodies', {
    onReady: function () {
      Bodies.find().observeChanges({
        added: function (id, body) {
          startRenderingBody(body)
        },
        removed: function (id) {
          var pixiBody = pixiWorld.children.filter(function (child) {
            return child.physicsId === id
          })[0]
          pixiWorld.removeChild(pixiBody)
        }
      })
      requestAnimationFrame(function () { render(true) })
    }
  })
  Meteor.subscribe('Players')

  BodiesStream.on('bodies', function (bodies) {
    console.log(bodies)
    receivedUpdate = true
    bodies.forEach(function (body) {
      var p2Body = p2World.bodies.getBodyById(body.physicsId)
      p2Body.position = body.position
      p2Body.velocity = body.velocity
    })
  })

  setupUI()

  setupCameraControls()
}

function startRenderingBody (body) {
  var p2Body = makeP2Body(body)
  if (p2Body) {
    console.log('Adding body to world:', p2Body)
    p2World.addBody(p2Body)
    p2Body.id = body.physicsId
  }
  var bodyGraphics = getGraphicsFromBody(body)
  if (body.data && body.data.username === Meteor.user().username) player = bodyGraphics
    bodyGraphics.physicsId = body.physicsId
  pixiWorld.addChild(bodyGraphics)
}

function getGraphicsFromBody (body) {
  var pixiBody
  if (body.shape === 'plane') {
    pixiBody = new pixi.Rectangle(-10000, 0, renderer.view.width + 20000, 1)
  } else if (body.shape === 'circle') {
    pixiBody = new pixi.Circle(0, 0, body.radius)
  } else if (body.shape === 'rectangle') {
    pixiBody = new pixi.Rectangle(-body.width / 2, -body.height / 2, body.width, body.height)
  } else {
    console.warn('The heck is this:', body.shape)
  }
  pixiBody.physicsId = body.physicsId
  pixiBody.mongoId = body._id

  var graphics = new pixi.Graphics()
  if (body.data && body.data.type) {
    graphics.beginFill(parseInt(Config.styles[body.data.type].fillStyle.substring(1), 16))
    graphics.lineWidth = Config.styles[body.data.type].lineWidth || 0
    graphics.lineColor = Config.styles[body.data.type].lineColor || 0xFFFFFF
  } else 
  graphics.beginFill(0xFFFFFF)

  graphics.drawShape(pixiBody)
  graphics.endFill()
  graphics.position = {
    x: body.position[0],
    y: body.position[1]
  }
  return graphics
}

function makeP2Body (body) {
  var existingBodies = p2World.bodies.filter(function (b) {
    if (b.id === body.physicsId) {
      console.log('body with id', b.id, 'exists')
      return b
    }
  })
  if (existingBodies.length) return null
  var p2Body = new p2.Body({
    position: body.position || [0, 0],
    mass: body.mass || 1,
    damping: body.damping || 0
  })
  p2Body.id = body.physicsId
  p2Body.data = body.data
  if (body.shape === 'circle') {
    var p2Shape = new p2.Circle(body.radius)
    p2Body.addShape(p2Shape)
  }
  p2Body.velocity = body.velocity
  return p2Body
}

function startTurn () {
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

function render (newTurn) {
  if (!pause && (!receivedUpdate || amHost())) {
    tickPhysics(newTurn)
    receivedUpdate = false
  }
  if (player) pixiWorld.position = {
    x: (renderer.view.width / 2 - player.position.x) * pixiWorld.scale.x + (renderer.view.width/2),
    y: (renderer.view.height / 2 - player.position.y) * pixiWorld.scale.y + (renderer.view.height/2)
  }
  pixiWorld.children.forEach(function (graphic) {
    var p2Body = p2World.getBodyById(graphic.physicsId)
    if (!p2Body) pixiWorld.removeChild(graphic)
    else {
      graphic.position.x = p2Body.position[0]
      graphic.position.y = p2Body.position[1]
    }
  })
  renderer.render(stage)
  requestAnimationFrame(render)
}

function initPhysics () {
// We'll start with a world
  p2World = new p2.World({
    gravity: [ 0, 0 ]
  })

  p2World.on('impact', function (impact) {
    if (amHost()) {
      var impactedProjectile, typeA, typeB
      if (impact.bodyA.data && impact.bodyA.data.type) typeA = impact.bodyA.data.type
      if (impact.bodyB.data && impact.bodyB.data.type) typeB = impact.bodyB.data.type
      
      if (typeA === 'projectile') impactProjectile(impact.bodyA, 40)
      if (typeB === 'projectile') impactProjectile(impact.bodyB, 40)

      if (typeA === 'player' && typeB === 'projectile') killPlayer(impact.bodyA)
      if (typeB === 'player' && typeA === 'projectile') killPlayer(impact.bodyB)
    }
  })
}

function tickPhysics (newTurn) {
  if (newTurn === true) {
    console.log('Rendering')
    lastTurnTime = Date.now()
    var turnNumber = Turns.find().count()
    Players.find().forEach(function (player) {
      if (player.lastTurn && player.lastTurn.number === turnNumber - 1) {
        if (player.lastTurn.shot1) shoot(player.physicsId, player.lastTurn.shot1.angle, player.lastTurn.shot1.power)
        if (player.lastTurn.shot2) shoot(player.physicsId, player.lastTurn.shot2.angle, player.lastTurn.shot2.power)
      }
    })
  }
  p2World.step(0.017)

  var bodies = p2World.bodies.map(function (body) {
    return {
      physicsId: body.id,
      x: body.position[0],
      y: body.position[1],
      velocity: body.velocity
    }
  })

  BodiesStream.emit('bodies', bodies)

  if (amHost() && Date.now() >= lastTurnTime + Config.playTime) {
    console.log('Starting new turn', moment(lastTurnTime).format('HH:mm:ss:SSS'))
    startTurn()
    
    pause = true
    lastTurnTime = Date.now()
    var lastTurn = Turns.findOne()
    if (!lastTurn) Turns.insert({ number: 1, time: Date.now() })
    turnTimeout = Meteor.setTimeout(function () {
      if (pause) {
        Turns.insert({
          number: Turns.findOne().number + 1,
          time: Date.now()
        })
        lastTurnTime = Date.now()
        pause = false
      }
    }, Config.turnTime)
  }
}

function setupCameraControls () {
  $(document).on('mousewheel', function (event) {
    var scale = event.deltaY / 60
    pixiWorld.scale.x += scale
    pixiWorld.scale.y += scale
    if (pixiWorld.scale.x > 10) {
      pixiWorld.scale.x = pixiWorld.scale.y = 10
      return
    }
    if (pixiWorld.scale.x < 0.4) {
      pixiWorld.scale.x = pixiWorld.scale.y = 0.4
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
    callback(Meteor.userId(), event.angle, power)
    ui.aimArrow = null
    // Stop listening to input until the next turn
  })
}

function declareShot (angle, power) {
  power = 100
  Game.shotsFired++
  var radians = angle * Math.PI / 180
  player.moveTo(player.position)
  player.lineTo(player.position.x + (power * Math.cos(radians) * 2), renderer.view.height - player.position.y - (power * Math.sin(radians) * 2))

  Meteor.call('declareAction', Meteor.user().username, {
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

function amHost () {
  return Meteor.userId() === hostUserId
}

function killPlayer (id) {
  Players.update(id, { $inc: { deaths: 1 } })
}

function shoot (bodyId, angle, power) {
  var player = p2World.getBodyById(bodyId)
  var shootCfg = Config.actions.shoot
  // We use the angle to work out how many pixels we should move the projectile each frame
  var radians = angle * Math.PI / 180
  var stepX = (power * Math.cos(radians))
  var stepY = (power * Math.sin(radians))
  var startX = Math.cos(radians) * 20
  var startY = Math.sin(radians) * 25

  Bodies.insert({
    physicsId: Meteor.uuid(),
    shape: 'circle',
    position: [player.position[0] + startX, player.position[1] - startY],
    velocity: [ stepX * shootCfg.velocityFactor, -stepY * shootCfg.velocityFactor ],
    radius: 2,
    mass: 1,
    damping: 0,
    data: {
      type: 'projectile',
      shooterId: bodyId
    }
  })

  player.applyForce([ -stepX * shootCfg.kickBackFactor, stepY * shootCfg.kickBackFactor ], player.position )
}

function impactProjectile (projectile, explosionSize) {
  Bodies.remove({ physicsId: projectile.id })
  p2World.removeBody(projectile)
}