import { createHmac } from 'crypto'

const COOKIE_NAME = 'admin_auth'
const SALT = 'propertysentinel-admin'

export function getAdminToken(): string {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret) throw new Error('ADMIN_PASSWORD not set')
  return createHmac('sha256', secret).update(SALT).digest('hex')
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false
  const expected = getAdminToken()
  return token.length > 0 && token === expected
}

export function getAdminCookieName(): string {
  return COOKIE_NAME
}
