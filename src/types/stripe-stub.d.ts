declare module '@stripe/stripe-react-native' {
  export interface Stripe {
    confirmPayment: (
      clientSecret: string,
      options: {
        paymentMethodType: 'Card';
        paymentMethodData?: {
          card?: {
            number?: string;
            expMonth?: number;
            expYear?: number;
            cvc?: string;
          };
        };
      }
    ) => Promise<{ error?: { message: string }; paymentIntent?: any }>;
  }
  export function loadStripe(key: string): Promise<Stripe | null>;
}
