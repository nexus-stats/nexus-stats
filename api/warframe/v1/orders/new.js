const Endpoint = cubic.nodes.warframe.core.Endpoint
const Orders = require('./index.js')
const _ = require('lodash')

/**
 * Contains multi-purpose functions for child-methods and provides default values
 */
class Request extends Endpoint {
  constructor (api, db, url) {
    super(api, db, url)
    this.schema.method = 'POST'
    // this.schema.scope = 'write_requests_warframe' // DEBUG uncomment this if you see this.
    this.schema.request = {
      body: {
        user: '[DE]Glen',
        offer: 'Buying',
        item: 'Ammo Drum',
        component: 'Set',
        price: 900,
        rank: 0,
        count: 1,
        message: 'Hello, I\'m Glen and I\'d like to buy Ammo Drum for 900p. I won\'t ban you, promise.',
        source: 'Trade Chat',
        createdAt: new Date()
      }
    }
    this.schema.response = 'ok'
    this.schema.pubsub = {
      url: '/warframe/v1/orders',
      body: this.schema.request
    }
  }

  /**
   * Main method which is called by MethoHandler on request
   */
  async main (req, res) {
    const request = req.body

    // Process offer
    request.createdAt = new Date()
    this.publish(_.cloneDeep(request), '/warframe/v1/orders')
    this.db.collection('orders').insertOne(request)
    res.send('ok')

    // Update offer list
    const item = request.item
    const orders = new Orders(this.api, this.db, `/warframe/v1/orders?item=${item}`)
    const { result, discard } = await orders.filter(item)
    orders.publish(result)
    orders.cache(result, 1000 * 60 * 5)
    orders.discard(discard)
  }
}

module.exports = Request