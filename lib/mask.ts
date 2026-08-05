/**
 * Data masking utilities for user-facing strings.
 * Use these whenever displaying identifiers back to the user
 * to avoid leaking full email addresses or phone numbers in the UI.
 */

/**
 * Masks an email address.
 * Example: 'sohan@gmail.com' → 'so***@gmail.com'
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}

/**
 * Masks a phone number.
 * Example: '+94771234567' → '+94 77*** **67'
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return phone
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)}*** **${digits.slice(-2)}`
}
