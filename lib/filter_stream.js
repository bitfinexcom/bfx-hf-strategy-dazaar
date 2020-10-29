'use strict'

const { Transform } = require('stream')

class FilterCandles extends Transform {
  constructor (options) {
    super({
      decodeStrings: false,
      objectMode: true
    })

    if (!options || !options.key) {
      throw new Error('ERR_MISS_KEY')
    }

    this.key = options.key
  }

  _transform (data, enc, cb) {
    // pass through for trades
    if (data.key.candle === null) {
      this.push(data)
      return cb()
    }

    if (this.key !== data.key.candle) {
      return cb()
    }

    this.push(data)
    cb()
  }
}

module.exports = FilterCandles
