# Smartclaz — Claude Code Developer Guide

## What is Smartclaz?
The operating system for Sri Lankan online tutors. Automates student onboarding, class bookings, payments, Zoom links and reminders — all through WhatsApp. Tutors use the web dashboard. Students interact 100% via WhatsApp. No student login. No student website.

**Tagline:** "Less admin, more teaching"

---

## ⚠️ Live Signup Flow (confirmed from code, not from the docs below)
This file's "App Pages" section below describes an earlier planned architecture
(`src/app/signup/subjects` → `settings`) that no longer matches the codebase.
The actual paths are `app/(auth)/signup/*`, and the **only live, middleware-enforced
signup flow** — confirmed via `proxy.ts`'s `stepOrder` array and every page's actual
"Continue" button destination — is:

```
/signup → /signup/classes → /signup/payments → /signup/preferences → /dashboard
(profile)  (subjects/fees)   (payment setup)     (WhatsApp/policies,
                                                   sets status='active')
```

An earlier, unreachable parallel flow (`signup/subjects`, `signup/groups`,
`signup/availability`, `signup/settings`) existed in the codebase but was never
linked from Step 1 and was not checked by `proxy.ts` — it has been deleted.
Do not recreate pages at those paths without first checking whether they'd
actually be reachable from `/signup`.

---

## Tech Stack
- **Framework:** Next.js 14 + TypeScript
- **UI:** Tailwind CSS + shadcn/ui components
- **Database + Auth:** Supabase (Postgres + Phone OTP)
- **WhatsApp:** Twilio WhatsApp Business API
- **AI Bot:** Claude API (Sonnet) — powers WhatsApp bot
- **Video:** Zoom API — auto-generate meeting links
- **Push Notifications:** Web Push API
- **Hosting:** Netlify (already deployed)
- **Payments (Phase 3 only):** PayHere

---

## Design System

> Inspired by Calendly. Single dominant color — Indigo. Multi-color only for semantic states (paid/unpaid/pending). Common UI elements (buttons, nav, focus rings, badges, icons) all use Indigo only.

### Color Philosophy
```
PRIMARY BRAND = Indigo only
  Use for: buttons, active nav, focus rings, links,
           primary badges, icons, highlights, CTAs

SEMANTIC ONLY = use sparingly, only for status:
  Green  = paid, present, success
  Amber  = pending, warning, late
  Red    = unpaid, absent, error, overdue

NEVER use green/amber/red for decorative UI —
only when communicating a real status to the tutor.
```

### Color Tokens
```css
/* ── Brand (use everywhere in UI) ── */
--navy:         #0e1f3b   /* Sidebar, topbar background */
--navy2:        #162844   /* Sidebar hover, secondary bg */
--indigo:       #3b5bdb   /* PRIMARY — all buttons, links, active states */
--indigo2:      #4c6ef5   /* Hover state of primary */
--indigo3:      #748ffc   /* Active nav text, banner accent */
--indigo-pale:  #edf2ff   /* Badge bg, soft button bg, icon bg */
--indigo-mid:   #dbe4ff   /* Badge border, soft button border */

/* ── Semantic (status only) ── */
--green:        #2f9e44   /* Paid · Present · Success */
--green-pale:   #ebfbee   /* Paid card bg */
--green-border: #b2f2bb   /* Paid badge border */
--amber:        #e67700   /* Pending · Warning · Late */
--amber-pale:   #fff9db   /* Pending card bg */
--amber-border: #ffec99   /* Pending badge border */
--red:          #c92a2a   /* Unpaid · Absent · Error · Overdue */
--red-pale:     #fff5f5   /* Error card bg */
--red-border:   #ffc9c9   /* Error badge border */

/* ── Neutrals ── */
--ink:     #1a1a2e   /* Headings, primary text */
--ink2:    #343a40   /* Labels, secondary headings */
--ink3:    #6c757d   /* Body text, meta info */
--ink4:    #adb5bd   /* Placeholders, timestamps */
--ink5:    #ced4da   /* Dividers, muted borders */
--bg:      #f8f9fa   /* Page background */
--bg2:     #f1f3f5   /* Section bg, input bg on hover */
--surface: #ffffff   /* Cards, modals, inputs */
--border:  #dee2e6   /* Card borders, dividers */
--border2: #ced4da   /* Input borders, stronger dividers */
```

### Typography
```
Display heading:  Plus Jakarta Sans 800 · 2.6rem · -0.03em tracking
Page title (H1):  Plus Jakarta Sans 800 · 1.5rem · -0.025em tracking
Section title:    Plus Jakarta Sans 700 · 1.05rem · -0.02em tracking
Card title:       Plus Jakarta Sans 700 · 0.84rem · -0.01em tracking
Body text:        Plus Jakarta Sans 400 · 14px · 1.6 line-height
Small / meta:     Plus Jakarta Sans 500 · 0.7rem
Mono label:       JetBrains Mono 600 · 0.56rem · uppercase · 0.12em tracking
LKR amounts:      Plus Jakarta Sans 800 · 1.6rem+ · -0.04em · indigo color

Google Fonts import:
https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap
```

### Radius Tokens
```css
--r-sm:   6px    /* Small elements, mark buttons */
--r:      10px   /* Inputs, small cards, small buttons */
--r-md:   14px   /* Standard cards, medium buttons */
--r-lg:   18px   /* Large cards, stat cards */
--r-xl:   24px   /* Large modals, feature sections */
--r-pill: 100px  /* Badges, pill buttons, toggles */
```

### Shadow Tokens
```css
--s1: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)  /* Cards default */
--s2: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04) /* Cards hover */
--s3: 0 8px 24px rgba(0,0,0,0.1),  0 3px 8px rgba(0,0,0,0.05) /* Modals, dropdowns */
--s-indigo: 0 4px 14px rgba(59,91,219,0.3)                     /* Primary buttons */
```

### Component Patterns

**Buttons:**
```
Primary:   bg-[--indigo] text-white shadow-[--s-indigo] rounded-[10px] px-5 py-2.5
           hover: bg-[--indigo2] translateY(-1px) shadow stronger
Ghost:     border-1.5 border-[--border2] rounded-[10px] px-5 py-2.5
           hover: border-[--indigo] text-[--indigo] bg-[--indigo-pale]
Soft:      bg-[--indigo-pale] text-[--indigo] border border-[--indigo-mid]
Sizes:     xs=5/11, sm=7/14, md=10/20, lg=13/26 (py/px in px)
Pill:      border-radius: 100px on any button variant
```

**Badges:**
```
All badges: rounded-full, 1px border, font-weight 700, font-size 0.68rem
Indigo:    bg-[--indigo-pale]  text-[--indigo]  border-[--indigo-mid]   → system labels
Green:     bg-[--green-pale]   text-[--green]   border-[--green-border] → paid/present
Amber:     bg-[--amber-pale]   text-[--amber]   border-[--amber-border] → pending/late
Red:       bg-[--red-pale]     text-[--red]     border-[--red-border]   → unpaid/absent
Neutral:   bg-[--bg2]          text-[--ink3]    border-[--border2]      → inactive
```

**Inputs:**
```
border: 1.5px solid --border2
border-radius: 10px
padding: 9px 13px
focus: border-color --indigo, box-shadow 0 0 0 3px rgba(59,91,219,0.12)
valid: border-color --green, background --green-pale
error: border-color --red, background --red-pale
font: Plus Jakarta Sans 400, 0.82rem
```

**Cards:**
```
background: --surface
border: 1px solid --border
border-radius: --r-lg (18px)
box-shadow: --s1
hover: translateY(-2px), box-shadow --s2
padding: 18px
```

**Stat Cards:**
```
Same as card above +
Icon container: 38x38px, border-radius --r, bg = --indigo-pale (use indigo for all icons)
Value: Plus Jakarta Sans 800, 1.6rem, -0.04em, color --ink (or --indigo for LKR)
Trend up: color --green with ↑ arrow
Trend down: color --red with ↓ arrow
Label: Plus Jakarta Sans 600, 0.72rem, --ink3
```

**Navigation sidebar:**
```
Background: --navy
Item default:  color rgba(255,255,255,0.5), padding 7px 9px, rounded-[8px]
Item hover:    background rgba(255,255,255,0.06), color rgba(255,255,255,0.85)
Item active:   background rgba(59,91,219,0.2), color --indigo3,
               border 1px solid rgba(59,91,219,0.3)
Section label: JetBrains Mono, 0.55rem, uppercase, rgba(255,255,255,0.25)
```

**Notification cards:**
```
Unread: border-left 3px solid --indigo (default) or semantic color
Read:   border: 1px solid --border (no left accent)
Always: border-radius --r-md, padding 13px 15px, box-shadow --s1
```

**Toggles:**
```
OFF: background --border2
ON:  background --indigo  ← always indigo, never semantic colors
Knob: 18x18px white circle, box-shadow 0 1px 4px rgba(0,0,0,0.2)
Width: 42px, height 24px, border-radius pill
```

**Progress bars:**
```
Track: height 8px, bg --bg2, border-radius pill
Fill color:
  Good (>70%):   --green
  Warning (>50%): --amber
  Bad (<50%):    --red
  Generic:       --indigo (for occupancy, usage bars)
```

**Bottom sheet modal:**
```
Overlay: rgba(0,0,0,0.5) + backdrop-blur(6px)
Sheet: background white, border-radius 20px 20px 0 0
Handle: 38x4px, --border2, rounded-full, centered
padding: 18px
```

---

## Database Schema (Supabase)

```sql
-- Tutors
tutors (
  id uuid primary key,
  phone text unique,
  name text,
  email text,
  whatsapp_number text,
  subjects jsonb,          -- [{subject, grade, individual_fee, group_fee, trial_fee}]
  availability jsonb,      -- [{day, start_time, end_time}]
  payment_instructions text,
  reschedule_policy text,  -- 'auto_24h' | 'auto_48h' | 'manual'
  noshow_policy text,      -- 'forfeit' | 'reschedule' | 'ask'
  notification_prefs jsonb,
  monthly_due_date int,    -- day of month (e.g. 5)
  grace_period_days int,
  message_count int,       -- for cost tracking
  plan text,               -- 'starter' | 'growth' | 'pro' | 'unlimited'
  created_at timestamptz
)

-- Students
students (
  id uuid primary key,
  tutor_id uuid references tutors,
  name text,
  whatsapp text,
  parent_name text,
  parent_whatsapp text,
  subject text,
  grade text,
  class_type text,         -- 'individual' | 'batch' | 'trial'
  batch_id uuid references batches,
  monthly_fee int,         -- in LKR
  fee_type text,           -- 'monthly' | 'per_session'
  status text,             -- 'active' | 'inactive' | 'blocked'
  consent_given boolean,
  consent_at timestamptz,
  created_at timestamptz
)

-- Batches (recurring group classes)
batches (
  id uuid primary key,
  tutor_id uuid references tutors,
  name text,               -- e.g. "A/L Maths 2027 Batch"
  subject text,
  grade text,
  schedule_day text,       -- e.g. "Sunday"
  schedule_time time,      -- e.g. "08:00"
  max_students int,
  monthly_fee int,         -- LKR per student
  zoom_meeting_id text,    -- recurring Zoom meeting
  status text,             -- 'active' | 'inactive'
  created_at timestamptz
)

-- Sessions
sessions (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_id uuid references students,
  batch_id uuid references batches,
  session_type text,       -- 'individual' | 'batch'
  scheduled_at timestamptz,
  duration_mins int,
  zoom_link text,
  zoom_meeting_id text,
  status text,             -- 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  payment_status text,     -- 'pending' | 'paid' | 'forfeited'
  notes text,
  created_at timestamptz
)

-- Payments
payments (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_id uuid references students,
  session_id uuid references sessions,
  amount_lkr int,
  payment_type text,       -- 'monthly' | 'per_session'
  month_year text,         -- e.g. "2025-06" for monthly
  method text,             -- 'bank' | 'ezCash' | 'cash' | 'payhere'
  status text,             -- 'pending' | 'paid' | 'overdue' | 'blocked'
  due_date date,
  paid_at timestamptz,
  verified_by text,        -- 'tutor' | 'payhere'
  created_at timestamptz
)

-- Reminders
reminders (
  id uuid primary key,
  session_id uuid references sessions,
  student_id uuid references students,
  type text,               -- '24h' | '1h' | '30min_tutor' | 'payment_due' | 'payment_overdue'
  channel text,            -- 'whatsapp' | 'push'
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text              -- 'pending' | 'sent' | 'failed'
)

-- WhatsApp Conversations
conversations (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_whatsapp text,
  status text,             -- 'bot' | 'human' | 'resolved'
  context jsonb,           -- bot conversation state
  last_message_at timestamptz,
  created_at timestamptz
)

-- Message Cost Tracking
message_logs (
  id uuid primary key,
  tutor_id uuid references tutors,
  direction text,          -- 'inbound' | 'outbound'
  cost_usd decimal,
  month_year text,
  created_at timestamptz
)
```

---

## App Pages — Build in This Order

### 1. Landing Page
**File:** `src/app/page.tsx`
**Access:** Public
**Content:**
- Hero: "The operating system for Sri Lankan tuition teachers"
- Problem section: show WhatsApp chaos (before)
- Solution section: show automated flow (after)
- Features: WhatsApp bot, auto Zoom, batch management, monthly fees
- Pricing tiers: Starter LKR 990 / Growth LKR 1,990 / Pro LKR 3,490 / Unlimited LKR 4,990
- CTA: "Start Free 30-day Trial"
- No credit card required

### 2. Signup — Step 1 Basic Profile
**File:** `src/app/signup/page.tsx`
**Access:** Public
**Fields:**
- Full name
- Email
- Phone number (Sri Lanka +94 format)
- OTP verification via Supabase
- On success → redirect to /signup/subjects

### 3. Signup — Step 2 Subjects & Fees
**File:** `src/app/signup/subjects/page.tsx`
**Access:** Auth required
**Fields:**
- Add subject (dropdown: Mathematics, Science, Physics, Chemistry, English, Sinhala, ICT, Other)
- Grade level (A/L, O/L, Grade 9, Grade 8, Grade 7, Grade 6, Grade 5)
- Individual session fee (LKR)
- Group/batch fee per student (LKR)
- Trial class: Free toggle or paid amount
- Fee type: Monthly / Per session / Both
- Payment instructions (textarea — bank details, eZCash etc)
- Can add multiple subjects
- On success → redirect to /signup/settings

### 4. Signup — Step 3 Settings & WhatsApp
**File:** `src/app/signup/settings/page.tsx`
**Access:** Auth required
**Fields:**
- Weekly availability (day + time slots)
- Session duration (1hr / 1.5hr / 2hr)
- Buffer between sessions (15min / 30min)
- Reschedule policy (auto 24hr / auto 48hr / always manual)
- Max reschedules per student per month (1 / 2 / Unlimited)
- No-show policy (forfeit / offer reschedule / ask each time)
- Group minimum students to run (1 / 3 / 5 / ask me)
- Monthly fee due date (day of month)
- Grace period before blocking access (3 / 5 / 7 days)
- Notification preferences (per event: App / WhatsApp / Both)
- WhatsApp Business number connection
- On success → redirect to /dashboard

### 5. Dashboard (Main)
**File:** `src/app/dashboard/page.tsx`
**Access:** Auth required (middleware)
**Sections:**

**Header strip:**
- "Good morning, [Name]" greeting
- Today's date

**Pending actions card (top priority — shown first):**
- Payments pending verification (count + tap to verify)
- Bot needs help (count + tap to join chat)
- Students overdue on monthly fee (count)

**Stats row:**
- This month income (LKR)
- Active students count
- Sessions today
- Outstanding payments (LKR)

**Today's sessions list:**
- Time, student name, subject, type (individual/batch)
- Status: upcoming / completed / no-show
- Quick mark attendance buttons

**Upcoming this week:**
- List of next 7 days sessions

**Recent WhatsApp activity:**
- Latest student conversations
- "Join Chat" button if bot is paused

### 6. Students Page
**File:** `src/app/students/page.tsx`
**Access:** Auth required
**Features:**
- Search by name
- Filter: All / Active / Inactive / Blocked
- Filter: Subject / Grade / Class type
- Student card: name, subject, grade, fee, payment status badge
- Tap student → detail sheet:
  - Full profile
  - Payment history
  - Attendance history
  - Call / WhatsApp buttons
  - Edit / Remove buttons
- Add student button → form (name, whatsapp, parent details, subject, grade, fee, class type)

### 7. Batches Page
**File:** `src/app/batches/page.tsx`
**Access:** Auth required
**Features:**
- List of all batches
- Batch card: name, subject, grade, schedule, enrolled/max students, monthly fee
- Batch status: active / inactive
- Tap batch → detail:
  - Students enrolled list
  - Attendance per session
  - Payment status per student
  - This month paid/unpaid breakdown
- Create batch button → form:
  - Batch name
  - Subject + grade
  - Schedule day + time
  - Max students
  - Monthly fee per student
- Zoom link shown per batch (auto-generated weekly)

### 8. Sessions Page
**File:** `src/app/sessions/page.tsx`
**Access:** Auth required
**Features:**
- Calendar view (week default)
- List view toggle
- Session card: time, student/batch, subject, status, payment status
- Filter: All / Individual / Batch / Today / This week
- Tap session → detail:
  - Full session info
  - Zoom link
  - Attendance status
  - Payment status
  - Add notes button
  - Notes sent to student via WhatsApp

### 9. Payments Page
**File:** `src/app/payments/page.tsx`
**Access:** Auth required
**Features:**
- Month selector (current month default)
- Revenue summary: Collected / Expected / Outstanding (LKR)
- Collection rate progress bar
- Tabs: All / Pending / Paid / Overdue
- Per student row: name, amount, due date, status
- "Mark Paid" button → confirm modal (method: bank/cash/eZCash)
- "Send Reminder" → WhatsApp reminder to student/parent
- "Remind All Unpaid" → bulk reminder button
- Outstanding students highlighted in red

### 10. WhatsApp Chats Page
**File:** `src/app/chats/page.tsx`
**Access:** Auth required
**Features:**
- List of all student conversations
- Status badge: Bot active / Needs help / Resolved
- Unread indicator
- Tap conversation → full chat view:
  - WhatsApp-style message bubbles
  - "Join Chat" button (pauses bot)
  - Type and send manually when in human mode
  - "Hand back to bot" button
  - Bot resumes automatically

### 11. Settings Page
**File:** `src/app/settings/page.tsx`
**Access:** Auth required
**Sections:**
- Profile (name, email, phone)
- Subjects & Fees (edit all fee structures)
- Availability (weekly schedule)
- Policies (reschedule, no-show, group rules)
- Payment instructions (bank details, eZCash)
- Monthly fee settings (due date, grace period)
- Notification preferences (per event type)
- WhatsApp Business connection
- Subscription plan + usage

### 12. WhatsApp Webhook API
**File:** `src/app/api/whatsapp/webhook/route.ts`
**Access:** Public (Twilio calls this)
**Logic:**
- Receive incoming WhatsApp message from Twilio
- Look up tutor by phone number
- Check conversation status (bot / human)
- If human mode → notify tutor, store message, wait
- If bot mode → pass to Claude API with context
- Claude determines intent and generates reply
- Save conversation context to Supabase
- Send reply via Twilio
- Handle: new student, booking, payment confirm, reschedule, no-show, general questions

---

## Key Business Rules

```
STUDENT RULES:
- Students NEVER log in to any website
- Students interact 100% via WhatsApp only
- Student must reply "AGREE" to class rules before proceeding
- Consent saved to database with timestamp

PAYMENT RULES:
- No automatic payment processing in MVP
- Tutor manually verifies each payment (1 tap)
- After tutor confirms → Zoom link sent automatically
- Monthly fee reminders: 3 days before, on due date, 3 days after, 7 days after
- After grace period → student status = 'blocked' → no Zoom link sent

ZOOM RULES:
- Fresh Zoom link generated per session (not reused)
- Individual: unique link per student per session
- Batch: one link per batch per week (fresh each week)
- Link sent ONLY to students with status = 'active' + payment = 'paid'
- Dashboard shows enrolled count vs joined count
- If joined > enrolled → alert tutor → tutor can regenerate link

BOT RULES:
- Bot handles 100% of student conversations automatically
- Bot collects: name → subject → grade → class type → slot/batch → shows fee
- Bot sends class rules → waits for "AGREE" → then sends payment instructions
- If bot gets confused → auto-detect → pause bot → notify tutor (App + WhatsApp)
- Tutor joins manually → handles → hands back → bot resumes
- Student sees "Sohan sir will reply shortly" while bot is paused

NOTIFICATION RULES:
- All tutor notifications go to BOTH app push AND WhatsApp (unless tutor disabled)
- 24hr reminder → student WhatsApp + Zoom link
- 1hr reminder → student WhatsApp + Zoom link
- 30min → tutor app push + WhatsApp
- Payment pending → tutor App + WhatsApp immediately
- Bot needs help → tutor App + WhatsApp immediately with chat link

FEE RULES:
- Fees set per subject + grade + class type
- Individual fee ≠ batch fee ≠ trial fee
- Custom fee can be set per student (override)
- Monthly or per-session — tutor's choice per subject
- All amounts in LKR only

MESSAGE COST RULES:
- Track every outbound message per tutor
- Log cost in message_logs table
- Caps: Starter 500/mo, Growth 1500/mo, Pro 5000/mo, Unlimited = no cap
- Alert tutor at 80% of cap
- Alert admin if cost > 80% of tutor's revenue
```

---

## WhatsApp Bot Conversation Flow

```
Student message received
        ↓
Is conversation status = 'human'?
  YES → Store message, notify tutor (App + WA), wait
  NO  → Continue to bot
        ↓
Is this a new student (no record found)?
  YES → Start onboarding flow:
        1. Collect name
        2. Show subjects tutor teaches
        3. Student picks subject + grade
        4. Show class types + fees
        5. Student picks class type
        6. Show available slots / batches
        7. Student picks slot/batch
        8. Send class rules + consent request
        9. Wait for "AGREE"
        10. Send payment instructions with correct fee
        11. Notify tutor of new enquiry
  NO  → Existing student:
        Detect intent (reschedule / payment query / general)
        Handle accordingly
        ↓
Is bot stuck? (repeated questions, student confused)
  YES → Pause bot
        Send student: "Sir will reply shortly"
        Notify tutor: App push + WhatsApp with chat link
  NO  → Continue conversation
```

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Claude AI
ANTHROPIC_API_KEY=

# Zoom
ZOOM_API_KEY=
ZOOM_API_SECRET=
ZOOM_ACCOUNT_ID=

# App
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://smartclaz.com
```

---

## Middleware — Route Protection

```typescript
// src/middleware.ts
// Protect all routes except:
// - / (landing)
// - /login
// - /signup (and sub-pages)
// - /api/whatsapp/webhook

const publicRoutes = ['/', '/login', '/signup', '/api/whatsapp/webhook']
```

---

## Component Conventions

```typescript
// Always use 'use client' for interactive components
// Server components for static/data-fetching pages
// All amounts displayed as: LKR {amount.toLocaleString()}
// All dates: toLocaleDateString('en-LK')
// Phone numbers: always stored with +94 prefix
// Use shadcn/ui components where possible
// Modal/sheets: slide up from bottom (mobile-first)
// Loading states: skeleton loaders not spinners
// Empty states: friendly message with action button
// Error states: toast notifications (shadcn toast)
```

---

## Build Priority Order

```
Week 1:
  [ ] Landing page
  [ ] Signup Step 1 (basic profile + OTP)
  [ ] Signup Step 2 (subjects + fees)
  [ ] Signup Step 3 (settings + WhatsApp)
  [ ] Dashboard (main)
  [ ] Middleware (route protection)

Week 2:
  [ ] Students page
  [ ] Batches page
  [ ] Sessions page
  [ ] Payments page

Week 3:
  [ ] WhatsApp Chats page
  [ ] Settings page
  [ ] WhatsApp webhook API route
  [ ] Twilio integration

Week 4:
  [ ] Claude AI bot logic
  [ ] Zoom API integration
  [ ] Push notifications
  [ ] Reminders scheduler (Supabase Edge Functions)
  [ ] Message cost tracking
```

---

## Notes for Claude Code

- Always check Supabase types before writing queries
- Use Supabase RLS (Row Level Security) — tutors only see their own data
- All WhatsApp numbers stored with country code: +94771234567
- Monthly fee tracking: use month_year field format "YYYY-MM" (e.g. "2025-06")
- Batch Zoom links refresh every Sunday at 6am automatically (cron job)
- When in doubt about a component → use shadcn/ui
- Mobile-first responsive design — tutors use phones
- Test all forms with real Sri Lankan phone number format
- Use Supabase Realtime for dashboard live updates
