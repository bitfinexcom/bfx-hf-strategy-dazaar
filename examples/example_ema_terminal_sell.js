// creates a free dazaar feed with trading signals,
// run this script and when its ready, run  `example_ema_dazaar_buy.js`
// this uses local candle data to generate signals
// it uses bitfinex terminal data as input
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

// bfx terminal data arrives in a hyperbee
const Hyperbee = require('hyperbee')
const keyEncoding = require('bitfinex-terminal-key-encoding')
const terms = require('bitfinex-terminal-terms-of-use')

const dazaar = require('dazaar')
const ram = require('random-access-memory')
const Payment = require('@dazaar/payment')
const swarm = require('dazaar/swarm')

const hbOpts = {
  valueEncoding: 'json',
  keyEncoding
}

const market = {
  symbol: SYMBOLS.BTC_USD,
  tf: TIME_FRAMES.ONE_MINUTE
}

let db
let sellFeed
let card
async.auto({
  setupCores: (next) => {
    sellFeed = hypercore(path.join(__dirname, 'dbs', 'free-dazaar/data-for-free'), {
      overwrite: true,
      valueEncoding: 'json'
    })

    const card = require('./bitfinex.terminal.btcusd.candles.json')
    const dmarket = dazaar(() => ram())
    const buyer = dmarket.buy(card, { sparse: true, terms })

    buyer.on('feed', async function () {
      db = new Hyperbee(buyer.feed, hbOpts)
      db.feed.ready(() => {
        sellFeed.ready(next)
      })
    })

    swarm(buyer)
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

  prepareStrategy: ['setupCores', 'prepareSellFeed', async () => {
    const strategy = EMAStrategy(market)
    const submitOrder = util.getSubmitOrderToFeed(sellFeed)

    const { exec, stream } = await execDazaar(strategy, market, db, {
      submitOrder,
      simulateFill: true,
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
        await exec(key, value)
      }
    })()

    next()
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
