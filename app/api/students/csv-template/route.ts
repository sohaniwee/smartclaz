// GET /api/students/csv-template
// Returns a personalised, downloadable CSV template for the bulk-import wizard.
// If the tutor is authenticated the comment block and example rows are generated
// from their actual subjects, grades, and active batch names.
// Unauthenticated requests receive a generic fallback template that is still
// immediately usable.

import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { SubjectEntry, GradeConfig, BatchConfig } from '@/lib/types/subjects'

// ── Column order (must match the import wizard parser exactly) ────────────────

const COLUMNS = [
  'name',
  'whatsapp',
  'subject',
  'grade',
  'class_type',
  'batch_name',
  'paid_this_month',
  'next_session_date',
  'next_session_time',
  'monthly_fee_override',
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap a cell value in double-quotes if it contains a comma or double-quote. */
function esc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function row(...cells: string[]): string {
  return cells.map(esc).join(',')
}

// ── Fallback data (used when the tutor has no subjects/batches configured) ────

const FB_SUBJECT    = 'Mathematics'
const FB_GRADE      = 'A/L'
const FB_BATCH_1    = 'A/L Maths 2027 Batch'
const FB_BATCH_2    = 'A/L Maths Sunday Batch'
const FB_INDIV_FEE  = 5000
const FB_GROUP_FEE  = 3500

// ── Comment-block builder ─────────────────────────────────────────────────────

type TemplateData = {
  subjectLines: string[]   // "  Mathematics → A/L"
  batchLines:   string[]   // '  Mathematics A/L: "A/L Maths 2027 Batch"'
}

function buildCommentBlock(td: TemplateData): string {
  const lines: string[] = [
    '# ═══════════════════════════════════════',
    '# SMARTCLAZ — STUDENT IMPORT TEMPLATE',
    '# ═══════════════════════════════════════',
    '# Delete ALL lines starting with # before uploading.',
    '#',
    '# YOUR SUBJECTS AND GRADES:',
    ...td.subjectLines.map(l => `#   ${l}`),
    '#',
    '# YOUR BATCH NAMES (copy exactly):',
    ...(td.batchLines.length > 0
      ? td.batchLines.map(l => `#   ${l}`)
      : ['#   (No active batches — add batches first if you teach group classes)']),
    '#',
    '# ─────────────────────────────────────',
    '# COLUMN GUIDE:',
    '# ─────────────────────────────────────',
    '# name (required) — Student full name. e.g. Kavindu Perera',
    '# whatsapp (required) — 0771234567 or +94771234567',
    '# subject (required) — Must match your subjects exactly.',
    '# grade (required) — Must match the grade listed for that subject.',
    '# class_type (required) — individual | group | trial',
    '# batch_name (required for group only) — Copy name exactly from list above. Blank for individual/trial.',
    '# paid_this_month (optional) — yes | no | na. Blank = no.',
    '# next_session_date (optional) — YYYY-MM-DD. Blank for group (comes from batch schedule).',
    '# next_session_time (optional) — HH:MM 24h. Required if date given. Blank for group.',
    '# monthly_fee_override (optional) — Leave blank. System auto-fills from your profile. Only for special rates.',
    '# ─────────────────────────────────────',
  ]
  return lines.join('\n')
}

// ── Example-row builder ───────────────────────────────────────────────────────

type ExampleInput = {
  firstSubject:  string
  firstGrade:    string
  firstBatch:    string   // batch name — empty string if none
  secondBatch:   string   // second batch name (may equal firstBatch if only one)
  indivFee:      number
}

function buildExampleRows(e: ExampleInput): string {
  const today      = new Date()
  const nextWeek   = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const sessionDate = nextWeek.toISOString().slice(0, 10)   // YYYY-MM-DD

  const hasBatch = e.firstBatch.trim() !== ''

  const exampleRows: string[][] = []

  // Row 1 — individual, paid, with session date/time, blank fee override
  exampleRows.push([
    'Kavindu Perera',
    '0771234567',
    e.firstSubject,
    e.firstGrade,
    'individual',
    '',
    'yes',
    sessionDate,
    '15:00',
    '',
  ])

  // Row 2 — group, not paid, blank session (comes from batch), blank fee
  exampleRows.push([
    'Sachini Silva',
    '0769876543',
    e.firstSubject,
    e.firstGrade,
    'group',
    hasBatch ? e.firstBatch : FB_BATCH_1,
    'no',
    '',
    '',
    '',
  ])

  // Row 3 — group, paid, second batch (or same if only one), blank session
  exampleRows.push([
    'Dilshan Rajapaksa',
    '0754321098',
    e.firstSubject,
    e.firstGrade,
    'group',
    hasBatch ? e.secondBatch : FB_BATCH_2,
    'yes',
    '',
    '',
    '',
  ])

  // Row 4 — trial, na, with session date/time, blank fee
  exampleRows.push([
    'Amali Fernando',
    '0752345678',
    e.firstSubject,
    e.firstGrade,
    'trial',
    '',
    'na',
    sessionDate,
    '10:00',
    '',
  ])

  // Row 5 — individual with fee override showing it differs from standard
  const overrideFee = Math.round(e.indivFee * 0.8 / 100) * 100  // 80% of standard, rounded
  exampleRows.push([
    'Nimal Jayawardena',
    '0712345678',
    e.firstSubject,
    e.firstGrade,
    'individual',
    '',
    'no',
    sessionDate,
    '17:00',
    String(overrideFee),   // special rate — differs from standard
  ])

  return exampleRows.map(r => row(...r)).join('\n')
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET() {
  let templateData: TemplateData = {
    subjectLines: [`${FB_SUBJECT} → ${FB_GRADE}`],
    batchLines:   [
      `${FB_SUBJECT} ${FB_GRADE}: "${FB_BATCH_1}"`,
      `${FB_SUBJECT} ${FB_GRADE}: "${FB_BATCH_2}"`,
    ],
  }

  let exampleInput: ExampleInput = {
    firstSubject: FB_SUBJECT,
    firstGrade:   FB_GRADE,
    firstBatch:   FB_BATCH_1,
    secondBatch:  FB_BATCH_2,
    indivFee:     FB_INDIV_FEE,
  }

  // ── Try to personalise if the tutor is authenticated ─────────────────────
  try {
    const cookieStore = await cookies()
    const supabase    = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Fetch tutor subjects JSONB
      const { data: tutorRow } = await supabase
        .from('tutors')
        .select('subjects')
        .eq('id', user.id)
        .single()

      // Fetch active batches
      const { data: batchRows } = await supabase
        .from('batches')
        .select('id, name, subject, grade, monthly_fee')
        .eq('tutor_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      const subjects: SubjectEntry[]                              = Array.isArray(tutorRow?.subjects) ? tutorRow.subjects : []
      const activeBatches: Array<{ id: string; name: string; subject: string | null; grade: string | null; monthly_fee: number | null }> = batchRows ?? []

      if (subjects.length > 0) {
        // Build subject/grade lines
        const subjectLines: string[] = []
        for (const entry of subjects) {
          for (const g of entry.grades) {
            subjectLines.push(`${entry.subject} → ${g.grade}`)
          }
        }

        // Build batch lines from both the batches table AND any batches embedded
        // inside the subjects JSONB (BatchConfig entries with names)
        const batchLines: string[] = []

        // Batches table rows (authoritative)
        for (const b of activeBatches) {
          if (b.name) {
            batchLines.push(`${b.subject ?? ''} ${b.grade ?? ''}: "${b.name}"`)
          }
        }

        // Embedded BatchConfig entries in subjects JSONB (may not yet be in
        // the batches table if the tutor just saved their profile)
        if (batchLines.length === 0) {
          for (const entry of subjects) {
            for (const g of entry.grades) {
              if (g.has_group && Array.isArray(g.batches)) {
                for (const bc of g.batches) {
                  if (bc.name) {
                    batchLines.push(`${entry.subject} ${g.grade}: "${bc.name}"`)
                  }
                }
              }
            }
          }
        }

        templateData = { subjectLines, batchLines }

        // Determine example row inputs from real data
        const firstEntry   = subjects[0]
        const firstGrade   = firstEntry.grades[0]
        const firstSubject = firstEntry.subject
        const fGrade       = firstGrade.grade

        // Individual fee — prefer has_individual + individual_fee > 0
        let indivFee = FB_INDIV_FEE
        outer:
        for (const entry of subjects) {
          for (const g of entry.grades) {
            if (g.has_individual && g.individual_fee > 0) {
              indivFee = g.individual_fee
              break outer
            }
          }
        }

        // Batch names for group example rows
        const batchNamesFlat: string[] = activeBatches
          .filter(b => b.name)
          .map(b => b.name)

        // Also try embedded batches if table is empty
        if (batchNamesFlat.length === 0) {
          for (const entry of subjects) {
            for (const g of entry.grades) {
              if (g.has_group && Array.isArray(g.batches)) {
                for (const bc of g.batches) {
                  if (bc.name) batchNamesFlat.push(bc.name)
                }
              }
            }
          }
        }

        const batchOne = batchNamesFlat[0] ?? ''
        const batchTwo = batchNamesFlat[1] ?? batchOne  // reuse first if only one

        exampleInput = {
          firstSubject: firstSubject,
          firstGrade:   fGrade,
          firstBatch:   batchOne,
          secondBatch:  batchTwo,
          indivFee,
        }
      }
    }
  } catch {
    // Auth or DB failure — silently fall back to generic template
  }

  // ── Assemble the CSV ──────────────────────────────────────────────────────
  const commentBlock  = buildCommentBlock(templateData)
  const headerRow     = COLUMNS.join(',')
  const exampleRows   = buildExampleRows(exampleInput)

  const csv = [commentBlock, headerRow, exampleRows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv',
      'Content-Disposition': 'attachment; filename="smartclaz-students-template.csv"',
    },
  })
}
