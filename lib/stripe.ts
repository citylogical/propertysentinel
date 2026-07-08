import Stripe from 'stripe'

// Lazy init behind a Proxy: constructing the client at import time crashed a
// production build when STRIPE_SECRET_KEY was missing (go-live incident).
// Importing this module is now always safe; the missing-key error surfaces on
// first actual use instead.
let client: Stripe | null = null

function getStripe(): Stripe {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-05-27.dahlia',
      typescript: true,
    })
  }
  return client
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const instance = getStripe()
    const value = instance[prop as keyof Stripe]
    return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(instance) : value
  },
})
