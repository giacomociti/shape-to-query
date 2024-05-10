import type { Variable } from '@rdfjs/types'
import { VariableSequence } from '../../lib/variableSequence.js'
import { ShapePatterns } from '../../lib/shapePatterns.js'

export interface Parameters {
  focusNode: Variable
  variable: VariableSequence
}

export abstract class Target {
  abstract buildPatterns(arg: Parameters): ShapePatterns
}
