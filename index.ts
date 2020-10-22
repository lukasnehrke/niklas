/*
 * This file is part of Niklas, licensed under the MIT License (MIT).
 *
 * Copyright (c) 2020 Lukas Nehrke
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import {createTransformer} from "ts-jest";

const regex = /({|}|\/\*|\*\/|\/\/.*|\n|:|<|==|\+\+|=|\*|\/|%|&&|\|\||,|\(|\)|[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+)/g

type VariableType = (null|'number'|'string'|'function')

interface Memory {
  keywords: Function[],
  variables: any
}

interface Variable {
  final: boolean,
  type: VariableType
  value: any
}

interface FunctionVariable extends Variable {
  native: boolean
  type: 'function',
  value: {
    parameters: any[],
    returnType: VariableType
    body: [] | Function
  }
}

interface NativeFunctionVariable extends FunctionVariable {
  value: {
    parameters: any[]
    returnType: VariableType
    body: Function
  }
}

interface Options {
  clearMemoryOnExit: boolean
}

class Niklas {

  public readonly memory: Memory
  public readonly options: Options
  private tokens: string[]
  private parent?: Niklas

  constructor (options?: Options) {
    this.options = options || { clearMemoryOnExit: true }
    this.tokens = []
    this.memory = {
      variables: {
        println: {
          final: true,
          native: true,
          type: 'function',
          value: {
            parameters: [],
            body: (params: any) => {
              console.log(...params)
            }
          }
        },
        runJS: {
          final: true,
          native: true,
          type: 'function',
          value: {
            parameters: [],
            body: (params: any) => {
              return eval(params[0])
            }
          }
        }
      },
      keywords: [
        this.handleComment,
        this.handleAssert,
        this.handleRepeat,
        this.handleWhile,
        this.handleFromTo,
        this.handleCondition,
        this.isVariableKeyword,
        this.handleFunctionDeclaration,
        this.isStatementKeyword
      ]
    }
  }

  /* Operations */

  addVariable (final: boolean, name: string, type: string, value: any) {
    this.memory.variables[name] = {
      final: final,
      type: type,
      value: value
    }
  }

  getVariable (name: string): Variable {
    const res = this.memory.variables[name]
    if (!res && this.parent) {
      return this.parent.getVariable(name)
    }
    return res
  }

  callFunction (fun: FunctionVariable): any {
    if (this.get() !== '(') {
      throw new Error('Parameter list must start with parenthesis')
    }
    const params = []
    while (true) {
      if (this.peek() === ')') {
        this.get()
        break
      }
      const expression = this.evaluate()
      params.push(expression)
      if (this.peek() === ',') {
        this.get()
      } else if (this.peek() !== ')') {
        throw new Error('Function parameters must be separated by comma')
      }
    }
    for (let i = 0; i < fun.value.parameters.length; i++) {
      const param = fun.value.parameters[i] as any
      if (!params[i]) {
        throw new Error('Parameter ' + param.name + ' is missing!')
      }
      const type = typeof params[i]
      if (param.type && param.type !== 'any' && type !== param.type) {
        throw new Error('Parameter ' + param.name + ' must be of type ' + param.type + ', but was ' + type)
      }
    }
    if (fun.native) {
      return (fun as NativeFunctionVariable).value.body(params)
    }
    const niklas = new Niklas()
    niklas.parent = this
    niklas.tokens = [...fun.value.body as any]
    for (let i = 0; i < params.length; i++) {
      niklas.addVariable(true, fun.value.parameters[i].name, fun.value.parameters[i].type, params[i])
    }
    return niklas.execute()
  }

  /* Execution */

  public run (source: String) {
    this.tokens = source.split(regex).filter(token => token.trim())
    return this.execute()
  }

  private execute (): any {
    while (this.tokens.length) {
      if (this.peek() === '}') {
        break
      }
      if (this.peek() === 'return') {
        if (!this.parent) {
          throw new Error('Invalid return statement')
        }
        this.get()
        return this.evaluate()
      }
      let found = false
      for (let i = 0; i < this.memory.keywords.length; i++) {
        let shouldContinue = false
        const next = () => shouldContinue = true
        const returnValue = this.memory.keywords[i].call(this, next)
        if (returnValue) {
          found = true
          if (!this.parent) {
            throw new Error('Invalid return statement')
          }
          return returnValue
        }
        if (!shouldContinue) {
          found = true
          break
        }
      }
      if (!found) {
        throw new Error('Cannot handle token ' + this.peek())
      }
    }
  }

  /* Tokens */

  private peek (tokens = this.tokens) {
    return tokens[0]
  }

  private get (tokens = this.tokens) {
    return tokens.shift()!
  }

  private skipBlock () {
    let blocks = 1;
    while (true) {
      const char = this.get()
      if (char === '{') {
        blocks++
      } else if (char === '}') {
        blocks--
      }
      if (blocks === 0) {
        break
      }
    }
  }

  private collectBlock () {
    let blocks = 1;
    let tokens = []
    while (true) {
      const token = this.get()
      if (token === '{') {
        blocks++
      } else if (token === '}') {
        blocks--
      }
      tokens.push(token)
      if (blocks === 0) {
        break
      }
    }
    return tokens
  }

  /* Handlers */

  private handleComment (next: any) {
    if (this.peek() === '/*') {
      while (this.tokens.length) {
        if (this.get() === '*/') {
          break
        }
      }
    } else if (this.peek().startsWith('//')) {
      this.get()
    } else {
      next()
    }
  }

  private handleAssert (next: any) {
    if (this.peek() !== 'assert') {
      next()
      return
    }
    this.get()
    const condition = this.evaluate()
    if (!condition) {
      throw new Error('Assertion failed')
    }
  }

  private handleRepeat (next: any) {
    if (this.peek() !== 'repeat') {
      next()
      return
    }
    this.get()
    const x = this.evaluate()
    if (typeof x !== 'number') {
      throw new Error('Argument after repeat must be of type number')
    }
    if (this.get() !== '{') {
      throw new Error('After repeat must follow a block')
    }
    const tokens = this.collectBlock()
    for (let i = 0; i < x; i++) {
      const niklas = new Niklas()
      niklas.parent = this
      niklas.tokens = [...tokens]
      const result = niklas.execute()
      if (result) {
        return result
      }
    }
  }

  private handleWhile (next: any) {
    if (this.peek() !== 'while') {
      next()
      return
    }
    this.get()
    const conditionTokens = []
    while (this.tokens.length) {
      if (this.peek() === '{') {
        this.get()
        break
      }
      conditionTokens.push(this.get())
    }
    const tokens = this.collectBlock()
    let condition
    while (condition = this.evaluate([...conditionTokens])) {
      const niklas = new Niklas()
      niklas.parent = this
      niklas.tokens = [...tokens]
      const returnValue = niklas.execute()
      if (returnValue) {
        return returnValue
      }
    }
  }

  private handleFromTo (next: any) {
    if (this.peek() !== 'from') {
      next()
      return
    }
    this.get()
    const from = this.evaluate()
    if (typeof from !== 'number') {
      throw new Error('Expression after from must be a number')
    }
    if (this.get() !== 'to') {
      throw new Error('After from must follow a to')
    }
    const to = this.evaluate()
    if (typeof to !== 'number') {
      throw new Error('Expression after to must be a number')
    }
    let variable
    if (this.peek() === 'with') {
      this.get()
      variable = this.get()
    }
    if (this.get() !== '{') {
      throw new Error('From-To-Loop must have a body')
    }
    const tokens = this.collectBlock()
    for (let i = from; i < to; i++) {
      const niklas = new Niklas()
      if (variable) {
        niklas.addVariable(true, variable, 'number', i)
      }
      niklas.parent = this
      niklas.tokens = [...tokens]
      const returnType = niklas.execute()
      if (returnType) {
        return returnType
      }
    }
  }

  private isVariableKeyword (next: any) {
    if (!['var', 'val'].includes(this.peek())) {
      next()
      return
    }
    const final = this.get() === 'val'
    const name = this.get()
    let returnType = null
    if (this.peek() === ':') {
      this.get()
      returnType = this.get()
    }
    if (this.get() !== '=') {
      throw new Error('Variable declaration is missing \'=\'')
    }
    const eval2 = this.evaluate()
    this.addVariable(final, name, returnType as any, eval2)
  }

  private handleFunctionDeclaration (next: any) {
    if (this.peek() !== 'def') {
      next()
      return
    }
    this.get()
    const name = this.get();
    let returnType = 'any'
    const params = []
    if (this.get() !== '(') {
      throw new Error('Function parameter list must start with parentheses')
    }
    while (this.tokens.length) {
      if (this.peek() === ')') {
        this.get()
        break
      }
      const name = this.get()
      let type = 'any'
      if (this.peek() === ':') {
        this.get()
        type = this.get()
      }
      params.push({
        name: name,
        type: type
      })
      if (this.peek() === ',') {
        this.get()
      } else if (this.peek() !== ')') {
        throw new Error('Function parameters must be separated by comma')
      }
    }
    if (this.peek() === ':') {
      this.get()
      returnType = this.get()
    }
    if (this.get() !== '{') {
      throw new Error('Function body must start with a brace')
    }
    const tokens = this.collectBlock()
    this.addVariable(true, name, 'function', {
      parameters: params,
      returnType: returnType,
      body: tokens
    })
  }

  private handleCondition (next: any) {
    if (this.peek() !== 'if') {
      next()
      return
    }
    this.get()
    while (this.tokens.length) {
      const condition = this.evaluate()
      if (this.get() !== '{') {
        throw new Error('If-Block must begin with a brace {')
      }
      if (condition) {
        const niklas = new Niklas()
        niklas.parent = this
        niklas.tokens = this.collectBlock()
        const returnValue = niklas.execute()
        if (returnValue) {
          return returnValue
        }
        break
      } else {
        this.skipBlock()
        if (this.peek() === 'else') {
          this.get()
          if (this.peek() === 'if') {
            this.get()
            continue
          }
          if (this.get() !== '{') {
            throw new Error('Else-Block must begin with a brace {')
          }

          const niklas = new Niklas()
          niklas.parent = this
          niklas.tokens = this.collectBlock()
          const returnValue = niklas.execute()
          if (returnValue) {
            return returnValue
          }
        } else {
          break
        }
      }
    }
    while (this.peek() === 'else') {
      this.get()
      if (this.get() !== '{') {
        throw new Error('Else-Block must begin with a brace {')
      }
      this.skipBlock()
    }
  }

  private isStatementKeyword () {
    this.getExpression()
  }

  /* Expressions */

  private evaluate (tokens = this.tokens): any {
    let value;
    if (this.peek(tokens) === '(') {
      this.get(tokens)
      value = this.evaluate(tokens)
      if (this.peek(tokens) === ')') {
        this.get(tokens)
      }
    } else {
      const left = this.getExpression(tokens)
      if (this.peek(tokens) === '==') {
        this.get(tokens)
        const ex = this.getExpression(tokens)
        value = left == ex
      } else if (this.peek(tokens) === '<') {
        this.get(tokens)
        value = left < this.getExpression(tokens)
      } else if (this.peek(tokens) === '>') {
        this.get(tokens)
        value = left > this.getExpression(tokens)
      } else {
        value = left
      }
    }
    if (this.peek(tokens) === '&&') {
      this.get(tokens)
      const other = this.evaluate(tokens)
      value = (value && other)
    } else if (this.peek(tokens) === '||') {
      this.get(tokens)
      const other = this.evaluate(tokens)
      value = (value || other)
    }
    return value
  }

  private getExpression (tokens = this.tokens): any {
    const left = this.getFactor(tokens)
    if (this.peek(tokens) === '*') {
      this.get(tokens)
      return left * this.getExpression(tokens)
    }
    if (this.peek(tokens) === '/') {
      this.get(tokens)
      return left / this.getExpression(tokens)
    }
    if (this.peek(tokens) === '%') {
      this.get(tokens)
      return left % this.getExpression(tokens)
    }
    return left
  }

  private getFactor (tokens = this.tokens): any {
    if (this.peek(tokens) === '!') {
      this.get(tokens)
      const result = this.getFactor(tokens)
      if (typeof result !== 'boolean') {
        throw new Error('NOT-Operator (!) can only be applied to booleans')
      }
      return !result
    }
    if (this.peek(tokens) === '-') {
      this.get(tokens)
      const result = this.getFactor(tokens)
      if (typeof result !== 'number') {
        throw new Error('Minus-Operator (-) can only be applied to numbers')
      }
      return -result
    }
    if (this.peek(tokens) === '(') {
      this.get(tokens)
      const result = this.evaluate(tokens)
      if (this.get(tokens) !== ')') {
        throw new Error('A parenthese is not closed')
      }
      return result
    }
    if (['true', 'false'].includes(this.peek(tokens))) {
      return this.get(tokens) === 'true'
    }
    if ('0123456789'.includes(this.peek(tokens)[0])) {
      return parseInt(this.get(tokens))
    }
    if ('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.includes(this.peek(tokens)[0])) {
      const name = this.get(tokens)
      const variable = this.getVariable(name)
      if (!variable) {
        throw new Error('Unknown variable ' + name)
      }
      if (variable.type === 'function') {
        return this.callFunction(variable as FunctionVariable)
      }
      let result = variable.value;
      if (this.peek(tokens) === '=') {
        this.get()
        this.checkFinal(variable)
        result = this.evaluate(tokens)
        this.checkTypeCompatibility(variable.type, result)
        variable.value = result
      } else if (this.peek(tokens) === '++') {
        this.get(tokens)
        this.checkFinal(variable)
        variable.value = variable.value + 1
      } else if (this.peek(tokens) === '--') {
        this.get(tokens)
        this.checkFinal(variable)
        variable.value = variable.value - 1
      }
      return result
    }
    throw new Error('Unknown start of factor: ' + this.peek(tokens))
  }

  /* Utilities */

  checkFinal (variable: Variable) {
    if (variable.final) {
      throw new Error('ConstantError: A constant\'s value may not change!')
    }
  }

  checkTypeCompatibility (type: VariableType, variable: any) {
    if (type && typeof variable !== type) {
      throw new Error('TypeError: ' + type + ' is not compatible to ' + typeof variable)
    }
  }
}

export {
  Niklas
}
