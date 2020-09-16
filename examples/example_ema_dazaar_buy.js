// consumes a free dazaar feed with trading signals,
// e.g. from `example_ema_dazaar_sell.js`

'use strict'

process.env.DEBUG = process.env.DEBUG || 'bfx:*'

const path = require('path')

const fs = require('fs')
const async = require('async')

const dazaar = require('dazaar')
const swarm = require('dazaar/swarm')

let card
try {
  card = fs.readFileSync(
    path.join(__dirname, 'dazaar-ema-feed.json'),
    'utf-8'
  )
} catch (e) {
  console.error('could not read dazaar card')
  console.error('try to run example_ema_dazaar_sell.js before')

  process.exit(1)
}

let buyer

async.auto({
  setupCores: (next) => {
    const market = dazaar(path.join(__dirname, 'dbs', 'free-dazaar-buy'))

    const id = Buffer.from(JSON.parse(card).id, 'hex')

    buyer = market.buy(id, { sparse: true })

    buyer.on('validate', function () {
      console.log('remote validated us')
    })

    buyer.on('feed', function () {
      console.log('got feed')

      next()
    })

    buyer.ready(() => {
      console.log('starting replication from seller')

      swarm(buyer)
    })
  },

  requestData: ['setupCores', (res, next) => {
    buyer.feed.get(0, (_err, el) => {
      console.log('first element:', el.toString())
    })
  }]
}, (err) => {
  if (err) throw err
})
