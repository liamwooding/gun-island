Meteor.publish('GameState', function () {
  return GameState.find()
})
Meteor.publish('Players', function () {
  return Players.find()
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
Meteor.publish('Hosts', function () {
  return Hosts.find({}, {
    sort: { number: -1 },
    limit: 1
  })
})

Meteor.startup(function () {
  Players.remove({})
  GameState.remove({})
  Turns.remove({})
  Bodies.remove({})
  Hosts.remove({})

  BodiesStream.permissions.read(function (userId, eventName) {
    return true
  })

  Meteor.methods({
    declareAction: function (userId, action) {
      var playerAction = {
        'lastTurn.number': Turns.find().count(),
        'lastTurn.shotsFired': action.shotsFired
      }
      playerAction['lastTurn.shot'+ action.shotsFired] = {
        angle: action.angle,
        power: action.power
      }
      Players.update({ userId: userId }, {
        $set: playerAction
      })
      if (Players.find({
        'lastTurn.number': Turns.find().count(),
        'lastTurn.shotsFired': Config.actions.shotsPerTurn
      }).count() === Players.find().count()) {
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

  Players.allow({
    update: function (userId, doc) {
      return true
    }
  })

  Bodies.allow({
    insert: function (userId, doc) {
      var host = Hosts.findOne()
      return host ? host.userId === userId : false
    }
  })

  Turns.allow({
    update: function (userId, doc) {
      var host = Hosts.findOne()
      return host ? host.userId === userId : false
    }
  })

  GameState.insert({
    Players: [],
    currentTurn: {
      state: null,
      actionsRemaining: 0
    },
    aimArrow: null,
    activeBodies: []
  })

  Turns.insert({
    number: 1,
    state: 'play'
  })

  Players.find().observeChanges({
    added: function (id, player) {
      console.log(player.username, Bodies.find().count())
      if (Bodies.find({ 'data.username': player.username }).count() === 0) {
        Bodies.insert({
          shape: 'circle',
          position: [400, 400],
          velocity: [0, 0],
          radius: 15,
          mass: 5,
          damping: 0.9,
          data: {
            type: 'player',
            username: player.username
          }
        })
      }
    }
  })
})

Accounts.onLogin(function (login) {
  console.log(login.user.username, 'logged in')
  if (Players.find({ userId: login.user._id }).count() === 0) insertPlayer(login.user)
})

function insertPlayer (user) {
  Players.insert({
    userId: user._id,
    username: user.username,
    health: 100,
    number: Players.find().count(),
    deaths: 0
  })

  if (Hosts.find().count() === 0) {
    console.log(user.username, 'is the host')
    Hosts.insert({
      number: 0,
      userId: user._id 
    })
  }
}

// function genTerrain () {
//   var walls = [
//     {
//       x: 0,
//       y: 400,
//       width: 30,
//       height: 800
//     },
//     {
//       x: 400,
//       y: 800,
//       width: 800,
//       height: 30
//     },
//     {
//       x: 800,
//       y: 400,
//       width: 30,
//       height: 800
//     },
//     {
//       x: 400,
//       y: 0,
//       width: 800,
//       height: 30
//     },
//   ]
//   walls.forEach(function (island) {
//     var boundsBody = new p2.Body({
//       type: p2.Body.STATIC,
//       position: [ island.x, island.y ]
//     })
//     boundsShape = new p2.Rectangle(island.width, island.height)
//     boundsBody.addShape(boundsShape)
//     boundsBody.data = { type: 'bounds' }
//     world.addBody(boundsBody)
//   })

//   var tables = [
//     {
//       x: 250,
//       y: 250,
//       radius: 50
//     },
//     {
//       x: 550,
//       y: 250,
//       radius: 50
//     },
//     {
//       x: 250,
//       y: 550,
//       radius: 50
//     },
//     {
//       x: 550,
//       y: 550,
//       radius: 50
//     }
//   ]

//   tables.forEach(function (table) {
//     var tableBody = new p2.Body({
//       type: p2.Body.STATIC,
//       position: [ table.x, table.y ]
//     })
//     tableShape = new p2.Circle(table.radius)
//     tableBody.addShape(tableShape)
//     tableBody.data = { type: 'obstacle' }
//     world.addBody(tableBody)
//   })
// }
