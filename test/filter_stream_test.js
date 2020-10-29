/* eslint-env mocha */
'use strict'

const { PassThrough } = require('stream')

const assert = require('assert')

const FilterCandles = require('../lib/filter_stream')

describe('filter streams', () => {
  it('does not filter out trades', () => {
    const res = []

    const pt = new PassThrough({
      decodeStrings: false,
      objectMode: true
    })
    const fc = new FilterCandles({ key: '15m' })

    fc.on('data', (data) => {
      res.push(data)
    })

    pt.pipe(fc)

    pt.push({
      seq: 1805425,
      key: { candle: '1m', timestamp: new Date() },
      value: [1603983840000, 2.6458, 2.6475, 2.6475, 2.6458, 1500]
    })

    pt.push({
      seq: 1337,
      key: { candle: '15m', timestamp: new Date() },
      value: [1603983840000, 2.6458, 2.6475, 2.6475, 2.6458, 1500]
    })

    pt.push({
      seq: 1338,
      key: { candle: null, timestamp: new Date(), id: '515558424' },
      value: [515558424, 1603964462618, 0.00914259, 13168]
    })

    const ids = res.map((el) => {
      return el.seq
    })

    assert.deepStrictEqual(ids, [1337, 1338])
  })
})
