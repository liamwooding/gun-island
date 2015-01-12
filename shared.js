GameState = new Mongo.Collection('GameState')
Characters = new Mongo.Collection('Characters')
Turns = new Mongo.Collection('Turns')
Bodies = new Mongo.Collection('Bodies')

BodiesStream = new Meteor.Stream('bodies')

Config = {
  turnTime: 10000,
  playTime: 2000,
  maxVelocity: 400,
  dampingFactor: 5000,
  positions: [
    [ 100, 400 ],
    [ 700, 400 ],
    [ 400, 700 ],
    [ 400, 100 ],
    [ 100, 100 ],
    [ 700, 700 ],
    [ 100, 700 ],
    [ 700, 100 ]
  ],
  actions: {
    shotsPerTurn: 2,
    shoot: {
      velocityFactor: 3,
      kickBackFactor: 1000,
      explosionForce: 10000
    }
  },
  styles: {
    obstacle: {
      fillStyle: '#778585'
    },
    ground: {
      fillStyle: '#F2D5A5'
    },
    character: {
      fillStyle: '#6E513B'
    },
    projectile: {
      fillStyle: '#000000'
    },
    bounds: {
      fillStyle: '#778585'
    }
  }
}