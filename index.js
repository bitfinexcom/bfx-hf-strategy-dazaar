'use strict'

const debug = require('debug')('bfx:hf:strategy-dazaar')

const {
  onSeedCandle, onCandle, onTrade
} = require('bfx-hf-strategy')

const { Candle, Trade } = require('bfx-api-node-models')

const _isTrade = (k, v) => {
  if (!Array.isArray(v)) {
    throw new Error('ERR_WRONG_INPUT')
  }

  return v.length === 4 || v.length === 5
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

  const exec = getExec(market, state, isTrade, args)

  if (typeof seedCandleCount === 'number' && seedCandleCount !== 0) {
    state = await seedState(state, db, exec, args)
  }

  const { stream } = getStream(db, args)

  return { exec, state, stream }
}

function getStream (db, args) {
  const since = db.feed.length

  const stream = db.createHistoryStream({
    gt: since,
    live: true
  })

  return { stream }
}

async function seedState (strategyState, db, exec, args, cb) {
  const { seedCandleCount } = args
  const since = db.feed.length - Math.abs(seedCandleCount)

  debug('seeding with last ~%d candles...', seedCandleCount)
  debug('starting from seq %d', since)

  const hs = db.createHistoryStream({
    gt: since,
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
