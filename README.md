# Bitfinex Honey Framework Dazaar Module

[![Build Status](https://travis-ci.org/bitfinexcom/bfx-hf-strategy-exec.svg?branch=master)](https://travis-ci.org/bitfinexcom/bfx-hf-strategy-exec)

This module can execute strategies built with `bfx-hf-strategy` on a live data stream from dazaar hypercores and dazaar market data.

### Features

* Execute trading strategies on the live Bitfinex markets using Bitfinex Terminal Streams
* Easy selling of trading signals on Dazaar

### Installation

```bash
npm i --save bfx-hf-strategy-dazaar
```

### Quickstart & Example

Full examples are in the  [`examples/`](/examples) folder.


#### Selling Trading Signals on Dazaar

Full example in [./examples/example_ema_dazaar_sell.js](./examples/example_ema_dazaar_sell.js)

```js
const execDazaar = require('bfx-hf-strategy-dazaar')
const util = require('bfx-hf-strategy-dazaar/util')

const EMAStrategy = require('bfx-hf-strategy/examples/ema_cross')
const { SYMBOLS, TIME_FRAMES } = require('bfx-hf-util')

const market = {
  symbol: SYMBOLS.BTC_USD,
  tf: TIME_FRAMES.ONE_HOUR
}

const strategy = EMAStrategy(market)
const submitOrder = util.getSubmitOrderToFeed(sellFeed)

const { exec, stream } = await execDazaar(strategy, market, db, {
  submitOrder,
  includeTrades: false,
  seedCandleCount: 10
})

let btState
for await (const data of stream) {
  const { key, value } = data
  btState = await exec(key, value)
}
```

#### Trade with Custom Order Submit Functions

You can use any custom function to handle trading signals, as long as it returns a promise.

Full example in [./examples/example_ema_websocket.js](./examples/example_ema_websocket.js)

```js
async function submitOrder (strategyState = {}, order = {}) {
  const { amount, price, type } = order

  // BFX WS API
  // https://github.com/bitfinexcom/bitfinex-api-node

  const o = new Order({
    cid: Date.now(),
    symbol: 'tETHUSD',
    amount,
    type,
    price
  }, ws)

  await o.submit()
})

const { exec, stream } = await execDazaar(strategy, market, db, {
  submitOrder,
  includeTrades: false,
  seedCandleCount: 10
})
```



### Docs

For executable examples refer to the [`examples/`](/examples) folder. JSDoc generated API documentation can be found [within `docs/api.md`](/docs/api.md).

### Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request
