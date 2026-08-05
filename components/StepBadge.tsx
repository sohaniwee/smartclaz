interface StepBadgeProps {
  step: 1 | 2
  label: string
}

export default function StepBadge({ step, label }: StepBadgeProps) {
  const isStep1 = step === 1
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.72rem] font-bold mb-3.5"
      style={{
        background: isStep1 ? '#edf2ff' : '#ebfbee',
        color:      isStep1 ? '#3b5bdb' : '#2f9e44',
        border:     `1px solid ${isStep1 ? '#dbe4ff' : '#b2f2bb'}`,
      }}
    >
      <span>{isStep1 ? '①' : '②'}</span>
      <span>{label}</span>
    </div>
  )
}
