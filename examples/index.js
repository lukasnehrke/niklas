#!/usr/bin/env node

const path = require('path')
const fs = require('fs')
const niklas = require('../lib/index')

const loc = path.resolve(process.argv[2])

if (!fs.existsSync(loc)) {
  console.error('File could not be found')
  process.exit(1)
}

const file = fs.readFileSync(loc, 'utf8')

const interpreter = new niklas.Niklas()
interpreter.run(file).catch(err => {
  console.error('Niklas failed with errors:', err)
})
