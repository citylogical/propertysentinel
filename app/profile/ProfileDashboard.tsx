'use client'

import { useCallback, useState } from 'react'

export type SubscriberRow = {
  first_name: string | null
  last_name: string | null
  phone: string | null
  zip: string | null
  plan: string | null
  created_at: string | null
}

export type MonitoredPropertyRow = {
  id: string
  address: string
  zip: string | null
  status: string | null
}

type Props = {
  email: string
  initialSubscriber: SubscriberRow | null
  initialProperties: MonitoredPropertyRow[]
}

function formatMemberSince(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProfileDashboard({ email, initialSubscriber, initialProperties }: Props) {
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const showToast = useCallback((type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  const [firstName, setFirstName] = useState(initialSubscriber?.first_name ?? '')
  const [lastName, setLastName] = useState(initialSubscriber?.last_name ?? '')
  const [phone, setPhone] = useState(initialSubscriber?.phone ?? '')
  const [zip, setZip] = useState(initialSubscriber?.zip ?? '')
  const [savedSnapshot, setSavedSnapshot] = useState({
    firstName: initialSubscriber?.first_name ?? '',
    lastName: initialSubscriber?.last_name ?? '',
    phone: initialSubscriber?.phone ?? '',
    zip: initialSubscriber?.zip ?? '',
  })

  const [pwd, setPwd] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')

  const [properties, setProperties] = useState<MonitoredPropertyRow[]>(initialProperties)
  const [newAddress, setNewAddress] = useState('')
  const [newZip, setNewZip] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [addingAddr, setAddingAddr] = useState(false)

  const plan = (initialSubscriber?.plan ?? 'free').toLowerCase()
  const memberSince = formatMemberSince(initialSubscriber?.created_at ?? null)

  const resetAccountForm = () => {
    setFirstName(savedSnapshot.firstName)
    setLastName(savedSnapshot.lastName)
    setPhone(savedSnapshot.phone)
    setZip(savedSnapshot.zip)
  }

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAccount(true)
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone,
          zip,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error ?? 'Save failed')
        return
      }
      setSavedSnapshot({ firstName, lastName, phone, zip })
      showToast('ok', 'Changes saved')
    } catch {
      showToast('error', 'Save failed')
    } finally {
      setSavingAccount(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd !== pwdConfirm) {
      showToast('error', 'Passwords do not match')
      return
    }
    if (pwd.length < 8) {
      showToast('error', 'Password must be at least 8 characters')
      return
    }
    setSavingPwd(true)
    try {
      const res = await fetch('/api/profile/update-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error ?? 'Update failed')
        return
      }
      setPwd('')
      setPwdConfirm('')
      showToast('ok', 'Password updated')
    } catch {
      showToast('error', 'Update failed')
    } finally {
      setSavingPwd(false)
    }
  }

  const addAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    const addr = newAddress.trim()
    if (!addr) return
    setAddingAddr(true)
    try {
      const res = await fetch('/api/profile/add-address', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addr, zip: newZip.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error ?? 'Could not add address')
        return
      }
      if (data.row) {
        setProperties((p) => [
          ...p,
          {
            id: String(data.row.id),
            address: data.row.address,
            zip: data.row.zip ?? null,
            status: data.row.status ?? 'active',
          },
        ])
      }
      setNewAddress('')
      setNewZip('')
      showToast('ok', 'Address added')
    } catch {
      showToast('error', 'Could not add address')
    } finally {
      setAddingAddr(false)
    }
  }

  const removeAddress = async (id: string) => {
    try {
      const res = await fetch('/api/profile/remove-address', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error ?? 'Could not remove')
        return
      }
      setProperties((p) => p.filter((x) => x.id !== id))
      showToast('ok', 'Address removed')
    } catch {
      showToast('error', 'Could not remove')
    }
  }

  return (
    <div className="profile-page" style={{ minHeight: '100vh' }}>
      {toast && (
        <div className={`profile-toast profile-toast--${toast.type}`} role="status">
          {toast.text}
        </div>
      )}

      <div className="profile-page__layout" style={{ maxWidth: 1200, padding: '28px 24px 64px' }}>
        <main className="profile-page__main">
          <section className="profile-card">
            <h2 className="profile-card__title">Account Information</h2>
            <form className="profile-form" onSubmit={saveAccount}>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="profile-email">
                  Email
                </label>
                <input id="profile-email" className="profile-field__input profile-field__input--readonly" readOnly value={email} />
              </div>
              <div className="profile-field-row">
                <div className="profile-field">
                  <label className="profile-field__label" htmlFor="profile-fn">
                    First name
                  </label>
                  <input
                    id="profile-fn"
                    className="profile-field__input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-field__label" htmlFor="profile-ln">
                    Last name
                  </label>
                  <input
                    id="profile-ln"
                    className="profile-field__input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="profile-field-row">
                <div className="profile-field">
                  <label className="profile-field__label" htmlFor="profile-phone">
                    Phone
                  </label>
                  <input
                    id="profile-phone"
                    className="profile-field__input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-field__label" htmlFor="profile-zip">
                    ZIP
                  </label>
                  <input
                    id="profile-zip"
                    className="profile-field__input"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    autoComplete="postal-code"
                  />
                </div>
              </div>
              <div className="profile-form__actions">
                <button type="button" className="profile-btn profile-btn--ghost" onClick={resetAccountForm}>
                  Cancel
                </button>
                <button type="submit" className="profile-btn profile-btn--primary" disabled={savingAccount}>
                  {savingAccount ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>

          <section className="profile-card">
            <h2 className="profile-card__title">Password</h2>
            <form className="profile-form" onSubmit={savePassword}>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="profile-pwd">
                  New password
                </label>
                <input
                  id="profile-pwd"
                  type="password"
                  className="profile-field__input"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="profile-pwd2">
                  Confirm password
                </label>
                <input
                  id="profile-pwd2"
                  type="password"
                  className="profile-field__input"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="profile-form__actions">
                <button type="submit" className="profile-btn profile-btn--primary" disabled={savingPwd}>
                  {savingPwd ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </form>
          </section>

          <section className="profile-card">
            <h2 className="profile-card__title">Alert addresses</h2>
            <p className="profile-card__subtext">First two properties included · $10/mo each thereafter</p>

            {properties.length === 0 ? (
              <div className="profile-empty">
                <p className="profile-empty__text">No properties yet. Add an address to get alerts.</p>
                <form className="profile-form profile-form--inline" onSubmit={addAddress}>
                  <input
                    className="profile-field__input"
                    placeholder="Street address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                  <input
                    className="profile-field__input profile-field__input--zip"
                    placeholder="ZIP"
                    value={newZip}
                    onChange={(e) => setNewZip(e.target.value)}
                  />
                  <button type="submit" className="profile-btn profile-btn--primary" disabled={addingAddr}>
                    {addingAddr ? 'Adding…' : 'Add address'}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <ul className="profile-address-list">
                  {properties.map((p) => (
                    <li key={p.id} className="profile-address-row">
                      <div className="profile-address-row__text">
                        <span className="profile-address-row__line">{p.address}</span>
                        {p.zip && <span className="profile-address-row__zip">{p.zip}</span>}
                      </div>
                      <span className={`profile-badge profile-badge--${(p.status ?? 'active').toLowerCase()}`}>
                        {p.status ?? 'active'}
                      </span>
                      <button type="button" className="profile-btn profile-btn--danger-ghost" onClick={() => removeAddress(p.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <form className="profile-form profile-form--add-row" onSubmit={addAddress}>
                  <input
                    className="profile-field__input"
                    placeholder="Add another address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                  <input
                    className="profile-field__input profile-field__input--zip"
                    placeholder="ZIP"
                    value={newZip}
                    onChange={(e) => setNewZip(e.target.value)}
                  />
                  <button type="submit" className="profile-btn profile-btn--secondary" disabled={addingAddr}>
                    Add
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="profile-card">
            <h2 className="profile-card__title">Plan &amp; Billing</h2>
            <div className="profile-billing-summary">
              <div className="profile-billing-row">
                <span className="profile-billing-label">Current plan</span>
                <span className={`profile-plan-badge profile-plan-badge--${plan === 'free' ? 'free' : 'active'}`}>
                  {plan === 'free' ? 'Free' : 'Active'}
                </span>
              </div>
              <div className="profile-billing-row">
                <span className="profile-billing-label">Properties monitored</span>
                <span className="profile-billing-value">{properties.length}</span>
              </div>
              <div className="profile-billing-row">
                <span className="profile-billing-label">Member since</span>
                <span className="profile-billing-value">{memberSince}</span>
              </div>
            </div>
            <div className="profile-upgrade-strip">
              <div>
                <p className="profile-upgrade-strip__title">Unlock more coverage</p>
                <p className="profile-upgrade-strip__sub">Subscribe for expanded monitoring and alerts.</p>
              </div>
              <a href="#" className="profile-btn profile-btn--primary profile-btn--block-sm">
                Subscribe — $15/mo
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
