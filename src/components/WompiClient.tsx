/**
 * WompiClient — Wompi payment widget embedded in the Make a Payment panel.
 *
 * Flow
 * ────
 *  1. User reviews/edits amount, currency, invoice ref, name, e-mail.
 *     (All fields can be pre-filled from the parent PaymentForm.)
 *  2. Click "Make Payment with Wompi" → calls wompiApiClient.getWompiCheckoutParams()
 *     (server-side proxy) → redirects to Wompi hosted checkout.
 *  3. Wompi redirects back with ?id=<transactionId>.
 *  4. Component calls wompiApiClient.verifyWompiTransaction() to confirm status.
 *  5. On APPROVED → automatically creates a Zoho Books invoice + records payment.
 *     Results are displayed inline; no second button required.
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getWompiCheckoutParams,
  verifyWompiTransaction,
  redirectToWompiCheckout,
  toCOPCents,
  formatCOP,
  WOMPI_CURRENCIES,
} from '../lib/wompiApiClient';
import {
  createZohoBooksClient,
  refreshZohoAccessToken,
  isTokenError,
} from '../lib/zohoBooksClient';

// ── Session-storage key ────────────────────────────────────────────────────────

const SESSION_KEY = 'wompi_client_state';

interface SavedState {
  amount: number;
  currency: string;
  invoiceRef: string;
  customerName: string;
  customerEmail: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WompiClientProps {
  /** Pre-fill from parent PaymentForm — all optional */
  prefillAmount?: number;
  prefillCurrency?: string;
  prefillInvoiceRef?: string;
  prefillCustomerName?: string;
  prefillCustomerEmail?: string;
  /** Section to return to after Wompi redirect (default: "payment") */
  returnSection?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WompiClient({
  prefillAmount,
  prefillCurrency,
  prefillInvoiceRef,
  prefillCustomerName,
  prefillCustomerEmail,
  returnSection = 'payment',
}: WompiClientProps) {
  const { language } = useLanguage();
  const lbl = (en: string, es: string) => language === 'es' ? es : en;

  // ── Form state ───────────────────────────────────────────────────────────
  const [amount, setAmount]               = useState(prefillAmount ? String(prefillAmount) : '');
  const [currency, setCurrency]           = useState(prefillCurrency ?? 'COP');
  const [invoiceRef, setInvoiceRef]       = useState(prefillInvoiceRef ?? '');
  const [customerName, setCustomerName]   = useState(prefillCustomerName ?? '');
  const [customerEmail, setCustomerEmail] = useState(prefillCustomerEmail ?? '');

  // Update fields if parent passes new prefill values
  useEffect(() => { if (prefillAmount)       setAmount(String(prefillAmount)); }, [prefillAmount]);
  useEffect(() => { if (prefillCurrency)     setCurrency(prefillCurrency); },    [prefillCurrency]);
  useEffect(() => { if (prefillInvoiceRef)   setInvoiceRef(prefillInvoiceRef); },[prefillInvoiceRef]);
  useEffect(() => { if (prefillCustomerName) setCustomerName(prefillCustomerName); }, [prefillCustomerName]);
  useEffect(() => { if (prefillCustomerEmail)setCustomerEmail(prefillCustomerEmail);}, [prefillCustomerEmail]);

  // ── Status state ─────────────────────────────────────────────────────────
  type Status =
    | 'idle'
    | 'loading'
    | 'verifying'
    | 'approved'
    | 'declined'
    | 'error'
    | 'recording'
    | 'done';

  const [status, setStatus]             = useState<Status>('idle');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  // ── Detect Wompi redirect on mount ───────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txId  = params.get('id');
    const marker = params.get('wompi_client');
    if (!txId || marker !== '1') return;

    // Clean URL
    params.delete('id');
    params.delete('wompi_client');
    const qs = params.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (qs ? '?' + qs : ''),
    );

    // Restore saved form state
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as SavedState;
        setAmount(String(saved.amount));
        setCurrency(saved.currency);
        setInvoiceRef(saved.invoiceRef);
        setCustomerName(saved.customerName);
        setCustomerEmail(saved.customerEmail);
      } catch { /* ignore */ }
      sessionStorage.removeItem(SESSION_KEY);
    }

    setTransactionId(txId);
    setStatus('verifying');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: verify once we have a transaction ID ─────────────────────────
  useEffect(() => {
    if (status !== 'verifying' || !transactionId) return;

    const run = async () => {
      try {
        const tx = await verifyWompiTransaction(transactionId);
        if (tx.status === 'APPROVED') {
          setStatus('approved');
        } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(tx.status)) {
          setStatus('declined');
        } else {
          setStatus('error');
          setErrorMsg(lbl(
            `Unexpected transaction status: ${tx.status}`,
            `Estado de transacción inesperado: ${tx.status}`,
          ));
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    };
    run();
  }, [status, transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 3: auto-record to Zoho on approval ──────────────────────────────
  useEffect(() => {
    if (status !== 'approved') return;
    recordToZoho();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wompi checkout initiation ────────────────────────────────────────────
  const handleMakePayment = async () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      alert(lbl('Please enter a valid amount.', 'Por favor ingrese un monto válido.'));
      return;
    }
    if (!invoiceRef.trim()) {
      alert(lbl(
        'Please enter an invoice / reference number.',
        'Por favor ingrese un número de factura / referencia.',
      ));
      return;
    }

    setStatus('loading');
    setErrorMsg(null);

    try {
      const amtCOP   = toCOPCents(numericAmount, currency);
      const reference = `MPAY-${invoiceRef.trim().toUpperCase().replace(/\s+/g, '-')}-${Date.now()}`;
      const redirectUrl =
        `${window.location.origin}${window.location.pathname}?section=${returnSection}&wompi_client=1`;

      // Persist form data so we can restore it after the redirect
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        amount: numericAmount, currency, invoiceRef, customerName, customerEmail,
      } satisfies SavedState));

      const cp = await getWompiCheckoutParams({
        reference,
        amountInCents: amtCOP,
        currency: 'COP',
        clientEmail:  customerEmail || undefined,
        clientName:   customerName  || undefined,
        redirectUrl,
      });

      redirectToWompiCheckout(cp);
    } catch (err) {
      setStatus('idle');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // ── Zoho Books recording (called automatically after approval) ───────────
  const recordToZoho = async () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || !transactionId) return;

    setStatus('recording');
    setErrorMsg(null);

    const today = new Date().toISOString().split('T')[0];
    const name  = customerName.trim()  || lbl('Client', 'Cliente');
    const email = customerEmail.trim() || '';

    const doRecord = async () => {
      let zoho = createZohoBooksClient();
      if (!zoho) {
        const tok = await refreshZohoAccessToken();
        if (!tok) throw new Error(lbl(
          'Zoho not configured. Generate a token first.',
          'Zoho no configurado. Genere un token primero.',
        ));
        zoho = createZohoBooksClient();
        if (!zoho) throw new Error(lbl('Zoho client unavailable.', 'Cliente Zoho no disponible.'));
      }

      // Create invoice
      const inv = await zoho.createInvoice({
        customerName: name,
        customerEmail: email,
        invoiceDate: today,
        dueDate: today,
        currencyCode: currency,
        referenceNumber: invoiceRef.trim() || transactionId,
        lineItems: [{
          name: lbl('Wompi Payment', 'Pago Wompi'),
          description: `${lbl('Ref', 'Ref')} ${invoiceRef.trim()} — Wompi ${transactionId}`,
          rate: numericAmount,
          quantity: 1,
        }],
        notes: `Wompi transaction ID: ${transactionId}`,
      });
      const invoiceId = inv.invoice?.invoice_id ?? '';

      // Record payment
      if (invoiceId) {
        await zoho.recordPayment({
          invoiceId,
          amount: numericAmount,
          paymentDate: today,
          paymentMode: 'Wompi',
          referenceNumber: transactionId,
          currencyCode: currency,
          description: `Wompi — ref ${invoiceRef.trim()}`,
        });
      }

      return invoiceId;
    };

    try {
      await doRecord();
      setPaymentResult(lbl(
        `Payment recorded in Zoho Books (ref: ${invoiceRef}).`,
        `Pago registrado en Zoho Books (ref: ${invoiceRef}).`,
      ));
      setStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Token expired — refresh and retry once
      if (isTokenError(msg)) {
        try {
          const tok = await refreshZohoAccessToken();
          if (!tok) throw new Error(lbl('Zoho token expired.', 'Token Zoho expirado.'));
          await doRecord();
          setPaymentResult(lbl(
            `Payment recorded in Zoho Books (ref: ${invoiceRef}).`,
            `Pago registrado en Zoho Books (ref: ${invoiceRef}).`,
          ));
          setStatus('done');
        } catch (retryErr) {
          setErrorMsg(lbl(
            `Zoho recording failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
            `Error al registrar en Zoho: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
          ));
          setStatus('approved');
        }
      } else {
        setErrorMsg(lbl(
          `Zoho recording failed: ${msg}`,
          `Error al registrar en Zoho: ${msg}`,
        ));
        setStatus('approved');
      }
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const selectedCur = WOMPI_CURRENCIES.find(c => c.code === currency) ?? WOMPI_CURRENCIES[0];
  const numAmt      = parseFloat(amount) || 0;
  const copCents    = numAmt > 0 ? toCOPCents(numAmt, currency) : 0;
  const canPay      = numAmt > 0 && !!invoiceRef.trim();
  const isLoading   = status === 'loading';
  const isDone      = status === 'done';

  // ── Styles ───────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.95rem',
    border: '1px solid #cbd5e1', borderRadius: '7px',
    boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
  };
  const fieldDisabled = !['idle', 'error'].includes(status);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: '2rem', borderTop: '2px solid #e0e7ff', paddingTop: '1.5rem' }}>

      {/* Header */}
      <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        {lbl('Pay with Wompi', 'Pagar con Wompi')}
      </h3>

      {/* ── Status banners ─────────────────────────────────────────────── */}
      {status === 'verifying' && (
        <Banner color="blue" spinner>
          {lbl('Verifying Wompi transaction…', 'Verificando transacción Wompi…')}
        </Banner>
      )}
      {status === 'recording' && (
        <Banner color="blue" spinner>
          {lbl('Recording payment in Zoho Books…', 'Registrando pago en Zoho Books…')}
        </Banner>
      )}
      {status === 'declined' && (
        <Banner color="red">
          ✗ {lbl('Payment declined or cancelled.', 'Pago rechazado o cancelado.')}
        </Banner>
      )}
      {(status === 'done' && paymentResult) && (
        <Banner color="green">
          ✓ {paymentResult}
        </Banner>
      )}
      {(status === 'approved' && !errorMsg) && (
        <Banner color="green">
          ✓ {lbl('Payment approved by Wompi!', '¡Pago aprobado por Wompi!')}
          {transactionId && (
            <span style={{ fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.82rem' }}>
              ID: {transactionId}
            </span>
          )}
          <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', opacity: 0.85 }}>
            {lbl('Recording to Zoho Books…', 'Registrando en Zoho Books…')}
          </div>
        </Banner>
      )}
      {errorMsg && (
        <Banner color="red">
          {errorMsg}
          {/* Offer manual retry if Zoho recording failed after payment was approved */}
          {status === 'approved' && (
            <button
              type="button"
              onClick={recordToZoho}
              style={{ marginTop: '0.5rem', display: 'block', fontSize: '0.82rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {lbl('Retry Zoho recording', 'Reintentar registro en Zoho')}
            </button>
          )}
        </Banner>
      )}

      {/* ── Form (hidden once done) ─────────────────────────────────────── */}
      {!isDone && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

          {/* Amount */}
          <div>
            <label style={labelStyle}>{lbl('Amount', 'Monto')} *</label>
            <input
              style={inp} type="number" min="0" step="any" placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={fieldDisabled}
            />
          </div>

          {/* Currency */}
          <div>
            <label style={labelStyle}>{lbl('Currency', 'Moneda')} *</label>
            <select
              style={inp}
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              disabled={fieldDisabled}
            >
              {WOMPI_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            {copCents > 0 && currency !== 'COP' && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                ≈ {formatCOP(copCents)} {lbl('(Wompi charges in COP)', '(Wompi cobra en COP)')}
              </p>
            )}
            {copCents > 0 && currency === 'COP' && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                {formatCOP(copCents)}
              </p>
            )}
          </div>

          {/* Invoice / Reference */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>{lbl('Invoice / Reference No.', 'Factura / No. de Referencia')} *</label>
            <input
              style={inp} type="text"
              placeholder={lbl('e.g. INV-2026-001', 'ej. FAC-2026-001')}
              value={invoiceRef}
              onChange={e => setInvoiceRef(e.target.value)}
              disabled={fieldDisabled}
            />
          </div>

          {/* Customer name */}
          <div>
            <label style={labelStyle}>{lbl('Customer Name', 'Nombre del Cliente')}</label>
            <input
              style={inp} type="text"
              placeholder={lbl('Full name', 'Nombre completo')}
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              disabled={fieldDisabled}
            />
          </div>

          {/* Customer email */}
          <div>
            <label style={labelStyle}>{lbl('Customer Email', 'Email del Cliente')}</label>
            <input
              style={inp} type="email" placeholder="email@example.com"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              disabled={fieldDisabled}
            />
          </div>

          {/* ── Action buttons ──────────────────────────────────────────── */}
          <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>

            {/* Make Payment — shown in idle / error states */}
            {['idle', 'error'].includes(status) && (
              <button
                type="button"
                onClick={handleMakePayment}
                disabled={isLoading || !canPay}
                style={{
                  flex: '1 1 220px',
                  padding: '0.75rem 1.5rem',
                  background: (!canPay || isLoading)
                    ? '#a5b4fc'
                    : 'linear-gradient(135deg, #6c63ff 0%, #5a52d5 100%)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  cursor: (!canPay || isLoading) ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: '0.95rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    {lbl('Connecting to Wompi…', 'Conectando con Wompi…')}
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                      <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    {lbl('Make Payment with Wompi', 'Realizar Pago con Wompi')}
                  </>
                )}
              </button>
            )}

            {/* COP hint under button */}
            {['idle', 'error'].includes(status) && copCents > 0 && currency !== 'COP' && (
              <p style={{ margin: 'auto 0', fontSize: '0.8rem', color: '#475569' }}>
                {lbl('Wompi will charge', 'Wompi cobrará')}{' '}
                <strong>{selectedCur.symbol}{parseFloat(amount).toLocaleString('es-CO')}&nbsp;{currency}</strong>
                {' '}({formatCOP(copCents)})
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Done: new payment button ────────────────────────────────────── */}
      {isDone && (
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setAmount(prefillAmount ? String(prefillAmount) : '');
            setCurrency(prefillCurrency ?? 'COP');
            setInvoiceRef(prefillInvoiceRef ?? '');
            setCustomerName(prefillCustomerName ?? '');
            setCustomerEmail(prefillCustomerEmail ?? '');
            setTransactionId(null);
            setPaymentResult(null);
            setErrorMsg(null);
          }}
          style={{
            padding: '0.7rem 1.4rem', background: '#f1f5f9',
            color: '#1e3a8a', border: '1px solid #c7d2fe',
            borderRadius: '8px', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.95rem',
          }}
        >
          {lbl('New Payment', 'Nuevo Pago')}
        </button>
      )}

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: '#475569', marginBottom: '0.3rem',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16,
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}

interface BannerProps {
  color: 'blue' | 'green' | 'red';
  spinner?: boolean;
  children: React.ReactNode;
}
function Banner({ color, spinner, children }: BannerProps) {
  const map = {
    blue:  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
    red:   { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
  };
  const { bg, border, text } = map[color];
  return (
    <div style={{
      padding: '0.85rem 1.1rem', background: bg, border: `1px solid ${border}`,
      borderRadius: '8px', marginBottom: '1rem', color: text,
      fontSize: '0.9rem', fontWeight: 500,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {spinner && (
          <div style={{
            width: 16, height: 16, flexShrink: 0,
            border: `2px solid ${border}`, borderTopColor: text,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {children}
      </div>
    </div>
  );
}
