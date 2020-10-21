const regex = /({|}|&&|\|\||,|\(|\)|[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+)/g

interface Memory {
  keywords: Function[],
  variables: any
}

interface Variable {
  final: boolean,
  type: 'any' | 'function'
  value: any
}

interface FunctionVariable extends Variable {
  native: boolean
  type: 'function',
  value: {
    parameters: [],
    body: [] | Function
  }
}

interface NativeFunctionVariable extends FunctionVariable {
  value: {
    parameters: []
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
        log: {
          final: true,
          native: true,
          name: 'log',
          type: 'function',
          value: {
            parameters: [],
            body: (params: any) => {
              console.log(params)
            }
          }
        },
        runJS: {
          final: true,
          native: true,
          name: 'runJS',
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
        this.isAssertKeyword,
        this.isVariableKeyword,
        this.handleFunctionDeclaration,
        this.isConditionalKeyword,
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
      if (this.peek() === ',') {
        this.get()
      }
      const expression = this.evaluate()
      params.push(expression)
      if (this.peek() !== ',' && this.peek() !== ')') {
        throw new Error('Params must be separated with comma')
      }
    }
    if (fun.native) {
      return (fun as NativeFunctionVariable).value.body(params)
    }
    const niklas = new Niklas()
    niklas.tokens = fun.value.body as []
    return niklas.execute(true)
  }

  /* Execution */

  public run (source: String) {
    this.tokens = source.replace(/\r?\n|\r/g, ' ').split(regex).filter(function (s) { return !s.match(/^\s*$/); });
    this.execute(true)
  }

  private execute (fail = false) {
    while (this.tokens.length) {
      let found = false
      if (this.peek() === '}') {
        break
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

  private peek () {
    return this.tokens[0]
  }

  private get () {
    return this.tokens.shift()!
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

  /* Expressions */

  private getFactor (): any {
    if (this.peek() === '!') {
      this.get()
      const result = this.getFactor()
      if (typeof result !== 'boolean') {
        throw new Error('NOT-Operator (!) can only be applied to booleans')
      }
      return !result
    }
    if (this.peek() === '-') {
      this.get()
      const result = this.getFactor()
      if (typeof result !== 'number') {
        throw new Error('Minus-Operator (-) can only be applied to numbers')
      }
      return -result
    }
    if (this.peek() === '(') {
      this.get()
      const result = this.evaluate()
      if (this.get() !== ')') {
        throw new Error('A parenthese is not closed')
      }
      return result
    }
    if (this.isBoolean()) {
      return this.get() === 'true'
    }
    if (this.isNumber()) {
      return parseInt(this.get())
    }
    if (this.isLetter()) {
      const name = this.get()
      const variable = this.getVariable(name)
      if (!variable) {
        throw new Error('Unknown variable ' + name)
      }
      if (variable.type === 'function') {
        return this.callFunction(variable as FunctionVariable)
      }
      return variable.value
    }
    throw new Error('Unknown start of factor: ' + this.peek())
  }

  private getExpression (): any {
    return this.getFactor()
  }

  private evaluateSimpleExpression (): any {
    const left = this.getExpression()
    if (this.peek() === '==') {
      this.get()
      return left == this.getExpression()
    }
    if (this.peek() === '<') {
      this.get()
      return left < this.getExpression()
    }
    if (this.peek() === '>') {
      this.get()
      return left > this.getExpression()
    }
    return left
  }

  /*
  private evaluateExpression (): boolean {
    if (this.peek() === '(') {
      this.get()
    }
    const left = this.evaluateSimpleExpression()
    let value;
    switch (this.peek()) {
      case '&':
      case '&&':
        this.get()
        value = left && this.evaluateExpression()
        break
      case '|':
      case '||':
        this.get()
        value = left || this.evaluateExpression()
        break
      default:
        return left
    }
    if (this.peek() === ')') {
      this.get()
      if (this.peek() === '&&') {
        this.get()
        return value && this.evaluateExpression()
      }
      if (this.peek() === '||') {
        this.get()
        return value || this.evaluateExpression()
      }
    }
    return value
  }
 */

  private evaluate (): boolean {
    let value;
    if (this.peek() === '(') {
      this.get()
      value = this.evaluate()
      if (this.peek() === ')') {
        this.get()
      }
    } else {
      console.log('Evaluating ' + this.tokens[0] + this.tokens[1] + this.tokens[2])
      value = this.evaluateSimpleExpression()
      console.log('Result: ' + value)
    }
    if (this.peek() === '&&') {
      this.get()
      value = (value && this.evaluate())
    } else if (this.peek() === '||') {
      this.get()
      value = (value || this.evaluate())
    }
    return value
  }

  /* Keywords */

  private isVariableKeyword () {
    if (['var', 'val'].includes(this.peek())) {
      const final = this.get() === 'val'
      const name = this.get()
      if (this.get() !== '=') {
        throw new Error('Variable declaration is missing \'=\'')
      }
      if (this.isNumber()) {
        this.addVariable(final, name, 'number', Number(this.get()))
        return true
      }
      this.addVariable(final, name, 'any', this.evaluate())
      return true
    }
  }

  private handleFunctionDeclaration () {
    if (this.peek() === 'def') {
      this.get()
      const name = this.get();
      if (this.get() !== '(') {
        throw new Error('Function parameter list must start with parentheses')
      }
      while (true) {
        if (this.peek() === ')') {
          this.get()
          break
        }
      }
      if (this.get() !== '{') {
        throw new Error('Function body must start with a brace')
      }
      const tokens = this.collectBlock()
      this.addVariable(true, name, 'function', {
        parameters: [],
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
          console.log('Inside condition')
          if (this.get() !== '{') {
            throw new Error('If-Block must begin with a brace {')
          }
          console.log(this.tokens)
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

  private isAssertKeyword () {
    if (this.peek() === 'assert') {
      this.get()
      const condition = this.evaluate()
      if (!condition) {
        throw new Error('Assertion failed')
      }
    }
  }

  private isStatementKeyword () {
    this.getExpression()
    return true
  }

  private isBoolean () {
    return ['true', 'false'].includes(this.peek())
  }

  private isNumber () {
    return '0123456789'.includes(this.peek()[0])
  }

  private isLetter () {
    return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.includes(this.peek()[0])
  }
}

export {
  Niklas
}
