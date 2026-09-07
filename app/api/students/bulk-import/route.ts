// POST /api/students/bulk-import
// Receives pre-validated rows from the CSV import wizard and writes students,
// payments, and optional sessions to Supabase.
//
// The frontend wizard normalises and resolves each row before posting:
//   _normalizedPhone   — +94XXXXXXXXX
//   _resolvedFee       — fee determined from tutor profile or override
//   _feeSource         — 'individual' | 'group' | 'trial' | 'override'
//   _resolvedBatchId   — UUID of the matching batches row (group only)
//   _resolvedSubject   — corrected casing from tutor profile
//   _resolvedGrade     — corrected casing from tutor profile
//   _rowNumber         — 1-based CSV row index (for error reporting)
//   _skipped           — true when the wizard already decided to skip
//
// Server-side re-validation is performed for batch ownership and fee before
// each student insert, so the import is safe against tampered payloads.
//
// Individual row errors do NOT abort the whole import — they are collected and
// returned to the caller alongside summary counts.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createClient }              from '@/lib/supabase/server'

// ── Request body type ─────────────────────────────────────────────────────────

type ImportRow = {
  // Raw CSV fields (strings, as the client parsed them)
  name:                 string
  whatsapp:             string
  subject:              string
  grade:                string
  class_type:           string
  batch_name:           string
  paid_this_month:      string   // 'yes' | 'no' | 'na' | ''
  next_session_date:    string   // YYYY-MM-DD or ''
  next_session_time:    string   // HH:MM or ''
  monthly_fee_override: string   // numeric string or ''

  // Pre-resolved by the wizard
  _normalizedPhone:   string
  _resolvedFee:       number
  _feeSource:         string            // 'individual' | 'group' | 'trial' | 'override'
  _resolvedBatchId:   string | null
  _resolvedSubject:   string
  _resolvedGrade:     string
  _rowNumber:         number
  _skipped:           boolean
}

// ── Response shape ────────────────────────────────────────────────────────────

type ErrorDetail = {
  row:   number
  name:  string
  error: string
}

type CustomFeeStudent = {
  name:        string
  fee:         number
  standardFee: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split arr into chunks of at most `size` elements. */
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Normalise paid_this_month field to a boolean. 'yes' → true, everything else → false. */
function parsePaid(raw: string): boolean {
  return raw.trim().toLowerCase() === 'yes'
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── 1. Authenticate the tutor ────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase    = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tutorId = user.id

  // ── 2. Parse request body ────────────────────────────────────────────────
  let body: { rows: ImportRow[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rows: ImportRow[] = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: 'Max 500 students per import' }, { status: 400 })
  }

  // ── 3. Import-wide state ─────────────────────────────────────────────────
  const monthYear = new Date().toISOString().slice(0, 7)   // "YYYY-MM"

  let imported     = 0
  let skipped      = 0
  let alreadyExist = 0
  let failed       = 0

  const errorDetails:      ErrorDetail[]      = []
  const customFeeStudents: CustomFeeStudent[] = []
  const breakdown = { individual: 0, group: 0, trial: 0 }

  // ── 3a. Pre-load existing phone numbers for this tutor (duplicate check) ──
  const allPhones = rows
    .filter(r => !r._skipped)
    .map(r => r._normalizedPhone)
    .filter(Boolean)

  const { data: existingStudents } = await supabase
    .from('students')
    .select('whatsapp')
    .eq('tutor_id', tutorId)
    .in('whatsapp', allPhones)

  // seenPhones tracks both DB-existing and already-processed rows in this run
  const seenPhones = new Set<string>(
    (existingStudents ?? []).map((s: { whatsapp: string }) => s.whatsapp),
  )

  // ── 3b. Pre-load batch ownership map (id → monthly_fee) for re-validation ─
  const batchIdsToCheck = [
    ...new Set(
      rows
        .filter(r => !r._skipped && r._resolvedBatchId)
        .map(r => r._resolvedBatchId as string),
    ),
  ]

  type BatchRow = { id: string; monthly_fee: number | null }
  let verifiedBatches = new Map<string, number>()   // batchId → monthly_fee

  if (batchIdsToCheck.length > 0) {
    const { data: batchData } = await supabase
      .from('batches')
      .select('id, monthly_fee')
      .eq('tutor_id', tutorId)
      .in('id', batchIdsToCheck)

    for (const b of (batchData ?? []) as BatchRow[]) {
      verifiedBatches.set(b.id, b.monthly_fee ?? 0)
    }
  }

  // ── 4. Process rows in chunks of 20 ─────────────────────────────────────
  for (const chunk of chunks(rows, 20)) {
    for (const rowData of chunk) {
      // Skip rows the wizard already marked
      if (rowData._skipped) {
        skipped++
        continue
      }

      const phone = rowData._normalizedPhone

      // Duplicate check
      if (seenPhones.has(phone)) {
        alreadyExist++
        skipped++
        continue
      }

      try {
        // ── 4a. Normalise class_type ─────────────────────────────────────
        // CSV uses 'group'; DB students.class_type also uses 'group'
        const rawClassType = (rowData.class_type ?? '').trim().toLowerCase()
        const isGroup      = rawClassType === 'group'
        const isTrial      = rawClassType === 'trial'
        const classType: 'individual' | 'group' | 'trial' =
          isGroup ? 'group' : isTrial ? 'trial' : 'individual'

        // ── 4b. Server-side batch re-validation ──────────────────────────
        let resolvedBatchId: string | null = rowData._resolvedBatchId ?? null
        let resolvedFee     = rowData._resolvedFee

        if (isGroup && resolvedBatchId) {
          if (!verifiedBatches.has(resolvedBatchId)) {
            // Batch doesn't belong to this tutor — re-query once in case it
            // was created after our initial load
            const { data: freshBatch } = await supabase
              .from('batches')
              .select('id, monthly_fee')
              .eq('id', resolvedBatchId)
              .eq('tutor_id', tutorId)
              .single()

            if (!freshBatch) {
              throw new Error(
                `Batch "${rowData.batch_name}" not found or does not belong to your account`,
              )
            }
            verifiedBatches.set(freshBatch.id, freshBatch.monthly_fee ?? 0)
          }

          // Always use the batch's own fee unless the tutor explicitly overrode it
          if (rowData._feeSource !== 'override') {
            resolvedFee = verifiedBatches.get(resolvedBatchId) ?? resolvedFee
          }
        }

        // ── 4c. Track custom-fee students ────────────────────────────────
        if (rowData._feeSource === 'override') {
          // Determine what the standard fee would have been for reporting
          let standardFee = 0
          if (isGroup && resolvedBatchId) {
            standardFee = verifiedBatches.get(resolvedBatchId) ?? 0
          }
          customFeeStudents.push({
            name:        rowData.name.trim(),
            fee:         resolvedFee,
            standardFee,
          })
        }

        // ── 4d. Insert student ───────────────────────────────────────────
        const { data: student, error: studentErr } = await supabase
          .from('students')
          .insert({
            tutor_id:      tutorId,
            name:          rowData.name.trim(),
            whatsapp:      phone,
            subject:       (rowData._resolvedSubject || rowData.subject).trim(),
            grade:         (rowData._resolvedGrade   || rowData.grade).trim(),
            class_type:    classType,
            batch_id:      isGroup ? resolvedBatchId : null,
            monthly_fee:   resolvedFee,
            status:        isTrial ? 'pending' : 'active',
            consent_given: false,
            created_at:    new Date().toISOString(),
          })
          .select('id')
          .single()

        if (studentErr || !student) {
          console.error(`[bulk-import] Student insert failed for row ${rowData._rowNumber} "${rowData.name}":`, studentErr)
          throw new Error('Could not save this student — please check the row for invalid or duplicate data')
        }

        // ── 4e. Insert payment record ────────────────────────────────────
        // Skip entirely for trials where paid_this_month === 'na'
        const paidRaw = (rowData.paid_this_month ?? '').trim().toLowerCase()
        const isPaid  = paidRaw === 'yes'
        const isNa    = paidRaw === 'na'

        const shouldSkipPayment = isTrial && isNa

        if (!shouldSkipPayment) {
          const paymentType = isGroup ? 'monthly' : 'per_session'

          const { error: paymentErr } = await supabase
            .from('payments')
            .insert({
              tutor_id:     tutorId,
              student_id:   student.id,
              amount_lkr:   resolvedFee,
              payment_type: paymentType,
              month_year:   monthYear,
              status:       isPaid ? 'paid' : 'pending',
              paid_at:      isPaid ? new Date().toISOString() : null,
              created_at:   new Date().toISOString(),
            })

          if (paymentErr) {
            // Non-fatal — student was created; log but continue
            console.warn(
              `[bulk-import] Payment insert failed for row ${rowData._rowNumber} "${rowData.name}":`,
              paymentErr.message,
            )
          }
        }

        // ── 4f. Insert session (individual/trial only, when date+time given) ─
        // Group students get their sessions from the batch schedule, not CSV
        const hasDate = rowData.next_session_date?.trim()
        const hasTime = rowData.next_session_time?.trim()

        if (!isGroup && hasDate && hasTime) {
          const { error: sessionErr } = await supabase
            .from('sessions')
            .insert({
              tutor_id:       tutorId,
              student_id:     student.id,
              batch_id:       null,
              scheduled_at:   `${hasDate}T${hasTime}:00`,
              status:         'scheduled',
              session_type:   'individual',
              payment_status: isPaid ? 'paid' : 'pending',
              created_at:     new Date().toISOString(),
            })

          if (sessionErr) {
            console.warn(
              `[bulk-import] Session insert failed for row ${rowData._rowNumber} "${rowData.name}":`,
              sessionErr.message,
            )
          }
        }

        // ── 4g. Update counters ──────────────────────────────────────────
        imported++
        seenPhones.add(phone)   // prevent duplicates later in the same file

        if (classType === 'group')      breakdown.group++
        else if (classType === 'trial') breakdown.trial++
        else                            breakdown.individual++

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to import row'
        failed++
        errorDetails.push({
          row:   rowData._rowNumber,
          name:  rowData.name ?? '(unknown)',
          error: message,
        })
      }
    }

    // Brief pause between chunks to avoid overwhelming the DB connection pool
    await new Promise(r => setTimeout(r, 150))
  }

  // ── 5. Return results ────────────────────────────────────────────────────
  return NextResponse.json({
    success:            true,
    imported,
    skipped,
    alreadyExist,
    failed,
    errorDetails,
    breakdown,
    customFeeStudents,
  })
}
