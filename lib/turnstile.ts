/**
 * Cloudflare Turnstile server-side verification helper.
 * ✅ CURRENT: Turnstile active — verifies tokens server-side before processing forms.
 * 🚀 BEFORE LAUNCH: Replace test keys with real Cloudflare Turnstile keys.
 *    Steps: dash.cloudflare.com → Turnstile → Add site → smartclaz.com
 *    Test site key (always passes):   1x00000000000000000000AA
 *    Test secret key (always passes): 1x0000000000000000000000000000000AA
 * 📝 NOTE: Required env vars:
 *    NEXT_PUBLIC_TURNSTILE_SITE_KEY=  (client — used in <Turnstile> widget)
 *    TURNSTILE_SECRET_KEY=            (server only — used here)
 *
 * IMPORTANT: This module is SERVER ONLY.
 *   Never call verifyTurnstile() from client components.
 *   TURNSTILE_SECRET_KEY must never reach the browser.
 *   Use via API routes (e.g. app/api/auth/verify-turnstile/route.ts).
 */

// ── verifyTurnstile ────────────────────────────────────────────────────────────

/**
 * Verify a Cloudflare Turnstile token with the challenge endpoint.
 *
 * @param token - The token returned by the client-side Turnstile widget
 * @returns true if the token is valid, false otherwise
 *
 * Fails closed: any error (network, missing key, bad response) returns false.
 * This ensures a broken Turnstile config does not silently allow spam through.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  // 📝 NOTE: TURNSTILE_SECRET_KEY missing means Turnstile is not configured.
  //    In this case we fail closed — no token = no pass.
  if (!secretKey) {
    if (process.env.NODE_ENV === 'development') {
      // ✅ CURRENT: In dev without a key, log a warning but allow through so devs
      // can work without needing Cloudflare credentials.
      // 🚀 BEFORE LAUNCH: Remove this dev bypass — ensure key is always set.
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — bypassing in development')
      return true
    }
    return false
  }

  if (!token) {
    return false
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:   secretKey,
          response: token,
        }),
      },
    )

    if (!response.ok) {
      return false
    }

    const data = (await response.json()) as { success: boolean }
    return data.success === true
  } catch {
    // ✅ CURRENT: Network errors → fail closed (return false).
    // This means a Cloudflare outage blocks form submissions. Acceptable tradeoff for security.
    return false
  }
}
