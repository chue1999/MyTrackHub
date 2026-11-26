/** CCare password rules for a password a person sets (same as the API): 6–8 letters/digits, A–Z, a–z, 0–9. */
export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 8

export function passwordChecks(pw: string) {
  return [
    { label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
    { label: 'One upper-case letter (A–Z)', ok: /[A-Z]/.test(pw) },
    { label: 'One lower-case letter (a–z)', ok: /[a-z]/.test(pw) },
    { label: 'One digit (0–9)', ok: /[0-9]/.test(pw) },
    { label: 'Only letters and digits', ok: pw.length > 0 && /^[A-Za-z0-9]+$/.test(pw) },
  ]
}

export const passwordOk = (pw: string) => passwordChecks(pw).every((c) => c.ok)
