'use client'

import { createContext, useContext } from 'react'
import type { SubjectEntry } from '@/lib/types/subjects'

interface TutorCtx {
  subjects: SubjectEntry[]
}

export const TutorContext = createContext<TutorCtx>({ subjects: [] })

export const useTutor = () => useContext(TutorContext)
