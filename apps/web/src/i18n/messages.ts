import type { fr } from './fr.js'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAME: Record<Locale, string> = { fr: 'Français', en: 'English' }

/**
 * The shape every language fills in, taken from the French catalogue, which is the
 * reference one. Variable entries are whole-sentence functions so each language owns
 * its grammar.
 */
export type Messages = typeof fr
