GameState = new Mongo.Collection('GameState')
Characters = new Mongo.Collection('Characters')
Turns = new Mongo.Collection('Turns')
Bodies = new Mongo.Collection('Bodies')

Config = {
  turnTime: 10000,
  playTime: 2000,
  actions: {
    shoot: {
      bulletMass: 0.01,
      velocityFactor: 2.5,
      kickBackFactor: 0.7,
      explosionForce: 10
    },
    jump: {
      velocityFactor: 1.5
    }
  }
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
