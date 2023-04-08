import { Term } from 'rdf-js'
import { GraphPointer } from 'clownface'
import { isGraphPointer, isLiteral } from 'is-graph-pointer'
import { rdf, sh, xsd } from '@tpluscode/rdf-ns-builders'
import { dashSparql } from '@tpluscode/rdf-ns-builders/loose'
import { sparql, SparqlTemplateResult } from '@tpluscode/sparql-builder'
import { shrink } from '@zazuko/prefixes'
import { fromRdf } from 'rdf-literal'
import $rdf from 'rdf-ext'
import { IN } from '@tpluscode/sparql-builder/expressions'
import vocabulary from '../../vocabulary.js'
import { TRUE } from '../../lib/rdf.js'
import { NodeExpression, Parameters } from './NodeExpression.js'
import { NodeExpressionFactory } from './index.js'

interface Parameter {
  datatype?: Term
  optional: boolean
}

export abstract class FunctionExpression implements NodeExpression {
  static match(pointer: GraphPointer) {
    const [first, ...rest] = [...pointer.dataset.match(pointer.term)]
    const isSingleSubject = first && rest.length === 0
    if (!isSingleSubject) {
      return false
    }

    const functionPtr = vocabulary.node(first.predicate).has(rdf.type, sh.Function)

    return isGraphPointer(functionPtr) && pointer.out(functionPtr).isList()
  }

  static fromPointer(pointer: GraphPointer, createExpr: NodeExpressionFactory) {
    const [first] = [...pointer.dataset.match(pointer.term)]
    const functionPtr = vocabulary.node(first.predicate)
    const argumentList = pointer.out(functionPtr).list()
    if (!argumentList) {
      throw new Error(`Object of ${shrink(functionPtr.term.value)} must be an RDF List`)
    }

    const symbol = functionPtr.out(dashSparql.symbol).term || functionPtr.term
    const returnType = functionPtr.out(sh.returnType).term
    const unlimitedParameters = TRUE.equals(functionPtr.out(dashSparql.unlimitedParameters).term)

    const expressionList = [...argumentList].map(createExpr)
    if (isGraphPointer(functionPtr.has(rdf.type, dashSparql.AdditiveExpression))) {
      return new AdditiveExpression(functionPtr.term, symbol.value, returnType, expressionList)
    }
    if (isGraphPointer(functionPtr.has(rdf.type, dashSparql.RelationalExpression))) {
      return new RelationalExpression(functionPtr.term, symbol.value, getParameters(functionPtr.term), expressionList)
    }
    if (functionPtr.term.equals(dashSparql.in) || functionPtr.term.equals(dashSparql.notin)) {
      return new InExpression(<any>functionPtr.term, expressionList)
    }

    return new FunctionCallExpression(functionPtr.term, expressionList, {
      symbol,
      parameters: getParameters(functionPtr.term),
      returnType,
      unlimitedParameters,
    })
  }

  public readonly parameters: ReadonlyArray<Parameter>

  public readonly returnType: Term | undefined

  public readonly symbol: Term

  public constructor(
    public readonly term: Term,
    public readonly args: ReadonlyArray<NodeExpression> = [],
    { symbol = term, returnType, parameters = [], unlimitedParameters = false }: { symbol?: Term; parameters?: ReadonlyArray<Parameter>; returnType?: Term; unlimitedParameters?: boolean } = {}) {
    this.symbol = symbol
    this.returnType = returnType
    this.parameters = parameters
    assertFunctionArguments(this, args, unlimitedParameters)
  }

  buildPatterns(args: Parameters) {
    const { expressions, patterns } = this.evaluateArguments(args)

    return sparql`${patterns}\nBIND(${this.boundExpression(args.subject, expressions)} as ${args.object})`
  }

  buildInlineExpression(args: Parameters) {
    const { expressions, patterns } = this.evaluateArguments(args)
    return {
      patterns,
      inline: sparql`(${this.boundExpression(args.subject, expressions)})`,
    }
  }

  protected abstract boundExpression(subject: Term, args: SparqlTemplateResult[]): SparqlTemplateResult

  private evaluateArguments(arg: Parameters) {
    return this.args.reduce((result, expr) => {
      if ('buildInlineExpression' in expr) {
        const { inline, patterns } = expr.buildInlineExpression(arg)
        return {
          expressions: [...result.expressions, inline],
          patterns: patterns ? sparql`${result.patterns}\n${patterns}` : result.patterns,
        }
      }

      const next = arg.variable()
      return {
        expressions: [...result.expressions, sparql`${next}`],
        patterns: sparql`${result.patterns}\n${expr.buildPatterns({ ...arg, object: next })}`,
      }
    }, {
      expressions: <SparqlTemplateResult[]>[],
      patterns: sparql``,
    })
  }
}

export class AdditiveExpression extends FunctionExpression {
  constructor(term: Term, symbol: string, returnType: Term | undefined, args: NodeExpression[]) {
    super(term, args, { symbol: $rdf.literal(symbol), returnType })
  }

  protected boundExpression(subject: Term, args: SparqlTemplateResult[]): SparqlTemplateResult {
    const [first, ...rest] = args
    return rest.reduce((expr, arg) => {
      return sparql`${expr} ${this.symbol.value} ${arg}`
    }, sparql`${first}`)
  }
}

export class RelationalExpression extends FunctionExpression {
  constructor(term: Term, symbol: string, parameters: ReadonlyArray<Parameter>, args: NodeExpression[]) {
    super(term, args, { symbol: $rdf.literal(symbol), parameters, returnType: xsd.boolean })
  }

  protected boundExpression(subject: Term, [left, right]: SparqlTemplateResult[]): SparqlTemplateResult {
    return sparql`${left} ${this.symbol.value} ${right}`
  }
}

export class InExpression extends FunctionExpression {
  public readonly negated: boolean

  constructor(term: typeof dashSparql.in | typeof dashSparql.notin, args: NodeExpression[]) {
    super(term, args, {
      symbol: $rdf.literal('IN'),
      parameters: getParameters(term),
      returnType: xsd.boolean,
      unlimitedParameters: true,
    })
    this.negated = term.equals(dashSparql.notin)
  }

  protected boundExpression(subject: Term, args: SparqlTemplateResult[]): SparqlTemplateResult {
    const not = this.negated ? 'NOT ' : ''
    return sparql`${subject} ${not}${IN(...args)}`
  }
}

export class FunctionCallExpression extends FunctionExpression {
  protected boundExpression(subject: Term, args: SparqlTemplateResult[]): SparqlTemplateResult {
    const [first, ...rest] = args
    const argList = rest.reduce((list, arg) => sparql`${list}, ${arg}`, sparql`${first}`)
    const symbol = this.symbol.termType === 'Literal'
      ? this.symbol.value
      : this.symbol

    return sparql`${symbol}(${argList})`
  }
}

function assertFunctionArguments(func: FunctionExpression, args: ReadonlyArray<NodeExpression>, unlimitedParameters: boolean) {
  if (!func.parameters.length) return

  const minArguments = func.parameters.filter(p => !p.optional).length
  const maxArguments = unlimitedParameters ? Number.MAX_SAFE_INTEGER : func.parameters.length

  if (args.length >= minArguments && args.length <= maxArguments) return

  if (unlimitedParameters) {
    throw new Error(`Function ${shrink(func.term.value)} requires at least ${minArguments} arguments`)
  }
  if (minArguments === maxArguments) {
    throw new Error(`Function ${shrink(func.term.value)} requires ${func.parameters.length} arguments`)
  } else {
    throw new Error(`Function ${shrink(func.term.value)} requires between ${minArguments} and ${maxArguments} arguments`)
  }

  // TODO: check argument types
}

function getParameters(functionId: Term) {
  return vocabulary.node(functionId).out(sh.parameter).map(parameter => {
    const order = parameter.out(sh.order)
    return {
      order: isLiteral(order) ? fromRdf(order.term) : 0,
      datatype: parameter.out(sh.datatype).term,
      optional: TRUE.equals(parameter.out(sh.optional).term),
    }
  })
    .sort((l, r) => l.order - r.order)
}