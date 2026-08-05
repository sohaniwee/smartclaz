// tutors.subjects JSONB — signup v2 shape
// [{
//   subject: "Mathematics",
//   grades: [{
//     grade: "A/L",
//     has_individual: true,
//     individual_fee: 5000,
//     individual_duration_mins: 60,
//     individual_slots: [{ day: "Monday", time: "15:00" }],
//     taking_new_individual: true,
//     individual_trial_type: "paid",
//     individual_trial_fee: 500,
//     has_group: true,
//     batches: [{ name, day, time, duration_mins, monthly_fee, max_students, accepting_new, trial_type, trial_fee }]
//   }]
// }]

export type TrialType = 'none' | 'free' | 'paid'

export type IndividualSlot = {
  day: string   // e.g. "Monday"
  time: string  // e.g. "15:00"
}

export type BatchConfig = {
  id?: string           // DB-assigned uuid (present after first save)
  name: string          // e.g. "A/L Maths 2027 Batch"
  day: string           // e.g. "Saturday"
  time: string          // e.g. "09:00"
  duration_mins: number
  monthly_fee: number   // LKR per student per month
  max_students: number
  accepting_new: boolean
  trial_type: TrialType
  trial_fee: number     // only meaningful when trial_type === 'paid'
}

export type GradeConfig = {
  grade: string

  // Individual class settings
  has_individual: boolean
  individual_fee: number           // LKR per session
  individual_duration_mins: number
  individual_slots: IndividualSlot[]
  taking_new_individual: boolean
  individual_trial_type: TrialType
  individual_trial_fee: number     // only when individual_trial_type === 'paid'

  // Group class settings
  has_group: boolean
  batches: BatchConfig[]
}

export type SubjectEntry = {
  subject: string
  grades: GradeConfig[]
}

// Derive teaching_style from subjects — saved to tutors.teaching_style
export function detectTeachingStyle(
  subjects: SubjectEntry[],
): 'individual' | 'group' | 'both' {
  let hasInd = false
  let hasGrp = false
  for (const s of subjects) {
    for (const g of s.grades) {
      if (g.has_individual) hasInd = true
      if (g.has_group && g.batches.length > 0) hasGrp = true
    }
  }
  if (hasInd && hasGrp) return 'both'
  if (hasGrp) return 'group'
  return 'individual'
}

// Find the GradeConfig for a given subject + grade
export function findGrade(
  subjects: SubjectEntry[],
  subject: string,
  grade: string,
): GradeConfig | undefined {
  return subjects
    .find(s => s.subject.toLowerCase() === subject.toLowerCase())
    ?.grades.find(g => g.grade.toLowerCase() === grade.toLowerCase())
}

// Format the full subjects list into a WhatsApp-ready string
export function formatSubjectsForWhatsApp(subjects: SubjectEntry[]): string {
  return subjects
    .map((s, i) => {
      const gradeLines = s.grades
        .map(g => {
          const parts: string[] = []
          if (g.has_individual && g.individual_fee) {
            parts.push(`LKR ${g.individual_fee.toLocaleString()}/session (individual)`)
          }
          if (g.has_group && g.batches.length > 0) {
            const fees = [...new Set(g.batches.map(b => b.monthly_fee))]
            parts.push(`LKR ${fees.map(f => f.toLocaleString()).join('/')}/mo (group)`)
          }
          const trial = g.has_individual
            ? g.individual_trial_type === 'free'
              ? 'Free trial'
              : g.individual_trial_type === 'paid' && g.individual_trial_fee
              ? `LKR ${g.individual_trial_fee.toLocaleString()} trial`
              : ''
            : ''
          if (trial) parts.push(trial)
          return `  • ${g.grade}: ${parts.join(' / ') || 'fee on request'}`
        })
        .join('\n')
      return `${i + 1}. *${s.subject}*\n${gradeLines}`
    })
    .join('\n\n')
}

// Format a single fee for a booking confirmation message
export function formatFeeForConfirmation(
  subjects: SubjectEntry[],
  subject: string,
  grade: string,
  classType: 'individual' | 'batch' | 'trial',
  batchId?: string,
): string {
  const g = findGrade(subjects, subject, grade)
  if (!g) return 'fee on request'

  if (classType === 'trial') {
    if (!g.has_individual || g.individual_trial_type === 'none') return 'Trial not available'
    return g.individual_trial_type === 'free'
      ? 'Free (trial class)'
      : `LKR ${g.individual_trial_fee.toLocaleString()} (trial)`
  }
  if (classType === 'batch') {
    const batch = batchId
      ? g.batches.find(b => b.id === batchId)
      : g.batches[0]
    return batch ? `LKR ${batch.monthly_fee.toLocaleString()}/month` : 'fee on request'
  }
  return g.has_individual && g.individual_fee
    ? `LKR ${g.individual_fee.toLocaleString()}/session`
    : 'fee on request'
}
