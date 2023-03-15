import { expect } from 'chai'
import $rdf from 'rdf-ext'
import { sparql } from '@tpluscode/sparql-builder'
import { ex } from '../../namespace'
import { HasValueConstraintComponent } from '../../../model/constraint/hasValue'
import { variable } from '../../variable'

describe('model/constraint/hasValue', () => {
  it('returns empty patterns when used in the root shape', () => {
    // given
    const constraint = new HasValueConstraintComponent([ex.foo, ex.bar])

    // when
    const whereClause = constraint.buildPatterns({
      focusNode: $rdf.namedNode('foo'),
      valueNode: variable(),
      variable,
    })

    // then
    expect(whereClause).to.eq('')
  })

  it('generates equality filter for single term', () => {
    // given
    const constraint = new HasValueConstraintComponent([ex.foo])

    // when
    const whereClause = constraint.buildPatterns({
      focusNode: $rdf.namedNode('foo'),
      valueNode: variable(),
      variable,
      propertyPath: sparql`path`,
    })

    // then
    expect(whereClause).to.equalPatterns(sparql`
      FILTER ( ?x = ${ex.foo} )
    `)
  })

  it('generates EXISTS filter for multiple terms', () => {
    // given
    const constraint = new HasValueConstraintComponent([ex.bar, ex.baz])

    // when
    const whereClause = constraint.buildPatterns({
      focusNode: $rdf.namedNode('foo'),
      valueNode: variable(),
      variable,
      propertyPath: sparql`path`,
    })

    // then
    expect(whereClause).to.equalPatterns(sparql`
      FILTER EXISTS { <foo> path ${ex.bar}, ${ex.baz} }
    `)
  })
})
