'use client'

import { useEffect, useState, type ReactNode } from 'react'

type AlertSettings = {
  subscriber_id: string
  email_digest_enabled: boolean
  email_digest_send_when_empty: boolean
  sms_realtime_enabled: boolean
  trigger_complaints: boolean
  trigger_violations: boolean
  trigger_permits: boolean
  trigger_stop_work: boolean
}

type Recipient = {
  id: string
  channel: 'email' | 'sms'
  address: string
  position: number
  verified: boolean
}

export default function SettingsContent() {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AlertSettings | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [primaryEmail, setPrimaryEmail] = useState<string>('')
  const [editingPosition, setEditingPosition] = useState<{ channel: 'email' | 'sms'; position: number } | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    try {
      const res = await fetch('/api/dashboard/alert-settings')
      const data = (await res.json()) as {
        settings: AlertSettings
        recipients: Recipient[]
        primary_email: string | null
      }
      setSettings(data.settings)
      setRecipients(data.recipients)
      setPrimaryEmail(data.primary_email ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const toggleSetting = async (key: keyof AlertSettings, value: boolean) => {
    if (!settings) return
    setSaving(true)
    setError(null)
    // optimistic
    setSettings({ ...settings, [key]: value } as AlertSettings)
    try {
      const res = await fetch('/api/dashboard/alert-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'Save failed')
      }
    } catch (err) {
      // rollback
      setSettings({ ...settings, [key]: !value } as AlertSettings)
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const saveRecipient = async (channel: 'email' | 'sms', position: number) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/alert-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, position, address: editingValue }),
      })
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'Save failed')
      }
      setEditingPosition(null)
      setEditingValue('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const removeRecipient = async (id: string) => {
    if (!confirm('Remove this recipient?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/alert-recipients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'Delete failed')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>
  if (!settings) return <div>Failed to load settings.</div>

  const emailRecipients = recipients.filter((r) => r.channel === 'email')
  const smsRecipients = recipients.filter((r) => r.channel === 'sms')

  return (
    <div>
      {error && (
        <div
          style={{
            background: '#fce4e4',
            color: '#b8302a',
            padding: '10px 14px',
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Email Alerts */}
      <Card title="Email alerts">
        <ToggleRow
          label="Daily digest email"
          description="Sent at 6:00 AM CT each morning summarizing yesterday's activity"
          checked={settings.email_digest_enabled}
          onChange={(v) => toggleSetting('email_digest_enabled', v)}
          disabled={saving}
        />
        <ToggleRow
          label="Send digest even when no activity"
          description="Get a daily 'all clear' email confirming the system is monitoring"
          checked={settings.email_digest_send_when_empty}
          onChange={(v) => toggleSetting('email_digest_send_when_empty', v)}
          disabled={saving || !settings.email_digest_enabled}
        />
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#666',
              marginBottom: 8,
            }}
          >
            Recipients (up to 3)
          </div>
          {[1, 2, 3].map((pos) => {
            const existing = emailRecipients.find((r) => r.position === pos)
            const isEditing = editingPosition?.channel === 'email' && editingPosition?.position === pos
            return (
              <RecipientRow
                key={`email-${pos}`}
                channel="email"
                position={pos}
                existing={existing}
                isEditing={isEditing}
                editingValue={editingValue}
                onStartEdit={() => {
                  setEditingPosition({ channel: 'email', position: pos })
                  setEditingValue(existing?.address ?? (pos === 1 ? primaryEmail : ''))
                }}
                onCancelEdit={() => {
                  setEditingPosition(null)
                  setEditingValue('')
                }}
                onChangeValue={setEditingValue}
                onSave={() => void saveRecipient('email', pos)}
                onRemove={existing ? () => void removeRecipient(existing.id) : undefined}
                disabled={saving}
              />
            )
          })}
        </div>
      </Card>

      {/* SMS Alerts */}
      <Card title="SMS alerts">
        <div style={{ background: '#eaf0f7', border: '1px solid #c6d4e3', padding: '10px 12px', borderRadius: 4, marginBottom: 14, fontSize: 12, color: '#3a5577' }}>
          We&apos;re finalizing carrier verification with our SMS provider. Add your phone number now — real-time alerts will start firing as soon as we&apos;re cleared (typically within a few business days).
        </div>
        <ToggleRow
          label="Real-time SMS alerts"
          description="Texts sent immediately when new building events affect your portfolio"
          checked={settings.sms_realtime_enabled}
          onChange={(v) => toggleSetting('sms_realtime_enabled', v)}
          disabled
        />
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#666',
              marginBottom: 8,
            }}
          >
            Phone numbers (up to 3)
          </div>
          {[1, 2, 3].map((pos) => {
            const existing = smsRecipients.find((r) => r.position === pos)
            const isEditing = editingPosition?.channel === 'sms' && editingPosition?.position === pos
            return (
              <RecipientRow
                key={`sms-${pos}`}
                channel="sms"
                position={pos}
                existing={existing}
                isEditing={isEditing}
                editingValue={editingValue}
                onStartEdit={() => {
                  setEditingPosition({ channel: 'sms', position: pos })
                  setEditingValue(existing?.address ?? '')
                }}
                onCancelEdit={() => {
                  setEditingPosition(null)
                  setEditingValue('')
                }}
                onChangeValue={setEditingValue}
                onSave={() => void saveRecipient('sms', pos)}
                onRemove={existing ? () => void removeRecipient(existing.id) : undefined}
              />
            )
          })}
        </div>
      </Card>

      {/* Triggers */}
      <Card title="What triggers an alert">
        <ToggleRow
          label="New 311 building complaints"
          description="Sanitation, plumbing, vacant building, heat, etc."
          checked={settings.trigger_complaints}
          onChange={(v) => toggleSetting('trigger_complaints', v)}
          disabled={saving}
        />
        <ToggleRow
          label="New building violations"
          description="Department of Buildings violations issued against your properties"
          checked={settings.trigger_violations}
          onChange={(v) => toggleSetting('trigger_violations', v)}
          disabled={saving}
        />
        <ToggleRow
          label="New permits"
          description="Permits issued for work at your properties"
          checked={settings.trigger_permits}
          onChange={(v) => toggleSetting('trigger_permits', v)}
          disabled={saving}
        />
        <ToggleRow
          label="Stop-work orders"
          description="Always escalated — recommended ON"
          checked={settings.trigger_stop_work}
          onChange={(v) => toggleSetting('trigger_stop_work', v)}
          disabled={saving}
        />
      </Card>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #ece8dd',
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          background: '#243f5e',
          color: '#fff',
          padding: '14px 22px',
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '8px 0',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#1a1a1a', fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{description}</div>}
      </div>
      <label
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 40,
          height: 22,
          flexShrink: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: checked ? '#1e3a5f' : '#ccc',
            borderRadius: 22,
            transition: 'background 200ms',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 20 : 2,
              width: 18,
              height: 18,
              background: '#fff',
              borderRadius: '50%',
              transition: 'left 200ms',
            }}
          />
        </span>
      </label>
    </div>
  )
}

function RecipientRow({
  channel,
  position,
  existing,
  isEditing,
  editingValue,
  onStartEdit,
  onCancelEdit,
  onChangeValue,
  onSave,
  onRemove,
  disabled,
}: {
  channel: 'email' | 'sms'
  position: number
  existing: Recipient | undefined
  isEditing: boolean
  editingValue: string
  onStartEdit: () => void
  onCancelEdit: () => void
  onChangeValue: (v: string) => void
  onSave: () => void
  onRemove?: () => void
  disabled?: boolean
}) {
  if (isEditing) {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input
          type={channel === 'email' ? 'email' : 'tel'}
          value={editingValue}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder={channel === 'email' ? 'name@example.com' : '+1 312 555 0100'}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #1e3a5f',
            borderRadius: 4,
            outline: 'none',
            fontFamily: 'inherit',
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={onSave}
          style={{
            background: '#1e3a5f',
            color: '#fff',
            border: 'none',
            padding: '0 14px',
            borderRadius: 4,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          style={{
            background: '#fff',
            color: '#666',
            border: '1px solid #d9d3c2',
            padding: '0 14px',
            borderRadius: 4,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#faf8f3',
        borderRadius: 4,
        marginBottom: 6,
        fontSize: 13,
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888', minWidth: 12 }}>{position}.</span>
      <span
        style={{
          flex: 1,
          color: existing ? '#1a1a1a' : '#aaa',
          fontFamily: existing ? 'monospace' : 'inherit',
          fontSize: existing ? 12 : 13,
        }}
      >
        {existing ? existing.address : 'Empty'}
      </span>
      {!disabled && (
        <>
          <button
            type="button"
            onClick={onStartEdit}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#1e3a5f',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0,
            }}
          >
            {existing ? 'Edit' : '+ Add'}
          </button>
          {existing && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 12,
                padding: 0,
              }}
            >
              Remove
            </button>
          )}
        </>
      )}
    </div>
  )
}
