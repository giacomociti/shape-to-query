import { Term } from 'rdf-js'
import { GraphPointer, MultiPointer } from 'clownface'
import { sh } from '@tpluscode/rdf-ns-builders'
import $rdf from 'rdf-ext'
import { ConstraintComponent } from './ConstraintComponent.js'
import { AndConstraintComponent } from './and.js'
import { OrConstraintComponent } from './or.js'
import { NodeConstraintComponent } from './node.js'
import { InConstraintComponent } from './in.js'
import { HasValueConstraintComponent } from './hasValue.js'
import { PropertyConstraintComponent } from './property.js'

interface ConstraintComponentFromPointer {
  fromPointer(parameter: GraphPointer): ConstraintComponent
}

interface ConstraintComponentFromPointers {
  fromPointers(parameter: MultiPointer): ConstraintComponent
}

interface ConstraintComponentFromList {
  fromList(parameter: GraphPointer[]): ConstraintComponent
}

type ConstraintComponentStatic = ConstraintComponentFromPointer | ConstraintComponentFromPointers | ConstraintComponentFromList

export const constraintComponents = $rdf.termMap<Term, ConstraintComponentStatic>([
  [sh.AndConstraintComponent, AndConstraintComponent],
  [sh.HasValueConstraintComponent, HasValueConstraintComponent],
  [sh.InConstraintComponent, InConstraintComponent],
  [sh.OrConstraintComponent, OrConstraintComponent],
  [sh.NodeConstraintComponent, NodeConstraintComponent],
  [sh.PropertyConstraintComponent, PropertyConstraintComponent],
])