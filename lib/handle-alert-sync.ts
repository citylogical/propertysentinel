export type AlertSyncResult =
  | { status: 'enterprise' }
  | { status: 'synced'; quantity: number }
  | { status: 'needs_checkout'; quantity: number }
  | { status: 'none' }
  | null
  | undefined

/**
 * Client-side handler for the alert_sync result returned by the save route
 * and the per-row/bulk alert toggles.
 *
 * - needs_checkout → redirects the browser to Stripe Checkout for the honest
 *   count of currently-flagged properties (quantity from the reconcile).
 * - everything else → no navigation; caller updates its own UI.
 *
 * Returns true if it triggered a checkout redirect (caller should stop and
 * not show a success state), false otherwise.
 */
export async function handleAlertSync(result: AlertSyncResult): Promise<boolean> {
  if (result && result.status === 'needs_checkout') {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: result.quantity,
          return_path: window.location.pathname + window.location.search,
        }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return true
      }
      window.alert(data.error || 'Could not start checkout.')
    } catch {
      window.alert('Could not start checkout.')
    }
  }
  return false
}
