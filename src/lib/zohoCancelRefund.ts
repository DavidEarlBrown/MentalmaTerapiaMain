import { supabase } from './supabaseClient';
import {
  createZohoBooksClient,
  refreshZohoAccessToken,
  isTokenError,
} from './zohoBooksClient';
import type { ClientRequest } from '../types';

export interface ZohoRefundCreditResult {
  posted: boolean;
  creditNoteId?: string;
  creditNoteNumber?: string;
  invoiceId?: string;
  amount?: number;
  warning?: string;
}

async function findLinkedInvoiceId(requestId: string): Promise<string | null> {
  const { data } = await supabase
    .from('payment_transactions')
    .select('zoho_invoice_id, payment_status, payment_amount')
    .eq('client_request_id', requestId)
    .order('payment_date', { ascending: false })
    .limit(8);

  const rows = data ?? [];
  const paid = rows.find((p) => {
    const status = String(p.payment_status ?? '').toLowerCase();
    return (status === 'completed' || status === 'paid') && p.zoho_invoice_id;
  });
  return paid?.zoho_invoice_id
    || rows.find((p) => p.zoho_invoice_id)?.zoho_invoice_id
    || null;
}

/**
 * Post a Zoho Books credit note for a refunded cancellation.
 * Does not throw: calendar/session cancel should still succeed if Zoho fails.
 */
export async function postZohoRefundCredit(params: {
  request: ClientRequest;
  amount?: number;
  currency?: string;
  language: string;
}): Promise<ZohoRefundCreditResult> {
  const { request, language } = params;
  if (!request.id) {
    return { posted: false, warning: 'No client request id for Zoho credit.' };
  }

  const invoiceId = await findLinkedInvoiceId(request.id);
  if (!invoiceId) {
    return {
      posted: false,
      warning: language === 'es'
        ? 'No se encontró factura Zoho vinculada para el crédito.'
        : 'No linked Zoho invoice found for the credit note.',
    };
  }

  let zoho = createZohoBooksClient();
  if (!zoho) {
    return {
      posted: false,
      warning: language === 'es'
        ? 'Zoho Books no está configurado.'
        : 'Zoho Books is not configured.',
    };
  }

  const run = async () => {
    const invoiceRes = await zoho!.getInvoice(invoiceId);
    const invoice = invoiceRes.invoice;
    if (!invoice?.customer_id) {
      throw new Error('Zoho invoice is missing customer_id');
    }

    const invoiceTotal = Number(invoice.total) || 0;
    const amount = Math.round((params.amount && params.amount > 0 ? params.amount : invoiceTotal) * 100) / 100;
    if (amount <= 0) {
      return {
        posted: false,
        invoiceId,
        warning: language === 'es'
          ? 'El monto del crédito es cero.'
          : 'Credit amount is zero.',
      };
    }

    const notes = language === 'es'
      ? `Crédito por cancelación de sesión (solicitud ${request.id}).`
      : `Credit for cancelled session (request ${request.id}).`;

    const created = await zoho!.createCreditNote({
      customerId: invoice.customer_id,
      amount,
      currencyCode: params.currency || invoice.currency_code || request.price_currency || 'COP',
      referenceNumber: `CN-CANCEL-${request.id}`.slice(0, 50),
      notes,
      lineName: language === 'es' ? 'Crédito por cancelación' : 'Cancellation credit',
      lineDescription: notes,
    });

    const creditNoteId = created.creditnote?.creditnote_id;
    if (creditNoteId) {
      try {
        await zoho!.applyCreditNoteToInvoice(creditNoteId, invoiceId, amount);
      } catch (applyErr) {
        console.warn('Zoho credit note created but could not apply to invoice (often already paid):', applyErr);
      }
    }

    return {
      posted: Boolean(creditNoteId),
      creditNoteId,
      creditNoteNumber: created.creditnote?.creditnote_number,
      invoiceId,
      amount,
    };
  };

  try {
    return await run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTokenError(msg)) {
      const token = await refreshZohoAccessToken();
      if (token) {
        zoho = createZohoBooksClient();
        try {
          return await run();
        } catch (retryErr) {
          console.error('Zoho refund credit retry failed:', retryErr);
          return {
            posted: false,
            invoiceId,
            warning: retryErr instanceof Error ? retryErr.message : msg,
          };
        }
      }
    }
    console.error('Zoho refund credit failed:', err);
    return { posted: false, invoiceId, warning: msg };
  }
}
