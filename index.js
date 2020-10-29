'use strict'

const debug = require('debug')('bfx:hf:strategy-dazaar')

const {
  onSeedCandle, onCandle, onTrade
} = require('bfx-hf-strategy')

const { Candle, Trade } = require('bfx-api-node-models')
const { candleWidth } = require('bfx-hf-util')

const FilterCandles = require('./lib/filter_stream.js')

const _isTrade = (k, v) => {
  return k.candle === null
}

/**
 * Executes a backtest on a dazaar market data stream, logs results to the
 * console.
 *
 * @param {Object[]} strategy
 * @param {Object} market
 * @param {Object} args
 * @param {Function?} args.isTrade - optional, function to detect a trade vs. a candle
 */
const execStream = async (strategy = {}, market, db, args = {}) => {
  const isTrade = args.isTrade || _isTrade
  const {
    submitOrder,
    seedCandleCount,
    backtesting,
    simulateFill
  } = args

  let state = {
    backtesting: backtesting || false,
    simulateFill,
    submitOrder,
    trades: [],
    ...strategy
  }

  if (!market.tf) throw new Error('ERR_MISSING_TF')

  const exec = getExec(market, state, isTrade, args)

  if (typeof seedCandleCount === 'number' && seedCandleCount !== 0) {
    state = await seedState(state, db, exec, market, args)
  }

  const { stream } = getStream(db, market, args)

  return { exec, state, stream }
}

function getStream (db, market, args) {
  const { tf } = market
  const since = db.feed.length

  const hs = db.createHistoryStream({
    gt: since,
    live: true
  })

  const ts = new FilterCandles({ key: tf })
  const stream = hs.pipe(ts)

  return { stream }
}

async function seedState (strategyState, db, exec, market, args) {
  const { seedCandleCount } = args
  const { tf } = market

  const cWidth = candleWidth(tf)
  const now = Date.now()
  const since = new Date(now - (Math.abs(seedCandleCount) * cWidth))

  debug('seeding with last ~%d candles...', seedCandleCount)
  debug('seeding starting from', since)

  const hs = db.createReadStream({
    gt: { candle: tf, timestamp: since },
    lt: { candle: tf, timestamp: now },
    limit: seedCandleCount
  })

  for await (const data of hs) {
    strategyState = await exec(data.key, data.value, { isSeed: true })
  }

  debug('seeding complete')
  return strategyState
}

function getExec (market, strategyState, isTrade, args) {
  const { symbol, tf } = market
  const { includeTrades } = args

  return async function (k, el, opts = {}) {
    const isSeed = opts.isSeed || false

    if (includeTrades && isTrade(k, el)) {
      const t = new Trade(el)

      strategyState = await onTrade(strategyState, t)
      return strategyState
    }

    const c = new Candle(el)
    c.tf = tf
    c.symbol = symbol

    if (isSeed) {
      strategyState = await onSeedCandle(strategyState, c)
    } else {
      strategyState = await onCandle(strategyState, c)
    }

    return strategyState
  }
}

module.exports = execStream
