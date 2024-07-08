import type { NamedNode, Variable } from '@rdfjs/types'
import $rdf from '@zazuko/env/web.js'
import type sparqljs from 'sparqljs'
import { FocusNode } from '../../lib/FocusNode.js'
import { ShapePatterns } from '../../lib/shapePatterns.js'
import { VariableSequence } from '../../lib/variableSequence.js'
import { NodeExpression, PatternBuilder } from '../nodeExpression/NodeExpression.js'

interface Parameters {
  focusNode: FocusNode
  variable: VariableSequence
  rootPatterns: sparqljs.Pattern[]
  objectNode: Variable
  builder: PatternBuilder
}

export interface PropertyValueRule {
  buildPatterns({ focusNode, objectNode, variable, rootPatterns }: Parameters): ShapePatterns
}

export default class implements PropertyValueRule {
  constructor(public readonly path: NamedNode, public readonly nodeExpression: NodeExpression, public readonly options: { inverse?: boolean } = {}) {
  }

  buildPatterns({ focusNode, objectNode, variable, rootPatterns, builder }: Parameters): ShapePatterns {
    const { patterns, requiresFullContext } = builder.build(this.nodeExpression, { subject: focusNode, object: objectNode, variable, rootPatterns })
    let whereClause: sparqljs.Pattern[]
    let unionPatterns: sparqljs.Pattern[] | undefined
    if (patterns[0].type === 'query') {
      whereClause = [{
        type: 'group',
        patterns: [{
          ...patterns[0],
          where: [
            ...patterns[0].where,
            ...rootPatterns,
          ],
        }],
      }]
    } else {
      whereClause = patterns
      if (requiresFullContext) {
        unionPatterns = rootPatterns
      }
    }

    const constructClause = !this.options.inverse
      ? [$rdf.quad(focusNode, this.path, objectNode)]
      : [$rdf.quad(objectNode, this.path, focusNode)]

    return {
      unionPatterns,
      constructClause,
      whereClause,
    }
  }
}
