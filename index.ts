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

const regex = /({|}|\/\*|\*\/|\/\/.*|\n|:|<|==|\+\+|=|\*|\/|%|&&|\|\||,|\(|\)|[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+)/g

type VariableType = ('any'|'number'|'string'|'function')

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
        this.isConditionalKeyword,
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
    return niklas.execute(true)
  }

  /* Execution */

  public run (source: String) {
    this.tokens = source.split(regex).filter(token => token.trim())
    this.execute(true)
  }

  private execute (fail = false): any {
    while (this.tokens.length) {
      let found = false
      if (this.peek() === '}') {
        break
      }
      if (this.peek() === 'return') {
        this.get()
        return this.evaluate()
      }
      for (let i = 0; i < this.memory.keywords.length; i++) {
        if (this.memory.keywords[i].call(this)) {
          found = true
          break
        }
      }
      if (!found) {
        if (fail) {
          throw new Error('Cannot handle token ' + this.peek())
        }
        break
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
    let blocks = 0;
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
      } else {
        tokens.push(token)
      }
      if (blocks === 0) {
        break
      }
    }
    return tokens
  }

  /* Handlers */

  private handleComment () {
    if (this.peek() === '\n') {
      this.get()
      return true
    }
    if (this.peek() === '/*') {
      while (this.tokens.length) {
        if (this.get() === '*/') {
          break
        }
      }
      return true
    }
    if (this.peek().startsWith('//')) {
      this.get()
      return true
    }
  }

  private handleAssert () {
    if (this.peek() === 'assert') {
      this.get()
      const condition = this.evaluate()
      if (!condition) {
        throw new Error('Assertion failed')
      }
      return true
    }
  }

  private handleRepeat () {
    if (this.peek() === 'repeat') {
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
        niklas.execute(true)
      }
      return true
    }
  }

  private handleWhile () {
    if (this.peek() === 'while') {
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
        niklas.execute(true)
      }
      return true
    }
  }

  private isVariableKeyword () {
    if (['var', 'val'].includes(this.peek())) {
      const final = this.get() === 'val'
      const name = this.get()
      if (this.get() !== '=') {
        throw new Error('Variable declaration is missing \'=\'')
      }
      const eval2 = this.evaluate()
      this.addVariable(final, name, 'any', eval2)
      return true
    }
  }

  private handleFunctionDeclaration () {
    if (this.peek() === 'def') {
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
      return true
    }
  }

  private isConditionalKeyword () {
    if (this.peek() === 'if') {
      this.get()
      while (true) {
        const condition = this.evaluate()
        if (condition) {
          if (this.get() !== '{') {
            throw new Error('If-Block must begin with a brace {')
          }
          const niklas = new Niklas()
          niklas.parent = this
          //niklas.tokens = this.collectBlock()
          //console.log(niklas.tokens)
          //niklas.execute(true)
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
            niklas.execute(true)

            return true
          } else {
            break
          }
        }
      }
      while (this.peek() === 'else') {
        this.get()
        this.skipBlock()
      }
      return true
    }
  }

  private isStatementKeyword () {
    this.getExpression()
    return true
  }

  /* Expressions */

  private evaluate (tokens = this.tokens): any {
    let value;
    if (this.peek(tokens) === '(') {
      this.get(tokens)
      value = this.evaluate(tokens)
      if (this.peek(tokens) === ')') {
        tokens.shift()
      }
    } else {
      const left = this.getExpression(tokens)
      if (this.peek(tokens) === '==') {
        this.get(tokens)
        return left == this.getExpression(tokens)
      } else if (this.peek(tokens) === '<') {
        this.get(tokens)
        return left < this.getExpression(tokens)
      } else if (this.peek(tokens) === '>') {
        this.get(tokens)
        value = left > this.getExpression(tokens)
      } else {
        value = left
      }
    }
    if (this.peek(tokens) === '&&') {
      this.get(tokens)
      value = (value && this.evaluate(tokens))
    } else if (this.peek(tokens) === '||') {
      this.get(tokens)
      value = (value || this.evaluate(tokens))
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
      let result = variable.value
      if (this.peek(tokens) === '++') {
        this.get(tokens)
        variable.value = variable.value + 1
      }
      if (this.peek(tokens) === '--') {
        this.get(tokens)
        variable.value = variable.value - 1
      }
      return result
    }
    throw new Error('Unknown start of factor: ' + this.peek(tokens))
  }
}

export {
  Niklas
}
