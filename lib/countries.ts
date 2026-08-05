export type Country = {
  code: string
  name: string
  dialCode: string
  maxLength: number  // local number digits after the dial code
}

export const COUNTRIES: Country[] = [
  { code: 'LK', name: 'Sri Lanka',      dialCode: '+94',  maxLength: 9  },  // default
  { code: 'AU', name: 'Australia',      dialCode: '+61',  maxLength: 9  },
  { code: 'BD', name: 'Bangladesh',     dialCode: '+880', maxLength: 10 },
  { code: 'CA', name: 'Canada',         dialCode: '+1',   maxLength: 10 },
  { code: 'DE', name: 'Germany',        dialCode: '+49',  maxLength: 12 },
  { code: 'FR', name: 'France',         dialCode: '+33',  maxLength: 9  },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44',  maxLength: 10 },
  { code: 'ID', name: 'Indonesia',      dialCode: '+62',  maxLength: 11 },
  { code: 'IN', name: 'India',          dialCode: '+91',  maxLength: 10 },
  { code: 'MY', name: 'Malaysia',       dialCode: '+60',  maxLength: 10 },
  { code: 'NG', name: 'Nigeria',        dialCode: '+234', maxLength: 10 },
  { code: 'NL', name: 'Netherlands',    dialCode: '+31',  maxLength: 9  },
  { code: 'NZ', name: 'New Zealand',    dialCode: '+64',  maxLength: 9  },
  { code: 'PH', name: 'Philippines',    dialCode: '+63',  maxLength: 10 },
  { code: 'PK', name: 'Pakistan',       dialCode: '+92',  maxLength: 10 },
  { code: 'SG', name: 'Singapore',      dialCode: '+65',  maxLength: 8  },
  { code: 'AE', name: 'UAE',            dialCode: '+971', maxLength: 9  },
  { code: 'US', name: 'United States',  dialCode: '+1',   maxLength: 10 },
  { code: 'ZA', name: 'South Africa',   dialCode: '+27',  maxLength: 9  },
]

export const DEFAULT_COUNTRY = COUNTRIES[0]

export function findCountry(code: string): Country {
  return COUNTRIES.find(c => c.code === code) ?? DEFAULT_COUNTRY
}

export function validatePhone(phone: string, country: Country): string | undefined {
  if (!phone) return 'Please enter your mobile number.'
  if (country.code === 'LK') {
    if (!/^7[0-9]{8}$/.test(phone))
      return 'Enter a valid Sri Lankan mobile number (e.g. 71 234 5678).'
  } else {
    if (phone.length < 6 || phone.length > country.maxLength)
      return `Enter a valid ${country.name} mobile number.`
  }
}
