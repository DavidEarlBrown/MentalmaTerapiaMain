import emailjs from '@emailjs/browser';

export interface PaymentConfirmationEmailParams {
  clientName: string;
  clientEmail: string;
  paymentAmount: number;
  paymentCurrency: string;
  paymentMethod: string;
  paymentDate: string;
  transactionReference?: string;
  invoiceNumber?: string;
  numSessions?: number;
}

export interface EmailResult {
  success: boolean;
  message: string;
  error?: string;
}

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_PAYMENT_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
 console.log("Mailjs Template Name:     ",EMAILJS_TEMPLATE_ID);
export async function sendPaymentConfirmationEmail(
  params: PaymentConfirmationEmailParams,
  language: 'en' | 'es' = 'en'
): Promise<EmailResult> {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.warn('EmailJS not configured. Payment confirmation email not sent.');
    return {
      success: false,
      message: 'Email service not configured',
      error: 'EmailJS credentials missing in environment variables',
    };
  }

  try {
    const formattedDate = new Date(params.paymentDate).toLocaleDateString(
      language === 'es' ? 'es-ES' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    );

    const rawAmount = Number(params.paymentAmount);
    const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
    let formattedAmount = `${params.paymentCurrency || ''} ${safeAmount.toFixed(2)}`.trim();
    try {
      if (params.paymentCurrency) {
        formattedAmount = new Intl.NumberFormat(
          language === 'es' ? 'es-ES' : 'en-US',
          {
            style: 'currency',
            currency: params.paymentCurrency,
          }
        ).format(safeAmount);
      }
    } catch {
      formattedAmount = `${params.paymentCurrency || ''} ${safeAmount.toFixed(2)}`.trim();
    }
    console.log("client name:  ",params.clientName);
    const emailParams = {
      to_name: params.clientName,
      to_email: params.clientEmail,
      amount: formattedAmount,
      payment_amount: formattedAmount,
      paymentAmount: formattedAmount,
      currency: params.paymentCurrency || '',
      payment_currency: params.paymentCurrency || '',
      payment_method: params.paymentMethod,
      payment_date: formattedDate,
      transaction_reference: params.transactionReference || 'N/A',
      invoice_number: params.invoiceNumber || 'N/A',
      num_sessions: params.numSessions || 1,
      language: language,
    };

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      emailParams,
      EMAILJS_PUBLIC_KEY
    );

    if (response.status === 200) {
      console.log('Payment confirmation email sent successfully');
      return {
        success: true,
        message: 'Payment confirmation email sent successfully',
      };
    } else {
      throw new Error(`EmailJS returned status ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    return {
      success: false,
      message: 'Failed to send payment confirmation email',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendSimpleEmail(
  toEmail: string,
  subject: string,
  message: string
): Promise<EmailResult> {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY) {
    console.warn('EmailJS not configured. Email not sent.');
    return {
      success: false,
      message: 'Email service not configured',
      error: 'EmailJS credentials missing in environment variables',
    };
  }

  try {
    const simpleTemplateId = import.meta.env.VITE_EMAILJS_SIMPLE_TEMPLATE_ID || EMAILJS_TEMPLATE_ID;

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      simpleTemplateId,
      {
        to_email: toEmail,
        subject: subject,
        message: message,
      },
      EMAILJS_PUBLIC_KEY
    );

    if (response.status === 200) {
      return {
        success: true,
        message: 'Email sent successfully',
      };
    } else {
      throw new Error(`EmailJS returned status ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      message: 'Failed to send email',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function isEmailConfigured(): boolean {
  return !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}
