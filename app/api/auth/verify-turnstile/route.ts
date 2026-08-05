/**
 * Cloudflare Turnstile server-side verification.
 *
 * TODO: Get real Cloudflare Turnstile keys from
 * dash.cloudflare.com → Turnstile → Add site
 * Replace test keys in .env.local before launch.
 *
 * Test keys (always pass — safe for dev/staging):
 *   Site key:   1x00000000000000000000AA
 *   Secret key: 1x0000000000000000000000000000000AA
 */

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return Response.json({ success: false, error: 'Missing token' }, { status: 400 })
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    })

    const data = await res.json()
    return Response.json({ success: data.success })
  } catch {
    return Response.json({ success: false, error: 'Verification error' }, { status: 500 })
  }
}
