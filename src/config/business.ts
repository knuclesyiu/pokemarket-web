/**
 * The business details.
 *
 * Airwallex's payment method review looks at the website and checks
 * that it carries the business's own details: the company name, the
 * business registration number, an address, an email and a phone
 * number, plus the policies. They are all here so that changing one
 * is a one-line edit, and the same values feed the app, the public
 * page and the static copy the hosting serves.
 *
 * Anything marked TODO is not filled in yet — it is not invented.
 */
export const BUSINESS = {
  /** The registered company that runs the marketplace. */
  companyName: 'Ming Tai Advisory Limited',

  /**
   * The Hong Kong Companies Registry number (CR No.).
   *
   * TODO: fill in. It is on the Companies Registry search result for
   * the company and on the Airwallex application.
   */
  registrationNumber: 'TO BE CONFIRMED',

  /**
   * The business address.
   *
   * TODO: fill in. It must be the registered address of the company.
   */
  address: 'TO BE CONFIRMED',

  /**
   * The address buyers and sellers write to.
   *
   * A business address on the company's own domain, not a personal
   * one. The alias has to exist: a payment provider may well send
   * mail to it during the review.
   *
   * TODO: set up the alias and put it here.
   */
  supportEmail: 'contact@mingtai-cpa.com',

  /**
   * The phone number a reviewer can call.
   *
   * A company line, not a personal mobile.
   *
   * TODO: fill in.
   */
  supportPhone: 'TO BE CONFIRMED',

  /** The marketplace itself. */
  siteUrl: 'https://pokemarket-255c6.web.app',

  /** The currency every price is shown in. */
  currency: 'HKD',

  /** The governing law the terms are written under. */
  governingLaw: 'Hong Kong Special Administrative Region',

  /** The company registry the registration number comes from. */
  registry: 'Hong Kong Companies Registry',
} as const;

/** The payment methods the marketplace takes. */
export const PAYMENT_METHODS = [
  'Visa',
  'Mastercard',
  'FPS (轉數快)',
] as const;
