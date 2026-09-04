/**
 * Who the company is and where it is — declared once.
 *
 * There is exactly one address, and this is it. It used to be written out in
 * the footer and, differently, on the contact page, which is how a site ends up
 * telling two people two different things about where it is. Anything that
 * needs to name or locate the company reads it from here, so a change lands
 * everywhere at once and a second address cannot quietly appear beside it.
 *
 * The lines are kept as an array rather than one string because that is how a
 * postal address is actually set: each line is a line, and the markup decides
 * the separator. Joining with ", " for a meta tag is a formatting choice; the
 * data underneath stays the same in both places.
 */

export const COMPANY_NAME = 'BlackGATE';

/** The name used where a legal entity is meant — the address block, the copyright line. */
export const COMPANY_LEGAL_NAME = 'BlackGATE Technologies';

/** The registered office, one line per line. */
export const COMPANY_ADDRESS_LINES = [
  'E 342, RIICO Growth Centre',
  'Bhilwara, Rajasthan 311025',
  'India',
] as const;

/** The same address on one line, for meta tags and anywhere markup cannot break. */
export const COMPANY_ADDRESS_INLINE = COMPANY_ADDRESS_LINES.join(', ');

/** The registered office with the entity on top of it, as it is set in the footer. */
export const COMPANY_ADDRESS_BLOCK = [COMPANY_LEGAL_NAME, ...COMPANY_ADDRESS_LINES] as const;
