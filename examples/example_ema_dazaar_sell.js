// creates a free dazaar feed with trading signals,
// run this script and when its ready, run  `example_ema_dazaar_buy.js`
// this uses local candle data to generate signals
// and emulates the bitfinex terminal data as input
// the output is a dazaar hypercore feed

'use strict'

process.env.DEBUG = process.env.DEBUG || 'bfx:*'

const { SYMBOLS, TIME_FRAMES } = require('bfx-hf-util')

const EMAStrategy = require('bfx-hf-strategy/examples/ema_cross')

const execDazaar = require('../')
const util = require('../util')

const path = require('path')
const fs = require('fs')

const async = require('async')
const hypercore = require('hypercore')
const replicate = require('@hyperswarm/replicator')

// bfx terminal data arrives in a hyperbee
const Hyperbee = require('hyperbee')
const keyEncoding = require('bitfinex-terminal-key-encoding')

const dazaar = require('dazaar')
const Payment = require('@dazaar/payment')
const swarm = require('dazaar/swarm')

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
let sellFeed
let i = 0
let card

async.auto({
  setupCores: (next) => {
    // setup data source, we use a non-dazaar source
    feed = hypercore(path.join(__dirname, 'dbs', 'BTCUSD'), hopts)
    db = new Hyperbee(feed, hbOpts)

    replicate(feed, { announce: true, live: true, lookup: false })

    sellFeed = hypercore(path.join(__dirname, 'dbs', 'free-dazaar/data-for-free'), {
      overwrite: true,
      valueEncoding: 'json'
    })

    db.feed.ready(() => {
      sellFeed.ready(next)
    })
  },

  prepareSellFeed: ['setupCores', (res, next) => {
    let payment

    const market = dazaar(path.join(__dirname, 'dbs', 'free-dazaar'))

    const seller = market.sell(sellFeed, {
      validate (remoteKey, done) {
        payment.validate(remoteKey, function (err, info) {
          console.log('Validated', remoteKey.toString('hex'), err, info)
          done(err, info)
        })
      }
    })

    seller.ready(() => {
      card = {
        id: seller.key.toString('hex'),
        payment: []
      }

      payment = new Payment(seller, card.payment)

      console.log('sell feed ready, stand by...')
      swarm(seller, () => {
        console.log('online')

        next(null, { card, payment })
      })
    })
  }],

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

  prepareStrategy: ['prepareCandles', 'setupCores', 'prepareSellFeed', async () => {
    const strategy = EMAStrategy(market)
    const submitOrder = util.getSubmitOrderToFeed(sellFeed)

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

  fs.writeFileSync(
    path.join(__dirname, 'dazaar-ema-feed.json'),
    JSON.stringify(card, null, 2)
  )

  console.log(`dazaar card stored in ${__dirname}/dazaar-ema-feed.json`)
  console.log('keep this program running, then you can run:')
  console.log('node examples/example_ema_dazaar_buy.js to use the dazaar card')
})
