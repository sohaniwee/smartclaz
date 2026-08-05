'use client'

import Link from 'next/link'
import {
  GraduationCap, UserPen, Plug2, BotMessageSquare,
  MessageCircle, Link2, AlarmClock, LayoutDashboard,
  Mail,
} from 'lucide-react'

const steps = [
  { count: '01', icon: UserPen, title: 'Set up your profile', desc: 'Add your subjects, fees, availability, and payment details in minutes.' },
  { count: '02', icon: Plug2, title: 'Connect your channels', desc: 'Keep the apps your students already message you on. Nothing new to learn.' },
  { count: '03', icon: BotMessageSquare, title: 'Students message you', desc: 'Everything is handled automatically — bookings, class links, and reminders. You stay in control.' },
]

const features = [
  { icon: MessageCircle, title: 'Seamless Communication', desc: 'Students message you as usual. Smartclaz captures their details, automatically shares payment instructions, and helps schedule classes.' },
  { icon: Link2, title: 'Instant Class Links', desc: 'Once payment is confirmed, class links are generated and shared automatically—making it easy for students to join on time.' },
  { icon: AlarmClock, title: 'Automatic Reminders', desc: 'Smartclaz sends timely reminders before each class, helping students stay prepared and reducing missed sessions.' },
  { icon: LayoutDashboard, title: 'Dashboard Overview', desc: 'Get a complete view of your teaching activity—today\'s sessions, pending payments, student details, and upcoming classes—all in one place.' },
]

const plans = [
  {
    name: 'Free Trial',
    cur: null,
    num: 'LKR 0',
    per: 'for 30 days',
    desc: 'All features unlocked, no commitment.',
    features: ['All features included', 'Up to 10 students', '5-minute setup'],
    featured: false,
    cta: 'Start Free',
    ctaStyle: 'ghost',
  },
  {
    name: 'Starter',
    cur: 'LKR',
    num: '990',
    per: 'per month',
    desc: 'Up to 10 students.',
    features: ['WhatsApp integration included', 'Auto class links', 'Payment tracking'],
    featured: false,
    cta: 'Get Started',
    ctaStyle: 'ghost',
  },
  {
    name: 'Growth',
    cur: 'LKR',
    num: '1,990',
    per: 'per month',
    desc: 'Up to 30 students.',
    features: ['Everything in Starter', 'Batch class management', 'Priority support'],
    featured: true,
    cta: 'Get Started',
    ctaStyle: 'light',
  },
  {
    name: 'Pro',
    cur: 'LKR',
    num: '3,490',
    per: 'per month',
    desc: 'Up to 60 students.',
    features: ['Everything in Growth', 'Advanced analytics', 'Dedicated support'],
    featured: false,
    cta: 'Get Started',
    ctaStyle: 'ghost',
  },
]

const iconBoxBase = 'relative overflow-hidden w-[58px] h-[58px] rounded-[16px] grid place-items-center mb-[22px] transition-all duration-250'
const iconBoxIdle = 'text-[#3b5bdb] border border-[rgba(59,91,219,0.16)]'

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#0e1f3b', background: '#fff', lineHeight: 1.5, WebkitFontSmoothing: 'antialiased' }}>

      {/* ── NAVBAR ── */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'saturate(200%) blur(16px)',
          WebkitBackdropFilter: 'saturate(200%) blur(16px)',
          borderBottom: '1px solid rgba(14,31,59,0.08)',
          boxShadow: '0 1px 0 rgba(14,31,59,0.04)',
        }}
      >
        <div className="max-w-[1160px] mx-auto px-6 md:px-8 flex items-center justify-between h-[68px]">

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-[10px] font-extrabold text-[20px] tracking-[-0.03em] text-[#0e1f3b] flex-shrink-0"
          >
            <span
              className="w-[34px] h-[34px] rounded-[9px] grid place-items-center text-white flex-shrink-0"
              style={{
                background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
                boxShadow: '0 4px 12px rgba(59,91,219,0.38), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <GraduationCap size={18} strokeWidth={2.2} />
            </span>
            <span>Smart<span style={{ color: '#3b5bdb' }}>claz</span></span>
          </Link>

          {/* Nav links — centred */}
          <nav className="hidden md:flex items-center gap-1">
            {[['#how', 'How it works'], ['#features', 'Features'], ['#pricing', 'Pricing']].map(([href, label]) => (
              <a
                key={label}
                href={href}
                className="relative px-4 py-2 rounded-[8px] font-medium text-[14.5px] transition-all duration-150"
                style={{ color: '#51607a' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#0e1f3b'
                  e.currentTarget.style.background = 'rgba(14,31,59,0.05)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#51607a'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Auth actions */}
          <div className="flex items-center gap-2">
            {/* Divider — desktop only */}
            <div className="hidden md:block w-px h-5 mx-1" style={{ background: '#e0e4ed' }} />

            <Link
              href="/login"
              className="hidden md:inline-flex items-center font-semibold text-[14px] rounded-[8px] px-4 py-[9px] transition-all duration-150"
              style={{ color: '#0e1f3b' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(14,31,59,0.06)'
                e.currentTarget.style.color = '#3b5bdb'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#0e1f3b'
              }}
            >
              Log in
            </Link>

            <Link
              href="/signup"
              className="inline-flex items-center font-semibold text-[14px] text-white rounded-[9px] px-5 py-[9px] transition-all duration-150 hover:-translate-y-px"
              style={{
                background: 'linear-gradient(150deg, #5272e8 0%, #3b5bdb 100%)',
                boxShadow: '0 4px 14px rgba(59,91,219,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(150deg, #4263d6 0%, #3450c4 100%)'
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(59,91,219,0.42), inset 0 1px 0 rgba(255,255,255,0.18)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(150deg, #5272e8 0%, #3b5bdb 100%)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,91,219,0.32), inset 0 1px 0 rgba(255,255,255,0.18)'
              }}
            >
              Start Free Trial
            </Link>
          </div>

        </div>
      </header>

      {/* ── HERO ── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: '#0c1c37', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* concentric ring pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-radial-gradient(circle at 50% 44%, rgba(140,164,255,0.16) 0 1px, transparent 1px 62px)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 44%, #000 6%, transparent 60%)',
            maskImage: 'radial-gradient(circle at 50% 44%, #000 6%, transparent 60%)',
          }}
        />
        {/* center glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%', top: '44%', transform: 'translate(-50%,-50%)',
            width: 480, height: 480,
            background: 'radial-gradient(circle, rgba(91,123,235,0.5) 0%, rgba(59,91,219,0) 62%)',
            filter: 'blur(8px)',
          }}
        />
        {/* floating orbs */}
        {[
          { style: { left: 'calc(50% + 150px)', top: 'calc(44% - 160px)', width: 9, height: 9 } },
          { style: { left: 'calc(50% - 240px)', top: 'calc(44% + 20px)', width: 6, height: 6 } },
          { style: { left: 'calc(50% + 220px)', top: 'calc(44% + 120px)', width: 7, height: 7 } },
          { style: { left: 'calc(50% - 150px)', top: 'calc(44% - 180px)', width: 5, height: 5 } },
        ].map((orb, i) => (
          <span
            key={i}
            className="absolute rounded-full pointer-events-none z-[1]"
            style={{ ...orb.style, background: '#9db2ff', boxShadow: '0 0 12px rgba(157,178,255,0.9)' }}
          />
        ))}

        <div className="relative z-[2] max-w-[1160px] mx-auto px-8 text-center py-[116px] md:py-[128px]">
          <span
            className="inline-flex items-center gap-[9px] px-4 py-2 rounded-full mb-[30px] text-[14px] font-semibold border"
            style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)', color: '#c9d4f5' }}
          >
            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: '#6f8bff' }} />
            Built for online teachers
          </span>

          <h1
            className="font-extrabold leading-[1.04] mx-auto mb-0"
            style={{ fontSize: 'clamp(40px, 6vw, 68px)', letterSpacing: '-0.03em', maxWidth: '14ch', textWrap: 'balance', textShadow: '0 2px 28px rgba(8,18,38,0.55)' }}
          >
            The <span style={{ color: '#8ea4ff' }}>smarter</span> way to run your <span style={{ color: '#8ea4ff' }}>classes</span>
          </h1>

          <p className="mt-[26px] mx-auto font-normal" style={{ maxWidth: '46ch', fontSize: 'clamp(17px, 2vw, 20px)', color: '#aab6d2' }}>
            Organize, automate, and grow your classes.{' '}
            <span className="block mt-[6px] font-semibold" style={{ color: '#d6def5' }}>Manage less. Teach more.</span>
          </p>

          <div className="flex gap-[14px] justify-center flex-wrap mt-[40px]">
            <Link
              href="/signup"
              className="inline-flex items-center font-semibold text-[16px] text-[#0e1f3b] rounded-[10px] px-7 py-4 transition-all duration-150 hover:-translate-y-px bg-white"
              style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 26px rgba(0,0,0,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)' }}
            >
              Start Free Trial
            </Link>
            <a
              href="#how"
              className="inline-flex items-center font-semibold text-[16px] text-white rounded-[10px] px-7 py-4 transition-all duration-150 border"
              style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.28)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.background = 'transparent' }}
            >
              See how it works
            </a>
          </div>

          <p className="mt-[22px] text-[13.5px]" style={{ color: '#7e8cab' }}>
            30-day free trial · No credit card needed · Set up in under 10 minutes
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="py-[104px] bg-white">
        <div className="max-w-[1160px] mx-auto px-8">

          {/* Header */}
          <div className="text-center max-w-[560px] mx-auto mb-16">
            <span
              className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-[0.08em] uppercase mb-4 px-3 py-1.5 rounded-full"
              style={{ color: '#3b5bdb', background: '#edf2ff', border: '1px solid #dbe4ff' }}
            >
              How it works
            </span>
            <h2 className="font-extrabold leading-[1.1] mt-1" style={{ fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.025em', color: '#0e1f3b' }}>
              Up and running in 3 steps
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: '#51607a' }}>
              Set up your account once, connect your preferred channels, and let Smartclaz automatically manage bookings, class links, and reminders.
            </p>
          </div>

          {/* Steps */}
          <div className="relative grid md:grid-cols-3 gap-6">

            {/* Connector line — desktop only */}
            <div
              className="hidden md:block absolute top-[38px] left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] h-px"
              style={{ background: 'linear-gradient(90deg, #dbe4ff 0%, #c5d0fb 50%, #dbe4ff 100%)' }}
            />

            {steps.map(({ count, icon: Icon, title, desc }) => (
              <div
                key={count}
                className="group relative flex flex-col rounded-[20px] p-8 transition-all duration-200 hover:-translate-y-[4px]"
                style={{
                  background: '#fff',
                  border: '1px solid #e8ecf4',
                  boxShadow: '0 2px 8px rgba(14,31,59,0.05)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(59,91,219,0.12)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = '#c5d0fb'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(14,31,59,0.05)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = '#e8ecf4'
                }}
              >
                {/* Step number badge */}
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="relative w-[52px] h-[52px] rounded-[14px] grid place-items-center flex-shrink-0 transition-all duration-200"
                    style={{
                      background: 'linear-gradient(145deg, #edf2ff 0%, #dbe4ff 100%)',
                      border: '1px solid #c5d0fb',
                      color: '#3b5bdb',
                    }}
                    ref={el => {
                      if (!el) return
                      const parent = el.closest('.group') as HTMLElement | null
                      if (!parent) return
                      const enter = () => {
                        el.style.background = 'linear-gradient(145deg, #3b5bdb 0%, #2f49b8 100%)'
                        el.style.borderColor = 'transparent'
                        el.style.color = '#fff'
                        el.style.boxShadow = '0 6px 18px rgba(59,91,219,0.35)'
                      }
                      const leave = () => {
                        el.style.background = 'linear-gradient(145deg, #edf2ff 0%, #dbe4ff 100%)'
                        el.style.borderColor = '#c5d0fb'
                        el.style.color = '#3b5bdb'
                        el.style.boxShadow = ''
                      }
                      parent.addEventListener('mouseenter', enter)
                      parent.addEventListener('mouseleave', leave)
                    }}
                  >
                    <Icon size={24} strokeWidth={2} />
                  </div>
                  <span
                    className="text-[11px] font-black tracking-[0.12em] uppercase"
                    style={{ color: '#b0bcd4' }}
                  >
                    Step {count}
                  </span>
                </div>

                <h3
                  className="text-[18px] font-bold mb-3"
                  style={{ letterSpacing: '-0.018em', color: '#0e1f3b' }}
                >
                  {title}
                </h3>
                <p className="text-[15px] leading-relaxed" style={{ color: '#51607a' }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-[104px]" style={{ background: '#f0f4ff' }}>
        <div className="max-w-[1160px] mx-auto px-8">

          {/* Header */}
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span
              className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-[0.08em] uppercase mb-4 px-3 py-1.5 rounded-full"
              style={{ color: '#3b5bdb', background: '#edf2ff', border: '1px solid #dbe4ff' }}
            >
              Features
            </span>
            <h2 className="font-extrabold leading-[1.1] mt-1" style={{ fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.025em', color: '#0e1f3b' }}>
              Everything between you and teaching
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: '#51607a' }}>
              From your first student inquiry to every class you teach, Smartclaz manages students, sessions, reminders, class links, and payments—all in one streamlined dashboard.
            </p>
          </div>

          {/* Feature cards — horizontal icon+text rows, 2 col */}
          <div className="grid md:grid-cols-2 gap-4 max-w-[980px] mx-auto">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group flex items-start gap-5 rounded-[16px] p-6 transition-all duration-200 hover:-translate-y-[2px]"
                style={{
                  background: '#ffffff',
                  border: '1px solid #dbe4ff',
                  boxShadow: '0 2px 6px rgba(59,91,219,0.06)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 10px 28px rgba(59,91,219,0.12)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = '#b8c8ff'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 6px rgba(59,91,219,0.06)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = '#dbe4ff'
                }}
              >
                {/* Icon */}
                <div
                  className="w-[44px] h-[44px] rounded-[12px] grid place-items-center flex-shrink-0 mt-0.5"
                  style={{
                    background: 'linear-gradient(145deg, #edf2ff 0%, #dbe4ff 100%)',
                    border: '1px solid #c5d0fb',
                    color: '#3b5bdb',
                  }}
                >
                  <Icon size={21} strokeWidth={2} />
                </div>

                {/* Text */}
                <div>
                  <h3 className="text-[16.5px] font-bold mb-1.5" style={{ letterSpacing: '-0.016em', color: '#0e1f3b' }}>
                    {title}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed" style={{ color: '#51607a' }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-[104px] bg-white">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span
              className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-[0.08em] uppercase mb-4 px-3 py-1.5 rounded-full"
              style={{ color: '#3b5bdb', background: '#edf2ff', border: '1px solid #dbe4ff' }}
            >
              Pricing
            </span>
            <h2 className="font-extrabold leading-[1.1] mt-1" style={{ fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.025em', color: '#0e1f3b' }}>
              Plans that grow with your classes
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: '#51607a' }}>
              Start free. Upgrade as your batches fill up. Cancel anytime.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {plans.map(({ name, cur, num, per, desc, features: planFeatures, featured, cta, ctaStyle }) => (
              <div
                key={name}
                className="relative rounded-[20px] p-[30px_24px] flex flex-col transition-all duration-200 hover:-translate-y-[5px]"
                style={
                  featured
                    ? {
                        background: '#0e1f3b',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 20px 50px rgba(14,31,59,0.3), 0 4px 12px rgba(14,31,59,0.15)',
                      }
                    : {
                        background: '#ffffff',
                        border: '1px solid #e2e8f8',
                        boxShadow: '0 2px 8px rgba(14,31,59,0.06)',
                      }
                }
                onMouseEnter={e => {
                  if (!featured) {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 40px rgba(14,31,59,0.1)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = '#c5d0fb'
                  }
                }}
                onMouseLeave={e => {
                  if (!featured) {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(14,31,59,0.06)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f8'
                  }
                }}
              >
                {featured && (
                  <span
                    className="absolute -top-[13px] left-1/2 -translate-x-1/2 text-[11.5px] font-bold tracking-[0.05em] uppercase text-white px-[14px] py-[5px] rounded-full whitespace-nowrap"
                    style={{ background: '#3b5bdb', boxShadow: '0 4px 14px rgba(59,91,219,0.5)' }}
                  >
                    Most popular
                  </span>
                )}

                {/* Plan name */}
                <div className="font-bold text-[13px] tracking-[0.06em] uppercase mb-5" style={{ color: featured ? '#93adff' : '#3b5bdb' }}>
                  {name}
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-1">
                  {cur && <span className="text-[14px] font-semibold" style={{ color: featured ? '#7d9aee' : '#8a97ad' }}>{cur}</span>}
                  <span className="text-[36px] font-extrabold leading-none" style={{ letterSpacing: '-0.03em', color: featured ? '#ffffff' : '#0e1f3b' }}>
                    {num}
                  </span>
                </div>
                <div className="text-[13px] mb-5" style={{ color: featured ? '#7d9aee' : '#8a97ad' }}>{per}</div>

                {/* Divider */}
                <div className="mb-5 h-px" style={{ background: featured ? 'rgba(255,255,255,0.1)' : '#e8ecf4' }} />

                <p className="text-[13.5px] mb-5 min-h-[36px]" style={{ color: featured ? '#aabde8' : '#51607a' }}>{desc}</p>

                <ul className="flex flex-col gap-3 mb-7 flex-1">
                  {planFeatures.map(f => (
                    <li key={f} className="flex items-start gap-[9px] text-[13.5px]" style={{ color: featured ? '#c2d2f0' : '#374151' }}>
                      <span
                        className="mt-[2px] w-[16px] h-[16px] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                        style={{
                          background: featured ? 'rgba(255,255,255,0.15)' : '#edf2ff',
                          color: featured ? '#fff' : '#3b5bdb',
                        }}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center font-semibold text-[14px] rounded-[10px] px-5 py-3 transition-all duration-150 hover:-translate-y-px"
                  style={
                    featured
                      ? { background: '#fff', color: '#3b5bdb', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }
                      : { background: '#0e1f3b', color: '#fff', boxShadow: '0 4px 14px rgba(14,31,59,0.25)' }
                  }
                  onMouseEnter={e => {
                    if (featured) { e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)' }
                    else { e.currentTarget.style.background = '#162844'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(14,31,59,0.35)' }
                  }}
                  onMouseLeave={e => {
                    if (featured) { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)' }
                    else { e.currentTarget.style.background = '#0e1f3b'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(14,31,59,0.25)' }
                  }}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative pt-[76px] pb-9 text-white" style={{ background: '#0e1f3b' }}>
        {/* gradient top line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(110,139,255,0.55), transparent)' }}
        />

        <div className="max-w-[1160px] mx-auto px-8">
          <div
            className="grid gap-10 pb-12 mb-0 border-b"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            {/* Brand */}
            <div className="col-span-full md:col-span-1" style={{ gridColumn: 'span 1' }}>
              <Link href="/" className="inline-flex items-center gap-[11px] font-extrabold text-[21px] tracking-[-0.025em] text-white mb-4">
                <span
                  className="relative w-9 h-9 rounded-[11px] grid place-items-center"
                  style={{
                    background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
                    boxShadow: '0 6px 14px rgba(59,91,219,0.4), inset 0 1px 0 rgba(255,255,255,0.45)',
                  }}
                >
                  <GraduationCap size={20} strokeWidth={2.2} />
                </span>
                <span>Smart<span style={{ color: '#8ea4ff' }}>claz</span></span>
              </Link>
              <p className="text-[14.5px] max-w-[30ch]" style={{ color: '#93a0bd' }}>
                The smarter way for teachers to run online classes.
              </p>
              <div className="flex gap-[10px] mt-5">
                {[
                  { label: 'Email', node: <Mail size={18} strokeWidth={2} /> },
                  {
                    label: 'Facebook', node: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                      </svg>
                    ),
                  },
                  {
                    label: 'Instagram', node: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                      </svg>
                    ),
                  },
                  { label: 'WhatsApp', node: <MessageCircle size={18} strokeWidth={2} /> },
                ].map(({ label, node }) => (
                  <a
                    key={label}
                    href="#"
                    aria-label={label}
                    className="w-[38px] h-[38px] rounded-[10px] grid place-items-center border transition-all duration-150 hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: '#c2cce0' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#3b5bdb'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#c2cce0' }}
                  >
                    {node}
                  </a>
                ))}
              </div>
            </div>

            {/* Product */}
            <div className="flex flex-col gap-3">
              <h4 className="text-[13px] font-bold tracking-[0.06em] uppercase mb-[18px]" style={{ color: '#7e8cab' }}>Product</h4>
              {[['#how', 'How it works'], ['#features', 'Features'], ['#pricing', 'Pricing']].map(([href, label]) => (
                <a key={label} href={href} className="text-[15px] transition-colors duration-150" style={{ color: '#c2cce0' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#c2cce0' }}>
                  {label}
                </a>
              ))}
            </div>

            {/* Company */}
            <div className="flex flex-col gap-3">
              <h4 className="text-[13px] font-bold tracking-[0.06em] uppercase mb-[18px]" style={{ color: '#7e8cab' }}>Company</h4>
              {[['#', 'About'], ['#', 'Contact'], ['#', 'Blog']].map(([href, label]) => (
                <a key={label} href={href} className="text-[15px] transition-colors duration-150" style={{ color: '#c2cce0' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#c2cce0' }}>
                  {label}
                </a>
              ))}
            </div>

            {/* Support */}
            <div className="flex flex-col gap-3">
              <h4 className="text-[13px] font-bold tracking-[0.06em] uppercase mb-[18px]" style={{ color: '#7e8cab' }}>Support</h4>
              {[['#', 'Help centre'], ['#', 'WhatsApp us'], ['#', 'Privacy']].map(([href, label]) => (
                <a key={label} href={href} className="text-[15px] transition-colors duration-150" style={{ color: '#c2cce0' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#c2cce0' }}>
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-7">
            <p className="text-[14px]" style={{ color: '#7e8cab' }}>© 2026 Smartclaz. All rights reserved.</p>
            <div className="flex gap-[22px]">
              {[['#', 'Privacy'], ['#', 'Terms']].map(([href, label]) => (
                <a key={label} href={href} className="text-[14px] transition-colors duration-150" style={{ color: '#93a0bd' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#93a0bd' }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
