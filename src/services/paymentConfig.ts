/**
 * Which processor takes the buyer's money.
 *
 * The client asks the server rather than deciding: the rail is a
 * business decision (which provider, which country, which fee), and a
 * client that picked its own would be picking a processor without the
 * keys to use it. The identifier that comes back is public — it names
 * the merchant and authorises nothing.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface PaymentConfig {
  rail: 'stripe' | 'airwallex';
  configured: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'production';
  currency: string;
  countryCode: string;
  publishableKey?: string | null;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const fn = getFunctions();
  const call = httpsCallable(fn, 'getPaymentConfig');
  const res = await call({});
  return res.data as PaymentConfig;
}
