export type PassphraseStrength = 'weak' | 'fair' | 'strong';

/** Rough guidance only; a weak passphrase is warned about, never refused. */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(passphrase),
  ).length;
  if (passphrase.length < 10) return 'weak';
  if (passphrase.length >= 16 || (passphrase.length >= 12 && classes >= 3)) return 'strong';
  return 'fair';
}
