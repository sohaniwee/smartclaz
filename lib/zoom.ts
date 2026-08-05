// ✅ CURRENT: Falls back to test data if Zoom credentials not configured.
//    Test meetings use URLs like https://zoom.us/j/test{id}
// 🚀 BEFORE LAUNCH:
//    1. Go to marketplace.zoom.us → Build App → Server-to-Server OAuth
//    2. Add scopes: meeting:write:admin, meeting:read:admin
//    3. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env.local
//       (Note: ZOOM_API_KEY / ZOOM_API_SECRET are legacy JWT — use OAuth instead)
// 📝 NOTE: Zoom OAuth token is cached for 55 minutes (tokens expire in 60 min)
// 🧪 TEST: Call createZoomMeeting('Test', new Date(), 60) — returns test URLs when creds missing

// ── Batch passcode helper ─────────────────────────────────────────────────────
// Generate a consistent 6-digit passcode from batch name.
// Changes each week when the meeting is recreated.
// 📝 NOTE: Even if student shares the link, waiting room blocks unknown attendees.
//    Passcode adds a second layer of protection.
function generateBatchPasscode(batchName: string): string {
  const hash = batchName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return String((hash % 900000) + 100000)
}

// ── Token cache ───────────────────────────────────────────────────────────────
// 📝 NOTE: Module-level variables survive across requests in a single serverless instance.
//    They are NOT shared between cold starts — token will be re-fetched on restart.
let _cachedToken: string | null = null
let _tokenExpiresAt = 0  // Unix ms

async function getZoomToken(): Promise<string> {
  const now = Date.now()

  // Return cached token if still valid (55-min window, tokens expire at 60)
  if (_cachedToken && now < _tokenExpiresAt) {
    return _cachedToken
  }

  const accountId    = process.env.ZOOM_ACCOUNT_ID
  const clientId     = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom token fetch failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  _cachedToken      = data.access_token
  _tokenExpiresAt   = now + (55 * 60 * 1000)  // cache for 55 minutes

  return _cachedToken
}

// ── Test mode detection ───────────────────────────────────────────────────────
function isTestMode(): boolean {
  return (
    !process.env.ZOOM_ACCOUNT_ID ||
    !process.env.ZOOM_CLIENT_ID  ||
    !process.env.ZOOM_CLIENT_SECRET
  )
}

// ── Zoom Meeting result type ───────────────────────────────────────────────────
export interface ZoomMeeting {
  meetingId: string
  joinUrl:   string
  startUrl:  string
  password?: string
}

export interface ZoomBatchMeeting {
  meetingId: string
  joinUrl:   string
}

// ── createZoomMeeting ─────────────────────────────────────────────────────────
/**
 * Create a one-off Zoom meeting for an individual or trial session.
 * Returns fresh links every time — never reuse.
 * @param topic         Display name shown in Zoom (e.g. "Maths A/L - Kavindu")
 * @param startTime     When the session starts
 * @param durationMins  Session length in minutes
 */
export async function createZoomMeeting(
  topic: string,
  startTime: Date,
  durationMins: number,
): Promise<ZoomMeeting> {
  if (isTestMode()) {
    const testId = `test_${Date.now()}`
    console.log(`🎥 Zoom [TEST MODE] createMeeting: "${topic}"`)
    return {
      meetingId: testId,
      joinUrl:   `https://zoom.us/j/${testId}`,
      startUrl:  `https://zoom.us/s/${testId}`,
    }
  }

  const token = await getZoomToken()

  const body = {
    topic,
    type:       2,  // 2 = scheduled meeting
    start_time: startTime.toISOString(),
    duration:   durationMins,
    timezone:   'Asia/Colombo',
    settings: {
      waiting_room:       true,
      join_before_host:   false,
      auto_recording:     'none',
      mute_upon_entry:    true,
      participant_video:  true,
      host_video:         true,
    },
  }

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom createMeeting failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as {
    id:        number
    join_url:  string
    start_url: string
    password?: string
  }

  return {
    meetingId: String(data.id),
    joinUrl:   data.join_url,
    startUrl:  data.start_url,
    password:  data.password,
  }
}

// ── createBatchZoomMeeting ────────────────────────────────────────────────────
/**
 * Create a recurring weekly Zoom meeting for a batch class.
 * Refreshed every Sunday at 6am (cron job).
 * @param batchName  e.g. "A/L Maths 2027 Batch"
 * @param weeklyDay  Day number: 1=Sunday, 2=Monday … 7=Saturday
 * @param time       "HH:MM" in 24h format (Colombo timezone)
 * @param durationMins
 */
export async function createBatchZoomMeeting(
  batchName: string,
  weeklyDay: number,
  time: string,
  durationMins: number,
): Promise<ZoomBatchMeeting> {
  if (isTestMode()) {
    const testId = `test_batch_${Date.now()}`
    console.log(`🎥 Zoom [TEST MODE] createBatchMeeting: "${batchName}"`)
    return {
      meetingId: 'batch_test_' + testId,
      joinUrl:   `https://zoom.us/j/batch${testId}?pwd=123456`,
    }
  }

  const token = await getZoomToken()

  // Parse time string into hours/minutes
  const [hours, minutes] = time.split(':').map(Number)
  const startTime = new Date()
  startTime.setHours(hours, minutes, 0, 0)

  const body = {
    topic:      batchName,
    type:       8,           // 8 = recurring meeting with fixed time
    start_time: startTime.toISOString(),
    duration:   durationMins,
    timezone:   'Asia/Colombo',
    recurrence: {
      type:              2,         // 2 = weekly
      repeat_interval:   1,
      weekly_days:       weeklyDay, // 1=Sun, 2=Mon … 7=Sat
      end_times:         52,        // ~1 year of weekly meetings
    },
    settings: {
      waiting_room:       true,          // ✅ Tutor admits only paid students
      join_before_host:   false,
      auto_recording:     'none',
      mute_upon_entry:    true,
      password:           generateBatchPasscode(batchName),  // 6-digit auto-passcode
    },
  }

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom createBatchMeeting failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as { id: number; join_url: string }

  return {
    meetingId: String(data.id),
    joinUrl:   data.join_url,
  }
}

// ── getMeetingAttendance ──────────────────────────────────────────────────────
/**
 * Fetch participant list for a past meeting.
 * Used to compare enrolled vs actually joined — alert tutor if joined > enrolled.
 */
export interface ZoomParticipant {
  name:      string
  email:     string
  joinTime:  string
  leaveTime: string
  duration:  number  // seconds
}

export async function getMeetingAttendance(meetingId: string): Promise<ZoomParticipant[]> {
  if (isTestMode()) {
    console.log(`🎥 Zoom [TEST MODE] getMeetingAttendance: ${meetingId}`)
    return []
  }

  const token = await getZoomToken()

  const res = await fetch(
    `https://api.zoom.us/v2/report/meetings/${meetingId}/participants?page_size=300`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!res.ok) {
    console.error(`[zoom] getMeetingAttendance failed: ${res.status}`)
    return []
  }

  const data = (await res.json()) as {
    participants: Array<{
      name:        string
      user_email:  string
      join_time:   string
      leave_time:  string
      duration:    number
    }>
  }

  return (data.participants ?? []).map(p => ({
    name:      p.name,
    email:     p.user_email,
    joinTime:  p.join_time,
    leaveTime: p.leave_time,
    duration:  p.duration,
  }))
}

// ── deleteZoomMeeting ─────────────────────────────────────────────────────────
/**
 * Cancel / delete a Zoom meeting.
 * Called when a session is cancelled or rescheduled.
 */
export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  if (isTestMode()) {
    console.log(`🎥 Zoom [TEST MODE] deleteMeeting: ${meetingId}`)
    return
  }

  const token = await getZoomToken()

  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok && res.status !== 404) {
    // 404 means already deleted — that's fine
    const err = await res.text()
    throw new Error(`Zoom deleteMeeting failed: ${res.status} ${err}`)
  }
}
