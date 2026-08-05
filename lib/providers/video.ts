// ════════════════════════════════════════════════════════════════════════════
// VIDEO PROVIDER INTERFACE
//
// To add a new provider (Microsoft Teams, Jitsi, Discord, …):
//   1. Implement VideoProvider below
//   2. Add an entry to PROVIDERS at the bottom
//   3. Set the tutor's video_provider column in Supabase to the new id
//   4. Add env vars — no other files need to change
// ════════════════════════════════════════════════════════════════════════════

export interface MeetingOptions {
  topic: string
  startTime: Date
  durationMinutes: number
  hostEmail?: string
  timezone?: string
}

export interface Meeting {
  /** Provider-specific meeting ID — stored in sessions.zoom_meeting_id */
  id: string
  /** Link sent to students */
  joinUrl: string
  /** Host start URL (only for the tutor) */
  hostUrl?: string
  /** Optional password sent alongside the link */
  password?: string
  /** Which provider created this meeting */
  provider: string
}

export interface VideoProvider {
  readonly id: string
  readonly name: string

  /** Create a new meeting and return its details. */
  createMeeting(options: MeetingOptions): Promise<Meeting>

  /** Fetch details for an existing meeting by ID. */
  getMeeting(meetingId: string): Promise<Meeting>

  /** Delete / cancel a meeting. */
  deleteMeeting(meetingId: string): Promise<void>
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
// Env vars needed:
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET  (Server-to-Server OAuth)

const zoom: VideoProvider = {
  id:   'zoom',
  name: 'Zoom',

  async createMeeting(options) {
    // TODO: get Server-to-Server OAuth token
    // const token = await getZoomToken()
    //
    // const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    //   method:  'POST',
    //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     topic:      options.topic,
    //     type:       2,  // scheduled
    //     start_time: options.startTime.toISOString(),
    //     duration:   options.durationMinutes,
    //     timezone:   options.timezone ?? 'Asia/Colombo',
    //     settings:   { waiting_room: true, join_before_host: false, auto_recording: 'none' },
    //   }),
    // })
    // const d = await res.json()
    // return { id: String(d.id), joinUrl: d.join_url, hostUrl: d.start_url, password: d.password, provider: 'zoom' }
    console.log('[zoom] createMeeting:', options.topic)
    return { id: 'mock-zoom-id', joinUrl: 'https://zoom.us/j/mock', provider: 'zoom' }
  },

  async getMeeting(meetingId) {
    // TODO: GET https://api.zoom.us/v2/meetings/{meetingId}
    return { id: meetingId, joinUrl: `https://zoom.us/j/${meetingId}`, provider: 'zoom' }
  },

  async deleteMeeting(meetingId) {
    // TODO: DELETE https://api.zoom.us/v2/meetings/{meetingId}
    console.log('[zoom] deleteMeeting:', meetingId)
  },
}

// ── Google Meet ───────────────────────────────────────────────────────────────
// Google Meet links are generated through the Google Calendar API.
// Env vars needed:
//   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY  (Service Account)

const googleMeet: VideoProvider = {
  id:   'google-meet',
  name: 'Google Meet',

  async createMeeting(options) {
    // TODO: use googleapis package
    // const auth = new google.auth.JWT(process.env.GOOGLE_CLIENT_EMAIL, undefined, process.env.GOOGLE_PRIVATE_KEY, ['https://www.googleapis.com/auth/calendar'])
    // const calendar = google.calendar({ version: 'v3', auth })
    // const endTime = new Date(options.startTime.getTime() + options.durationMinutes * 60_000)
    //
    // const event = await calendar.events.insert({
    //   calendarId:              'primary',
    //   conferenceDataVersion:   1,
    //   sendUpdates:             'none',
    //   requestBody: {
    //     summary:   options.topic,
    //     start:     { dateTime: options.startTime.toISOString(), timeZone: options.timezone ?? 'Asia/Colombo' },
    //     end:       { dateTime: endTime.toISOString(),           timeZone: options.timezone ?? 'Asia/Colombo' },
    //     conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    //   },
    // })
    // const joinUrl = event.data.conferenceData?.entryPoints?.[0]?.uri ?? ''
    // return { id: event.data.id!, joinUrl, provider: 'google-meet' }
    console.log('[google-meet] createMeeting:', options.topic)
    return { id: 'mock-meet-id', joinUrl: 'https://meet.google.com/mock', provider: 'google-meet' }
  },

  async getMeeting(meetingId) {
    // TODO: GET Calendar event by meetingId, extract hangout link
    return { id: meetingId, joinUrl: `https://meet.google.com/${meetingId}`, provider: 'google-meet' }
  },

  async deleteMeeting(meetingId) {
    // TODO: calendar.events.delete({ calendarId: 'primary', eventId: meetingId })
    console.log('[google-meet] deleteMeeting:', meetingId)
  },
}

// ── Microsoft Teams ───────────────────────────────────────────────────────────
// Stub — uncomment and implement when needed.
// Env vars needed: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
//
// const microsoftTeams: VideoProvider = {
//   id:   'microsoft-teams',
//   name: 'Microsoft Teams',
//   async createMeeting(options) { /* POST /v1.0/users/{userId}/onlineMeetings via MS Graph */ },
//   async getMeeting(id) { ... },
//   async deleteMeeting(id) { ... },
// }

// ── Registry ──────────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, VideoProvider> = {
  [zoom.id]:       zoom,
  [googleMeet.id]: googleMeet,
  // [microsoftTeams.id]: microsoftTeams,
  // Add new providers here ↓
}

/**
 * Returns the video provider for a tutor.
 * Falls back to Zoom if the stored id is missing or unknown.
 */
export function getVideoProvider(id = 'zoom'): VideoProvider {
  return PROVIDERS[id] ?? PROVIDERS['zoom']
}

export const videoProviderIds = Object.keys(PROVIDERS)
