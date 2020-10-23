# Niklas

A simple interpreted programming language built on JavaScript.

**Features:**
  - Modern syntax
  - Set a delay between commands
  - Control structures can be disabled
  - Hooks to highlight currently active line/token
  - Runs everywhere JS runs

## Syntax
```scala
// Variables (val = final)
var a = 5
val b = 7
val c = (a == 5 && b == 7)

// Functions
def fib (n: number): number {
  checkArgument(n > 0, "n must be greater than 0")
  if (n == 1 || n == 2) {
    return 1
  }
  return fib(n - 1) + fib(n - 2)
}

// Loops
var r = 3
repeat (3) {
  r = fib(r)
}

val arr = []
from 0 to 10 with x {
  from 0 to 10 with y {
    arr[x][y] = 1
  }
}

var w = 0
while (w < 5) {
  print("Hello World!")
  w++
}
```

## License

This project is licensed under the [MIT License](https://github.com/lukasnehrke/niklas/blob/main/LICENSE).
