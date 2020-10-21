import { Niklas } from './index'

/* Variables */

const variables = new Niklas({ clearMemoryOnExit: false })
variables.run(`
  val x = 16
  val y = 15
  val z = 16
  if (x == y) {
    val tree = false  
  } else if(x == y) {
    val tree2 = false
  }
  def hello() {
    val h = 666  
  }
`)

console.log(variables.memory.env[0])
