// Let's start with a universe
var world = new p2.World({
  gravity: [0, -9.82]
})

// Separate the heavens and the firmament
var groundBody = new p2.Body({
  mass: 0 // Setting mass to 0 makes this body static
})
var groundShape = new p2.Plane()
groundBody.addShape(groundShape)
world.addBody(groundBody)

// Create an empty dynamic body
var circleBody = new p2.Body({
    mass: 5,
    position: [10, 10]
})

// Add a circle shape to the body.
var radius = 1
var circleShape = new p2.Circle(radius)
circleBody.addShape(circleShape)

// ...and add the body to the world.
// If we don't add it to the world, it won't be simulated.
world.addBody(circleBody)

var timeStep = 1000 / 60

// Used by our animation loop to store the time
var then = null

requestAnimationFrame(draw)

function draw (now) {
  requestAnimationFrame(draw)
  // dt stands for delta time, our 'time between frames' - used for smooth animating
  var dt = now - (then || now)
  then = now

  console.log(circleBody.position)
  world.step(dt)
}