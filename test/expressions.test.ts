import { Niklas } from '../index'

test('basic', () => {
  const niklas = new Niklas()
  niklas.run('assert true')
  niklas.run('assert true == true')
  niklas.run('assert 42 == 42')
  niklas.run('assert (true == true)')
  niklas.run('assert (42 == 42)')
})

test('multiple', () => {
  const niklas = new Niklas()
  niklas.run('assert (5 == 5 && 42 == 42)')
  niklas.run('assert (1 == 2 || 42 == 42)')
  niklas.run('assert (1 == 1 && 2 == 2 && 42 == 42)')
  niklas.run('assert (1 == 2 || 2 == 3 || 42 == 42)')
})

test('single & multiple', () => {
  const niklas = new Niklas()
  niklas.run('assert (true && 5 == 5)')
  niklas.run('assert (true && (5 == 5)')
  niklas.run('assert (true || (2 == 3)')
})

test('complex', () => {
  const niklas = new Niklas()
  niklas.run('assert (123 == 123 && (2 == 3 || 5 == 5)')
  niklas.run('assert (123 == 123 || (2 == 3 || 5 == 6)')
})

test('complex 2', () => {
  const niklas = new Niklas()
  niklas.run('assert (123 == 123 && 3 == 3) && (2 == 3 || 5 == 5)')
  niklas.run('assert (123 == 123 || 3 == 9) || (2 == 3 || 5 == 6)')
})
