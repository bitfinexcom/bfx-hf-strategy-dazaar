'use strict'

const debug = require('debug')('bfx:hf:strategy-dazaar:util')

const { nonce } = require('bfx-api-node-util')
const { promisify } = require('util')

/**
 * Takes a dazaar feed for submitting orders to it
 * Returns a submitOrder function to use for Honey Framework Strategies
 *
 * @param {Object} feed
 */
exports.getSubmitOrderToFeed = getSubmitOrderToFeed
function getSubmitOrderToFeed (feed) {
  const append = promisify(feed.append).bind(feed)

  return async function so (strategyState = {}, order = {}) {
    const { amount, price, type } = order

    if (!order.meta) {
      order.meta = {}
    }

    order.meta._HF = 1
    debug('submitting order %f @ %f [%s]', amount, price, type)

    const k = Date.now() + '!' + nonce()
    const data = [k, order]
    const res = await append([data])

    return res
  }
}
