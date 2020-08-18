// takes generated trading signals and submits orders
// to the bitfinex websocket api
// this uses local candle data to generate signals
// and emulates the bitfinex terminal data as input

'use strict'

process.env.DEBUG = process.env.DEBUG || 'bfx:*'

const { SYMBOLS, TIME_FRAMES } = require('bfx-hf-util')

const EMAStrategy = require('bfx-hf-strategy/examples/ema_cross')

const execDazaar = require('../')

const path = require('path')

const async = require('async')
const hypercore = require('hypercore')
const replicate = require('@hyperswarm/replicator')

// bfx terminal data arrives in a hyperbee
const Hyperbee = require('hyperbee')
const keyEncoding = require('bitfinex-terminal-key-encoding')

const { WSv2 } = require('bitfinex-api-node')
const { Order } = require('bfx-api-node-models')

const apiKey = 'SECRET'
const apiSecret = 'SECRET'

const ws = new WSv2({
  apiKey,
  apiSecret
})

const hopts = {
  overwrite: true
}

const hbOpts = {
  valueEncoding: 'json',
  keyEncoding
}

let rawCandleData = require('./btc_candle_data.json')

rawCandleData = rawCandleData.sort((a, b) => {
  return a[0] - b[0]
})

const market = {
  symbol: SYMBOLS.BTC_USD,
  tf: TIME_FRAMES.ONE_HOUR
}

let feed
let db
let i = 0

async.auto({
  setupCores: (next) => {
    // setup data source, we use a non-dazaar source
    feed = hypercore(path.join(__dirname, 'dbs', 'BTCUSD'), hopts)
    db = new Hyperbee(feed, hbOpts)

    replicate(feed, { announce: true, live: true, lookup: false })

    db.feed.ready(next)
  },

  prepareWebsocket: async (next) => {
    await ws.open()
    await ws.auth()
  },

  prepareCandles: ['setupCores', async (res) => {
    // feed example data into the data source / server
    const batch = db.batch()
    for (let i = 0; i < 10; i++) {
      const data = rawCandleData[i]
      const mts = data[0]

      const k = { candle: '1m', timestamp: mts }
      await batch.put(k, data)
    }

    await batch.flush()
  }],

  prepareStrategy: ['prepareCandles', 'setupCores', 'prepareWebsocket', async () => {
    const strategy = EMAStrategy(market)

    async function submitOrder (strategyState = {}, order = {}) {
      const _o = {
        cid: Date.now(),
        ...order
      }

      console.log('submitting order', _o)

      const o = new Order(_o, ws)
      o.registerListeners()

      o.on('update', () => {
        console.log(`order updated: ${o.serialize()}`)
      })

      const res = await o.submit()
      return res
    }

    const { exec, stream } = await execDazaar(strategy, market, db, {
      submitOrder,

      includeTrades: false,
      seedCandleCount: 10
    })

    return { exec, stream }
  }],

  runStrategy: ['prepareStrategy', ({ prepareStrategy }, next) => {
    const { exec, stream } = prepareStrategy

    ;(async () => {
      for await (const data of stream) {
        const { key, value } = data
        i++
        await exec(key, value)

        if (i === 990) {
          next()
          break
        }
      }
    })()

    // new "live" data arrives
    ;(async () => {
      const batch = db.batch()
      for (let i = 10; i < rawCandleData.length; i++) {
        const data = rawCandleData[i]
        const mts = data[0]

        const k = { candle: '1m', timestamp: mts }
        await batch.put(k, data)
      }

      await batch.flush()
    })()
  }]
}, (err) => {
  if (err) throw err
})
