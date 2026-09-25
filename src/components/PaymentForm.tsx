import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { createPaymentTransaction, fetchSessionPrices } from '../lib/api';
import { createZohoBooksClient, refreshZohoAccessToken, isTokenError, type CreateInvoiceParams } from '../lib/zohoBooksClient';
import { syncCustomerToZoho } from '../lib/zohoCustomerSync';
import { sendPaymentConfirmationEmail } from '../lib/emailService';
import { supabase } from '../lib/supabaseClient';
import { SignInForm } from './SignInForm';
import { ZohoTokenGenerator } from './ZohoTokenGenerator';
import type { ClientRequest, PaymentFormData, UserFormData, Professional, SessionPrice } from '../types';
import { buildClientRequestStatusUpdate, getClientRequestStatusValue, getSessionStatusLabel, getSessionStatusOptions, type SessionStatusCode } from '../lib/sessionStatus';
import { expireUnpaidPendingRequests } from '../lib/expireUnpaidRequests';
import { markCanceledNoPayment } from '../lib/cancelUnpaidSession';
import { tokenizeWompiCard, createWompiCardTransaction, createWompiPseTransaction } from '../lib/wompiApiClient';
import { GeminiAiIcon } from './GeminiAiIcon';

const PAYMENT_METHODS = [
  { value: 'Bank Transfer', en: 'Bank Transfer', es: 'Transferencia bancaria' },
  { value: 'PayPal', en: 'PayPal', es: 'PayPal' },
  { value: 'Wompi', en: 'Wompi (Bancolombia)', es: 'Wompi (Bancolombia)' },
  { value: 'Wompi PSE', en: 'Wompi PSE', es: 'Wompi PSE' },
] as const;

function isWompiCardMethod(method: string): boolean {
  return method === 'Wompi';
}

function isWompiPseMethod(method: string): boolean {
  return method === 'Wompi PSE';
}

function isWompiOnlineMethod(method: string): boolean {
  return isWompiCardMethod(method) || isWompiPseMethod(method);
}

function isPseFieldsMethod(method: string): boolean {
  return method === 'Bank Transfer' || isWompiPseMethod(method);
}

const PAYMENT_STATUSES = [
  'Pending',
  'Completed',
  'Failed',
  'Refunded',
];

const PSE_LEGAL_ID_TYPES = [
  { value: 'CC', en: 'CC — Citizenship ID', es: 'CC — Cédula de ciudadanía' },
  { value: 'CE', en: 'CE — Foreigner ID', es: 'CE — Cédula de extranjería' },
  { value: 'NIT', en: 'NIT — Tax ID', es: 'NIT — Identificación tributaria' },
  { value: 'PP', en: 'PP — Passport', es: 'PP — Pasaporte' },
  { value: 'TI', en: 'TI — Identity card', es: 'TI — Tarjeta de identidad' },
] as const;

const PSE_BANKS = [
  { code: '1', name: 'Banco de Bogotá' },
  { code: '2', name: 'Banco Popular' },
  { code: '9', name: 'Banco Itaú / CorpBanca' },
  { code: '10', name: 'Bancolombia' },
  { code: '12', name: 'Banco GNB Sudameris' },
  { code: '13', name: 'BBVA Colombia' },
  { code: '19', name: 'Scotiabank Colpatria' },
  { code: '23', name: 'Banco de Occidente' },
  { code: '32', name: 'Banco Caja Social' },
  { code: '40', name: 'Banco Agrario' },
  { code: '51', name: 'Banco Davivienda' },
  { code: '52', name: 'Banco AV Villas' },
  { code: '58', name: 'Banco ProCredit' },
  { code: '60', name: 'Banco Pichincha' },
  { code: '62', name: 'Banco Falabella' },
  { code: '63', name: 'Banco Finandina' },
  { code: '65', name: 'Banco Santander Colombia' },
  { code: '66', name: 'Banco Cooperativo Coopcentral' },
  { code: '69', name: 'Nequi' },
  { code: '1551', name: 'Daviplata' },
  { code: '1507', name: 'Nequi (1507)' },
  { code: '1040', name: 'Banco Serfinanza' },
] as const;

const WOMPI_INSTALLMENTS = [1, 2, 3, 6, 12, 18, 24, 36];

const EMPTY_PAYMENT_FORM: PaymentFormData = {
  client_name: '',
  client_email: '',
  client_phone: '',
  session_price_id: undefined,
  num_sessions: 1,
  payment_amount: 0,
  payment_currency: 'COP',
  payment_method: 'Bank Transfer',
  payment_status: 'Pending',
  transaction_reference: '',
  notes: '',
  exchange_rate: undefined,
  type: 'PSE',
  user_type: 0,
  user_legal_id_type: 'CC',
  user_legal_id: '',
  financial_institution_code: '',
  payment_description: '',
  token: '',
  installments: 1,
};

interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

const CURRENCIES: CurrencyOption[] = [
  { code: 'COP', name: 'Colombian Peso', symbol: '$', rate: 3950.00 },
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.0 },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC', rate: 0.92 },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3', rate: 0.79 },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', rate: 17.15 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rate: 1.36 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', rate: 1.53 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', rate: 149.50 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', rate: 0.88 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5', rate: 7.24 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', rate: 4.97 },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', rate: 875.00 },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', rate: 3.72 },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', rate: 950.00 },
];

function parseSessionAmount(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function sessionDueAmount(req: ClientRequest, prices: SessionPrice[]): { amount: number; currency: string } {
  const fromRequest = parseSessionAmount(req.price_amount);
  if (fromRequest > 0) {
    return { amount: fromRequest, currency: req.price_currency || 'COP' };
  }
  const listed = req.session_price_id != null
    ? prices.find(p => p.id === req.session_price_id)
    : undefined;
  if (listed) {
    const fromPrice = parseSessionAmount(listed.Price);
    if (fromPrice > 0) {
      return { amount: fromPrice, currency: req.price_currency || listed.Currency || 'COP' };
    }
  }
  return { amount: 0, currency: req.price_currency || 'COP' };
}

function convertCurrencyAmount(amount: number, fromCode: string, toCode: string): number {
  if (!fromCode || !toCode || fromCode === toCode) return amount;
  const from = CURRENCIES.find(c => c.code === fromCode);
  const to = CURRENCIES.find(c => c.code === toCode);
  if (!from || !to) return amount;
  return (amount / from.rate) * to.rate;
}

interface ZohoInvoiceItem {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  balance: number;
  status: string;
  date: string;
  due_date: string;
  currency_code: string;
}

interface PaymentFormProps {
  currentUser: UserFormData | null;
  onSignIn: (userData: UserFormData) => void;
}

export function PaymentForm({ currentUser, onSignIn }: PaymentFormProps) {
  const PAYMENT_PREFILL_KEY = 'payment_prefill_from_booking';
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<ClientRequest[]>([]);
  const [pendingRequestsError, setPendingRequestsError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ClientRequest | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyOption>(CURRENCIES[0]);
  const [convertedAmount, setConvertedAmount] = useState<number>(0);
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<SessionStatusCode | 'all'>(0);
  const [cancelNoPaySubmitting, setCancelNoPaySubmitting] = useState(false);
  const [cancelNoPayError, setCancelNoPayError] = useState<string | null>(null);
  const [professionalNames, setProfessionalNames] = useState<Record<string, { en: string; es: string }>>({});
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);
  const [zohoInvoices, setZohoInvoices] = useState<ZohoInvoiceItem[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [paymentPrefill, setPaymentPrefill] = useState<{
    client_email?: string;
    client_request_id?: string;
    client_name?: string;
    client_phone?: string;
  } | null>(null);
  const [showZohoTokenGenerator, setShowZohoTokenGenerator] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(false);
  const [invoiceCreationError, setInvoiceCreationError] = useState<string | null>(null);
  const [creatingGoogleMeet, setCreatingGoogleMeet] = useState(false);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [wompiLoading, setWompiLoading] = useState(false);
  const [wompiStatus, setWompiStatus] = useState<'idle' | 'verifying' | 'approved' | 'declined' | 'error'>('idle');
  const [wompiTransactionId, setWompiTransactionId] = useState<string | null>(null);
  const [tokenizingCard, setTokenizingCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [wompiSavedData, setWompiSavedData] = useState<{
    formData: PaymentFormData;
    selectedRequestId: string;
    selectedRequestIds?: string[];
    reference: string;
  } | null>(null);
  const [formData, setFormData] = useState<PaymentFormData>({ ...EMPTY_PAYMENT_FORM });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PAYMENT_PREFILL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          client_email?: string;
          client_request_id?: string;
          client_name?: string;
          client_phone?: string;
        };
        setPaymentPrefill(parsed);
      }
    } catch {
      setPaymentPrefill(null);
    } finally {
      sessionStorage.removeItem(PAYMENT_PREFILL_KEY);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUserData();
    }
  }, [currentUser, paymentPrefill]);

  useEffect(() => {
    const baseCurrency = CURRENCIES.find(c => c.code === formData.payment_currency) || CURRENCIES[0];
    const baseAmountInUSD = formData.payment_amount / baseCurrency.rate;
    const converted = baseAmountInUSD * displayCurrency.rate;
    setConvertedAmount(converted);

    if (displayCurrency.code !== formData.payment_currency) {
      setFormData(prev => ({
        ...prev,
        exchange_rate: displayCurrency.rate / baseCurrency.rate,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        exchange_rate: undefined,
      }));
    }
  }, [formData.payment_amount, formData.payment_currency, displayCurrency]);

  // Detect Wompi redirect return (?id=TRANSACTION_ID in URL) on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const wompiId = urlParams.get('id');
    if (!wompiId) return;

    // Remove the id param to keep the URL clean
    urlParams.delete('id');
    const newSearch = urlParams.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (newSearch ? '?' + newSearch : '')
    );

    setWompiTransactionId(wompiId);
    setWompiStatus('verifying');

    // Restore saved Wompi payment data from before the redirect
    const savedRaw = sessionStorage.getItem('wompi_payment_state');
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);
        setWompiSavedData(saved);
        if (saved.formData) {
          setFormData(prev => ({ ...prev, ...saved.formData }));
        }
        if (saved.selectedRequestIds?.length) {
          sessionStorage.setItem('wompi_restore_request_ids', JSON.stringify(saved.selectedRequestIds));
        } else if (saved.selectedRequestId) {
          sessionStorage.setItem('wompi_restore_request_ids', JSON.stringify([saved.selectedRequestId]));
        }
      } catch { /* ignore parse errors */ }
      sessionStorage.removeItem('wompi_payment_state');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once pendingRequests loads, restore the selected sessions from before the Wompi redirect
  useEffect(() => {
    const raw = sessionStorage.getItem('wompi_restore_request_ids');
    if (!raw || pendingRequests.length === 0) return;
    try {
      const ids = JSON.parse(raw) as string[];
      const valid = ids.filter(id => pendingRequests.some(r => r.id === id));
      if (valid.length > 0) setSelectedRequestIds(new Set(valid));
    } catch { /* ignore parse errors */ }
    sessionStorage.removeItem('wompi_restore_request_ids');
  }, [pendingRequests]);

  // Verify Wompi transaction status via Mentalma_Wompi_Server (server-side, keeps secret safe)
  useEffect(() => {
    if (wompiStatus !== 'verifying' || !wompiTransactionId) return;
    const verify = async () => {
      try {
        const serverUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wompi-proxy`;
        const res = await fetch(`${serverUrl}/verify?transaction_id=${wompiTransactionId}`);
        if (!res.ok) { setWompiStatus('error'); return; }
        const body = await res.json() as { status?: string };
        const txStatus: string = body.status ?? '';
        if (txStatus === 'APPROVED') {
          setWompiStatus('approved');
        } else if (txStatus === 'DECLINED' || txStatus === 'ERROR' || txStatus === 'VOIDED') {
          setWompiStatus('declined');
        } else {
          setWompiStatus('error');
        }
      } catch {
        setWompiStatus('error');
      }
    };
    verify();
  }, [wompiStatus, wompiTransactionId]);

  const handleCurrencyChange = (currencyCode: string) => {
    const currency = CURRENCIES.find(c => c.code === currencyCode);
    if (currency) {
      setDisplayCurrency(currency);
    }
  };

  const selectedInvoices = zohoInvoices.filter(i => selectedInvoiceIds.has(i.invoice_id));
  const selectedInvoicesTotal = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0);

  const selectedSessions = useMemo(
    () => pendingRequests.filter(r => Boolean(r.id && selectedRequestIds.has(r.id))),
    [pendingRequests, selectedRequestIds],
  );

  const selectedUnpaidPending = useMemo(
    () => selectedSessions.filter(r => getClientRequestStatusValue(r) === 0),
    [selectedSessions],
  );

  const selectedSessionsTotal = useMemo(() => {
    const targetCurrency = selectedSessions[0]
      ? sessionDueAmount(selectedSessions[0], sessionPrices).currency
      : formData.payment_currency;
    const total = selectedSessions.reduce((sum, req) => {
      const due = sessionDueAmount(req, sessionPrices);
      return sum + convertCurrencyAmount(due.amount, due.currency || targetCurrency, targetCurrency);
    }, 0);
    return Math.round(total * 100) / 100;
  }, [selectedSessions, sessionPrices, formData.payment_currency]);

  // Filter pending requests by the date-range pickers (preferred_date).
  // When no dates are set, all requests are shown.
  const filteredPendingRequests = pendingRequests.filter(req => {
    if (statusFilter !== 'all' && getClientRequestStatusValue(req) !== statusFilter) return false;
    if (!invoiceDateFrom && !invoiceDateTo) return true;
    if (!req.preferred_date) return true;
    const d = req.preferred_date.split('T')[0];
    if (invoiceDateFrom && d < invoiceDateFrom) return false;
    if (invoiceDateTo && d > invoiceDateTo) return false;
    return true;
  });

  useEffect(() => {
    const primary = selectedSessions[0] ?? null;
    setSelectedRequest(primary);

    const targetCurrency = selectedSessions[0]
      ? sessionDueAmount(selectedSessions[0], sessionPrices).currency
      : 'COP';
    setFormData(prev => ({
      ...prev,
      payment_amount: selectedSessionsTotal,
      payment_currency: selectedSessions.length > 0 ? targetCurrency : prev.payment_currency,
      num_sessions: Math.max(1, selectedSessions.length),
      client_request_id: primary?.id,
      session_price_id: primary?.session_price_id,
      professional_id: primary?.professional_id,
      notes: selectedSessions.length
        ? `Payment for ${selectedSessions.length} session(s)`
        : '',
      type: isPseFieldsMethod(prev.payment_method) ? 'PSE' : prev.type,
      payment_description: prev.payment_description?.trim()
        ? prev.payment_description
        : (selectedSessions.length
          ? `Payment for ${selectedSessions.length} session(s)`
          : ''),
      ...(primary
        ? {
            client_name: primary.client_name || primary.full_name || primary.username || prev.client_name,
            client_email: primary.client_email || prev.client_email,
            client_phone: primary.client_phone || prev.client_phone,
          }
        : {}),
    }));
  }, [selectedSessions, selectedSessionsTotal, sessionPrices]);

  const loadUserData = async () => {
    if (!currentUser) {
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);
    setPendingRequests([]);
    setPendingRequestsError(null);
    setSelectedRequest(null);
    setSelectedRequestIds(new Set());

    setFormData(prev => ({
      ...prev,
      client_name: paymentPrefill?.client_name || currentUser.full_name || '',
      client_email: paymentPrefill?.client_email || currentUser.email || '',
      client_phone: paymentPrefill?.client_phone || currentUser.phone || '',
    }));

    try {
      const roleLookup = async (): Promise<string | null> => {
        if (currentUser.id) {
          const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (error) throw error;
          return (data?.role as string | null) || null;
        }

        if (currentUser.email) {
          const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('email', currentUser.email)
            .maybeSingle();

          if (error) throw error;
          return (data?.role as string | null) || null;
        }

        return null;
      };

      const role = await roleLookup();
      const normalizedRole = role?.toLowerCase();
      const admin = normalizedRole === 'admin' || normalizedRole === 'administrator';

      const effectiveClientEmail = paymentPrefill?.client_email || currentUser.email;

      if (!effectiveClientEmail) {
        setPendingRequestsError(
          language === 'es'
            ? 'Correo requerido para cargar solicitudes pendientes.'
            : 'Email required to load pending requests.'
        );
        return;
      }

      // Expire unpaid holds first so they no longer appear as payable pending requests.
      await expireUnpaidPendingRequests();

      let query = supabase
        .from('client_requests')
        .select('*')
        .order('preferred_date', { ascending: false });

      if (!admin) {
        query = query.eq('client_email', effectiveClientEmail);
      } else if (effectiveClientEmail) {
        query = query.eq('client_email', effectiveClientEmail);
      }

      const { data, error } = await query;
      if (error) throw error;

      const requests = (data || []) as ClientRequest[];
      setPendingRequests(requests);

      try {
        const prices = await fetchSessionPrices();
        setSessionPrices(prices);
      } catch (priceErr) {
        console.warn('Could not load session prices:', priceErr);
        setSessionPrices([]);
      }

      const { data: pros } = await supabase
        .from('professionals')
        .select('id, name_en, name_es');
      const names: Record<string, { en: string; es: string }> = {};
      for (const p of pros || []) {
        names[p.id] = { en: p.name_en || p.name_es || '', es: p.name_es || p.name_en || '' };
      }
      setProfessionalNames(names);

      const prefillId = paymentPrefill?.client_request_id;
      if (prefillId) {
        const prefillReq = requests.find(r => r.id === prefillId);
        if (prefillReq?.id) setSelectedRequestIds(new Set([prefillReq.id]));
      }
    } catch (err) {
      console.error('Error loading pending requests:', err);
      setPendingRequestsError(
        language === 'es'
          ? 'No se pudieron cargar las solicitudes pendientes.'
          : 'Unable to load pending requests.'
      );
    } finally {
      setLoadingRequests(false);
    }
  };

  const toggleSessionSelection = (req: ClientRequest) => {
    if (!req.id) return;
    setSelectedRequestIds(prev => {
      const next = new Set(prev);
      if (next.has(req.id!)) next.delete(req.id!);
      else next.add(req.id!);
      return next;
    });
    setZohoInvoices([]);
    setSelectedInvoiceIds(new Set());
    setCancelNoPayError(null);
  };

  const handleConfirmCanceledNoPayment = async () => {
    if (selectedUnpaidPending.length === 0) return;
    setCancelNoPaySubmitting(true);
    setCancelNoPayError(null);
    try {
      const note =
        language === 'es'
          ? 'Cancelado sin pago (solicitado desde Realizar un pago).'
          : 'Canceled no payment (requested from Make a Payment).';
      for (const req of selectedUnpaidPending) {
        await markCanceledNoPayment({ request: req, note });
      }
      const canceledIds = new Set(selectedUnpaidPending.map(r => r.id).filter(Boolean));
      setPendingRequests(prev =>
        prev.map(r =>
          r.id && canceledIds.has(r.id)
            ? { ...r, status: 'cancelled', statusvalue: 2, session_status: 2 }
            : r,
        ),
      );
      setSelectedRequestIds(new Set());
    } catch (err) {
      console.error('Canceled no payment error:', err);
      const detail = err instanceof Error && err.message ? err.message : '';
      setCancelNoPayError(
        language === 'es'
          ? `No se pudo marcar la(s) sesión(es) como Cancelado sin pago.${detail ? ` ${detail}` : ''}`
          : `Could not mark the session(s) as Canceled no payment.${detail ? ` ${detail}` : ''}`,
      );
    } finally {
      setCancelNoPaySubmitting(false);
    }
  };

  const handleExplainField = async (fieldName: string) => {
    setShowExplanation(true);
    setLoadingExplanation(true);
    setExplanation('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      let prompt = '';

      if (fieldName === 'payment_method') {
        prompt = t('language') === 'es'
          ? `Explica los métodos de pago disponibles: Transferencia bancaria, PayPal, Wompi (tarjeta Bancolombia) y Wompi PSE. Describe cuándo usar cada uno y qué datos se necesitan.`
          : `Explain the available payment methods: Bank Transfer, PayPal, Wompi card (Bancolombia), and Wompi PSE. Describe when to use each one and what details are needed.`;
      } else if (fieldName === 'payment_status') {
        prompt = t('language') === 'es'
          ? `Explica los estados de pago: Pendiente (pago aún no recibido), Completado (pago recibido y confirmado), Fallido (pago rechazado o no exitoso), y Reembolsado (pago devuelto al cliente). Menciona cuándo seleccionar cada estado.`
          : `Explain the payment statuses: Pending (payment not yet received), Completed (payment received and confirmed), Failed (payment rejected or unsuccessful), and Refunded (payment returned to client). Mention when to select each status.`;
      } else if (fieldName === 'transaction_reference') {
        prompt = t('language') === 'es'
          ? `Explica qué es una referencia de transacción o número de recibo. Menciona que es un identificador único para rastrear el pago, puede ser un número de confirmación de tarjeta, ID de PayPal, número de cheque, etc. Explica por qué es importante registrar esto para resolver disputas o consultas futuras.`
          : `Explain what a transaction reference or receipt number is. Mention that it's a unique identifier to track the payment, can be a card confirmation number, PayPal ID, check number, etc. Explain why it's important to record this for resolving disputes or future inquiries.`;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/ask-mari`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to get explanation');
      }

      const data = await response.json();
      setExplanation(data.response || data.message || 'No explanation available');
    } catch (error) {
      console.error('Error getting field explanation:', error);
      setExplanation(t('language') === 'es'
        ? 'Lo siento, no pude obtener una explicación en este momento.'
        : 'Sorry, I could not get an explanation at this time.');
    } finally {
      setLoadingExplanation(false);
    }
  };

  const handleSignIn = (userData: UserFormData) => {
    setSigningIn(true);
    onSignIn(userData);
    setSigningIn(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === 'num_sessions') {
        return { ...prev, num_sessions: parseInt(value) || 1 };
      }
      if (name === 'exchange_rate') {
        return { ...prev, exchange_rate: value ? parseFloat(value) : undefined };
      }
      if (name === 'user_type') {
        const userType = Number(value) === 1 ? 1 : 0;
        return {
          ...prev,
          user_type: userType,
          user_legal_id_type: userType === 1 ? 'NIT' : (prev.user_legal_id_type === 'NIT' ? 'CC' : prev.user_legal_id_type || 'CC'),
        };
      }
      if (name === 'payment_method') {
        return {
          ...prev,
          payment_method: value,
          type: isPseFieldsMethod(value) ? 'PSE' : value === 'Wompi' ? 'CARD' : prev.type,
        };
      }
      if (name === 'installments') {
        return { ...prev, installments: Math.max(1, parseInt(value, 10) || 1) };
      }
      return { ...prev, [name]: value };
    });
  };

  /** Mark the linked client_request as paid so cancel can offer refund/credit. */
  const markClientRequestPaid = async (request: ClientRequest | null | undefined) => {
    if (!request?.id) return;
    if (getClientRequestStatusValue(request) === 1) return;
    try {
      const statusUpdate = buildClientRequestStatusUpdate(request, 1);
      const { error } = await supabase
        .from('client_requests')
        .update({
          ...statusUpdate,
          status: 'paid',
        })
        .eq('id', request.id);
      if (error) {
        console.error('Error marking client request paid:', error);
      }
    } catch (err) {
      console.error('Error marking client request paid:', err);
    }
  };

  const fetchProfessional = async (professionalId: string): Promise<Professional | null> => {
    try {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', professionalId)
        .maybeSingle();
      if (error) throw error;
      return data as Professional | null;
    } catch (err) {
      console.error('Error fetching professional:', err);
      return null;
    }
  };

  const buildInvoiceParamsForPayment = (
    request: ClientRequest,
    professional: Professional | null,
    lang: string
  ): CreateInvoiceParams => {
    const professionalName = professional
      ? (lang === 'en' ? professional.name_en : professional.name_es)
      : 'Professional';

    const sessionDateStr = request.scheduled_datetime || request.preferred_date;
    const sessionDate = sessionDateStr ? new Date(sessionDateStr).toLocaleDateString() : '';
    const invoiceDate = new Date().toISOString().split('T')[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const sessionDuration = request.session_length || 1;
    const sessionText = sessionDuration === 1
      ? (lang === 'es' ? 'hora' : 'hour')
      : (lang === 'es' ? 'horas' : 'hours');

    return {
      customerName: request.full_name || request.client_name || request.username || 'Client',
      customerEmail: request.client_email,
      customerPhone: request.client_phone,
      invoiceDate,
      dueDate: dueDateStr,
      currencyCode: sessionDueAmount(request, sessionPrices).currency || formData.payment_currency,
      lineItems: [
        {
          name: lang === 'es' ? 'Sesion de Terapia' : 'Therapy Session',
          description: lang === 'es'
            ? `Sesion de terapia con ${professionalName}${sessionDate ? ' - ' + sessionDate : ''} (${sessionDuration} ${sessionText})\n${request.num_sessions || 1} sesion(es) incluida(s)`
            : `Therapy session with ${professionalName}${sessionDate ? ' - ' + sessionDate : ''} (${sessionDuration} ${sessionText})\n${request.num_sessions || 1} session(s) included`,
          rate: sessionDueAmount(request, sessionPrices).amount || parseFloat(String(formData.payment_amount)) || 0,
          quantity: 1,
        },
      ],
      notes: lang === 'es'
        ? 'Gracias por su confianza en nuestros servicios de salud mental.'
        : 'Thank you for trusting our mental health services.',
      terms: lang === 'es'
        ? 'Pago requerido dentro de 30 dias.'
        : 'Payment is due within 30 days.',
      referenceNumber: `REQ-${request.id}`,
    };
  };

  const buildInvoiceEmailBody = (
    invoiceNumber: string,
    total: number,
    request: ClientRequest,
    professional: Professional | null,
    lang: string
  ): string => {
    const clientName = request.full_name || request.client_name || request.username || 'Client';
    const professionalName = professional
      ? (lang === 'en' ? professional.name_en : professional.name_es)
      : '';
    const professionalTitle = professional
      ? [professional.Título, professional.Clasificación].filter(Boolean).join(' - ')
      : '';
    const sessionDateStr = request.scheduled_datetime || request.preferred_date;
    const sessionDate = sessionDateStr
      ? new Date(sessionDateStr).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })
      : '';
    const sessionTime = request.scheduled_datetime
      ? new Date(request.scheduled_datetime).toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', {
          hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        })
      : (request.preferred_time || '');
    const sessionDuration = request.session_length || 1;
    const durationText = lang === 'es'
      ? `${sessionDuration} ${sessionDuration === 1 ? 'hora' : 'horas'}`
      : `${sessionDuration} ${sessionDuration === 1 ? 'hour' : 'hours'}`;
    const currency = request.price_currency || formData.payment_currency;

    if (lang === 'es') {
      return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a5276;">Factura de Sesion de Terapia</h2>
  <p>Estimado/a <strong>${clientName}</strong>,</p>
  <p>Se ha generado una factura para su sesion de terapia. A continuacion encontrara los detalles:</p>
  <div style="background-color: #f8f9fa; border-left: 4px solid #2196F3; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin-top: 0; color: #1a5276;">Detalles de la Cita</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Fecha:</td><td style="padding: 6px 0;"><strong>${sessionDate}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Hora:</td><td style="padding: 6px 0;"><strong>${sessionTime}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Duracion:</td><td style="padding: 6px 0;"><strong>${durationText}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Psicologo:</td><td style="padding: 6px 0;"><strong>${professionalName}</strong>${professionalTitle ? `<br><span style="font-size: 0.9em; color: #546e7a;">${professionalTitle}</span>` : ''}</td></tr>
    </table>
  </div>
  <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin-top: 0; color: #2e7d32;">Resumen de Factura</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Numero de factura:</td><td style="padding: 6px 0;"><strong>${invoiceNumber}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Total:</td><td style="padding: 6px 0;"><strong>${total} ${currency}</strong></td></tr>
    </table>
  </div>
  <p>Adjunto encontrara la factura en formato PDF para su referencia.</p>
  <p>Gracias por su confianza en nuestros servicios de salud mental.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="font-size: 0.85em; color: #999;">Professional Therapy Services</p>
</div>`;
    }

    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a5276;">Therapy Session Invoice</h2>
  <p>Dear <strong>${clientName}</strong>,</p>
  <p>An invoice has been generated for your therapy session. Please find the details below:</p>
  <div style="background-color: #f8f9fa; border-left: 4px solid #2196F3; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin-top: 0; color: #1a5276;">Appointment Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Date:</td><td style="padding: 6px 0;"><strong>${sessionDate}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Time:</td><td style="padding: 6px 0;"><strong>${sessionTime}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Duration:</td><td style="padding: 6px 0;"><strong>${durationText}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Professional:</td><td style="padding: 6px 0;"><strong>${professionalName}</strong>${professionalTitle ? `<br><span style="font-size: 0.9em; color: #546e7a;">${professionalTitle}</span>` : ''}</td></tr>
    </table>
  </div>
  <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin-top: 0; color: #2e7d32;">Invoice Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Invoice Number:</td><td style="padding: 6px 0;"><strong>${invoiceNumber}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Total:</td><td style="padding: 6px 0;"><strong>${total} ${currency}</strong></td></tr>
    </table>
  </div>
  <p>Please find the attached invoice PDF for your records.</p>
  <p>Thank you for trusting our mental health services.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="font-size: 0.85em; color: #999;">Professional Therapy Services</p>
</div>`;
  };

  const createAndSendInvoice = async (
    request: ClientRequest,
    professional: Professional | null,
    lang: string
  ): Promise<string | null> => {
    setCreatingInvoice(true);
    setInvoiceCreationError(null);
    try {
      let zohoClient = createZohoBooksClient();

      if (!zohoClient) {
        setShowZohoTokenGenerator(true);
        return null;
      }

      const tryCreate = async () => {
        await syncCustomerToZoho(
          request.client_email,
          request.full_name || request.client_name || request.username,
          request.client_phone
        );
        const params = buildInvoiceParamsForPayment(request, professional, lang);
        return await zohoClient!.createInvoice(params);
      };

      let response;
      try {
        response = await tryCreate();
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : '';
        if (isTokenError(msg)) {
          const newToken = await refreshZohoAccessToken();
          if (newToken) {
            zohoClient = createZohoBooksClient();
            response = await tryCreate();
          } else {
            setShowZohoTokenGenerator(true);
            return null;
          }
        } else {
          throw firstErr;
        }
      }

      if (response?.invoice) {
        setInvoiceCreated(true);
        const { invoice_id, invoice_number, total } = response.invoice;

        const toEmails = [request.client_email];
        const ccEmails = professional?.email ? [professional.email] : [];
        const subject = lang === 'es'
          ? `Factura de Sesion de Terapia - ${invoice_number}`
          : `Therapy Session Invoice - ${invoice_number}`;
        const body = buildInvoiceEmailBody(invoice_number, total, request, professional, lang);
        try {
          await zohoClient!.sendInvoice(invoice_id, toEmails, { ccEmails, subject, body });
        } catch (emailErr) {
          console.error('Failed to send invoice email:', emailErr);
        }

        return invoice_id;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setInvoiceCreationError(msg);
      console.error('Error creating invoice:', err);
      return null;
    } finally {
      setCreatingInvoice(false);
    }
  };

  const createGoogleMeetForPayment = async (
    request: ClientRequest,
    professional: Professional | null
  ): Promise<{ meetingUri: string; meetingCode: string; calendarEventId: string } | null> => {
    if (!request.scheduled_datetime) return null;
    if (request.meeting_platform === 'manual') return null;

    setCreatingGoogleMeet(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const lang = language;
      const professionalName = professional
        ? (lang === 'en' ? professional.name_en : professional.name_es)
        : '';
      const specialties = lang === 'es' ? professional?.specialties_es : professional?.specialties_en;
      const specialty = specialties && specialties.length > 0 ? specialties[0] : '';

      const response = await fetch(`${supabaseUrl}/functions/v1/google-meet`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_email: request.client_email,
          client_name: request.full_name || request.client_name || request.username,
          meeting_date: request.scheduled_datetime,
          professional_name: professionalName,
          professional_email: professional?.email || '',
          booking_user_email: currentUser?.email || '',
          booking_user_name: currentUser?.full_name || '',
          specialty,
          description: request.issue,
          platform: request.meeting_platform || 'google',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const meetResult = {
            meetingUri: result.meetingUri as string,
            meetingCode: result.meetingCode as string,
            calendarEventId: (result.calendarEventId || '') as string,
          };

          // Update client_request and sessions with the meet link
          if (request.id) {
            await supabase
              .from('client_requests')
              .update({
                meeting_uri: meetResult.meetingUri,
                meeting_code: meetResult.meetingCode,
                meeting_platform: 'google_meet',
                calendar_event_id: meetResult.calendarEventId || null,
              })
              .eq('id', request.id);

            await supabase
              .from('sessions')
              .update({
                online_meeting_id: meetResult.meetingUri,
                online_meeting_url: meetResult.meetingUri,
                online_platform: 'GoogleMeet',
              })
              .eq('client_email', request.client_email)
              .eq('session_date', request.scheduled_datetime);
          }

          setMeetLink(meetResult.meetingUri);
          return meetResult;
        }
      }
      return null;
    } catch (err) {
      console.error('Error creating Google Meet:', err);
      return null;
    } finally {
      setCreatingGoogleMeet(false);
    }
  };

  // ── Wompi helpers — via Mentalma_Wompi_Server ────────────────────────────────

  const handleTokenizeWompiCard = async () => {
    const number = cardNumber.replace(/\s+/g, '');
    if (number.length < 13 || !cardCvc || !cardExpMonth || !cardExpYear || !cardHolder.trim()) {
      alert(
        language === 'es'
          ? 'Complete los datos de la tarjeta para tokenizarla.'
          : 'Enter the card details to tokenize it.'
      );
      return;
    }
    setTokenizingCard(true);
    try {
      const result = await tokenizeWompiCard({
        number,
        cvc: cardCvc,
        exp_month: cardExpMonth,
        exp_year: cardExpYear,
        card_holder: cardHolder,
      });
      setFormData(prev => ({
        ...prev,
        type: 'CARD',
        token: result.token,
      }));
      setCardLastFour(result.lastFour);
      setCardBrand(result.brand);
      setCardNumber('');
      setCardCvc('');
    } catch (err) {
      alert(
        language === 'es'
          ? `No se pudo tokenizar la tarjeta: ${err instanceof Error ? err.message : 'Intente de nuevo.'}`
          : `Could not tokenize the card: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setTokenizingCard(false);
    }
  };

  const handleWompiCheckout = async () => {
    if (selectedSessions.length === 0 || !formData.payment_amount || formData.payment_amount <= 0) {
      alert(
        language === 'es'
          ? 'Por favor seleccione al menos una sesión y asegúrese de que el monto sea válido'
          : 'Please select at least one session and ensure the payment amount is valid'
      );
      return;
    }
    const cardToken = (formData.token || '').trim();
    if (!cardToken.startsWith('tok_')) {
      alert(
        language === 'es'
          ? 'Tokenice la tarjeta primero. El token debe comenzar con tok_.'
          : 'Tokenize the card first. The token must start with tok_.'
      );
      return;
    }
    setWompiLoading(true);
    try {
      // Wompi Colombia processes in COP — convert from the selected currency
      const copRate = CURRENCIES.find(c => c.code === 'COP')?.rate ?? 3950;
      const paymentRate = CURRENCIES.find(c => c.code === formData.payment_currency)?.rate ?? 1;
      const amountInUSD = formData.payment_amount / paymentRate;
      const amountCOPCents = Math.round(amountInUSD * copRate) * 100;
      const currency = 'COP';
      const reference = `MARI-${(selectedRequest?.id ?? 'PAY').substring(0, 8).toUpperCase()}-${Date.now()}`;
      const redirectUrl = `${window.location.origin}${window.location.pathname}?section=payment`;

      sessionStorage.setItem(
        'wompi_payment_state',
        JSON.stringify({
          formData: { ...formData, type: 'CARD', token: cardToken },
          selectedRequestId: selectedRequest?.id,
          selectedRequestIds: selectedSessions.map(s => s.id).filter(Boolean),
          reference,
        })
      );

      const charge = await createWompiCardTransaction({
        token: cardToken,
        installments: Math.max(1, formData.installments ?? 1),
        amountInCents: amountCOPCents,
        currency,
        reference,
        clientEmail: formData.client_email,
        clientName: formData.client_name || undefined,
        redirectUrl,
      });

      setWompiTransactionId(charge.transactionId);
      if (charge.status === 'APPROVED') {
        setWompiStatus('approved');
      } else if (charge.status === 'DECLINED' || charge.status === 'ERROR' || charge.status === 'VOIDED') {
        setWompiStatus('declined');
      } else {
        setWompiStatus('verifying');
      }
    } catch (err) {
      console.error('Error initiating Wompi checkout:', err);
      setWompiStatus('error');
      alert(
        language === 'es'
          ? `Error al iniciar el pago con Wompi: ${err instanceof Error ? err.message : 'Intente nuevamente.'}`
          : `Error initiating Wompi checkout: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setWompiLoading(false);
    }
  };

  const handleWompiPseCheckout = async () => {
    if (selectedSessions.length === 0 || !formData.payment_amount || formData.payment_amount <= 0) {
      alert(
        language === 'es'
          ? 'Por favor seleccione al menos una sesión y asegúrese de que el monto sea válido'
          : 'Please select at least one session and ensure the payment amount is valid'
      );
      return;
    }
    const missingPse =
      (formData.user_type !== 0 && formData.user_type !== 1) ||
      !formData.user_legal_id_type?.trim() ||
      !formData.user_legal_id?.trim() ||
      !formData.financial_institution_code?.trim() ||
      !formData.payment_description?.trim();
    if (missingPse) {
      alert(
        language === 'es'
          ? 'Complete todos los datos PSE antes de pagar con Wompi.'
          : 'Complete all PSE details before paying with Wompi.'
      );
      return;
    }
    setWompiLoading(true);
    try {
      const copRate = CURRENCIES.find(c => c.code === 'COP')?.rate ?? 3950;
      const paymentRate = CURRENCIES.find(c => c.code === formData.payment_currency)?.rate ?? 1;
      const amountInUSD = formData.payment_amount / paymentRate;
      const amountCOPCents = Math.round(amountInUSD * copRate) * 100;
      const currency = 'COP';
      const reference = `MARI-${(selectedRequest?.id ?? 'PAY').substring(0, 8).toUpperCase()}-${Date.now()}`;
      const redirectUrl = `${window.location.origin}${window.location.pathname}?section=payment`;
      const pseForm: PaymentFormData = {
        ...formData,
        type: 'PSE',
        payment_method: 'Wompi PSE',
      };

      sessionStorage.setItem(
        'wompi_payment_state',
        JSON.stringify({
          formData: pseForm,
          selectedRequestId: selectedRequest?.id,
          selectedRequestIds: selectedSessions.map(s => s.id).filter(Boolean),
          reference,
        })
      );

      const charge = await createWompiPseTransaction({
        amountInCents: amountCOPCents,
        currency,
        reference,
        clientEmail: formData.client_email,
        clientName: formData.client_name || undefined,
        clientPhone: formData.client_phone || undefined,
        redirectUrl,
        userType: formData.user_type === 1 ? 1 : 0,
        userLegalIdType: formData.user_legal_id_type || 'CC',
        userLegalId: formData.user_legal_id || '',
        financialInstitutionCode: formData.financial_institution_code || '',
        paymentDescription: formData.payment_description || `Payment for ${selectedSessions.length} session(s)`,
      });

      setWompiTransactionId(charge.transactionId);
      if (charge.asyncPaymentUrl) {
        window.location.href = charge.asyncPaymentUrl;
        return;
      }
      if (charge.status === 'APPROVED') {
        setWompiStatus('approved');
      } else if (charge.status === 'DECLINED' || charge.status === 'ERROR' || charge.status === 'VOIDED') {
        setWompiStatus('declined');
      } else {
        setWompiStatus('verifying');
      }
    } catch (err) {
      console.error('Error initiating Wompi PSE checkout:', err);
      setWompiStatus('error');
      alert(
        language === 'es'
          ? `Error al iniciar el pago PSE con Wompi: ${err instanceof Error ? err.message : 'Intente nuevamente.'}`
          : `Error initiating Wompi PSE checkout: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setWompiLoading(false);
    }
  };

  const confirmWompiSession = async () => {
    if (!wompiTransactionId || wompiStatus !== 'approved') return;
    setLoading(true);
    const lang = language;
    let paymentId: string | undefined;
    let zohoInvoiceId: string | undefined;
    let zohoPaymentId: string | undefined;

    // Use data saved before the Wompi redirect (most reliable source of truth)
    const effectiveFormData: PaymentFormData = {
      ...(wompiSavedData?.formData ?? formData),
      payment_method: isWompiPseMethod(wompiSavedData?.formData?.payment_method ?? formData.payment_method)
        ? 'Wompi PSE'
        : 'Wompi',
      payment_status: 'Completed',
      transaction_reference: wompiTransactionId,
      client_request_id: wompiSavedData?.selectedRequestId ?? selectedRequest?.id,
    };
    const effectiveRequest =
      selectedRequest ??
      (wompiSavedData?.selectedRequestId
        ? pendingRequests.find(r => r.id === wompiSavedData!.selectedRequestId) ?? null
        : null);
    const paidRequests = (
      wompiSavedData?.selectedRequestIds?.length
        ? pendingRequests.filter(r => r.id && wompiSavedData.selectedRequestIds!.includes(r.id))
        : selectedSessions.length > 0
          ? selectedSessions
          : (effectiveRequest ? [effectiveRequest] : [])
    );

    try {
      // 1. Record payment locally in Supabase
      const paymentData = await createPaymentTransaction(effectiveFormData);
      if (paymentData) paymentId = paymentData.id;
      for (const req of paidRequests) {
        await markClientRequestPaid(req);
      }

      let successMessage =
        lang === 'es'
          ? '¡Pago con Wompi confirmado y sesión registrada!'
          : 'Wompi payment confirmed and session recorded!';

      const professional = effectiveRequest?.professional_id
        ? await fetchProfessional(effectiveRequest.professional_id)
        : null;

      // 2. Zoho — create/send invoice then record payment
      if (effectiveRequest?.price_amount && effectiveRequest?.price_currency) {
        const newInvoiceId = await createAndSendInvoice(effectiveRequest, professional, lang);
        if (newInvoiceId) {
          zohoInvoiceId = newInvoiceId;
          successMessage +=
            lang === 'es' ? '\nFactura Zoho creada y enviada.' : '\nZoho invoice created and emailed.';
          const zohoClient = createZohoBooksClient();
          if (zohoClient) {
            try {
              const paymentResponse = await zohoClient.recordPayment({
                invoiceId: newInvoiceId,
                amount: effectiveFormData.payment_amount,
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMode: 'online',
                description: `Wompi — Ref: ${wompiTransactionId}`,
                referenceNumber: wompiTransactionId,
                currencyCode: effectiveFormData.payment_currency,
              });
              zohoPaymentId = paymentResponse.payment.payment_id;
              successMessage +=
                lang === 'es' ? '\nPago registrado en Zoho Books.' : '\nPayment recorded in Zoho Books.';
            } catch (e) {
              console.error('Zoho payment error:', e);
            }
          }
        }
      } else {
        const zohoClient = createZohoBooksClient();
        if (zohoClient) {
          try {
            const foundInvoiceId = await zohoClient.findUnpaidInvoiceForCustomer(
              effectiveFormData.client_email,
              effectiveFormData.payment_amount,
              effectiveFormData.payment_currency,
              !!effectiveFormData.exchange_rate
            );
            if (foundInvoiceId) {
              zohoInvoiceId = foundInvoiceId;
              const paymentResponse = await zohoClient.recordPayment({
                invoiceId: foundInvoiceId,
                amount: effectiveFormData.payment_amount,
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMode: 'online',
                description: `Wompi — Ref: ${wompiTransactionId}`,
                referenceNumber: wompiTransactionId,
                currencyCode: effectiveFormData.payment_currency,
              });
              zohoPaymentId = paymentResponse.payment.payment_id;
              successMessage +=
                lang === 'es' ? '\nFactura Zoho pagada.' : '\nZoho invoice paid.';
            }
          } catch (e) {
            console.error('Zoho lookup error:', e);
          }
        }
      }

      // 3. Google Meet — create if session is scheduled
      if (
        effectiveRequest?.scheduled_datetime &&
        effectiveRequest.meeting_platform !== 'manual'
      ) {
        const meetResult = await createGoogleMeetForPayment(effectiveRequest, professional);
        if (meetResult?.meetingUri) {
          successMessage +=
            lang === 'es'
              ? `\nGoogle Meet creado: ${meetResult.meetingUri}`
              : `\nGoogle Meet created: ${meetResult.meetingUri}`;
        }
      }

      // 4. Confirmation email
      const emailResult = await sendPaymentConfirmationEmail(
        {
          clientName: effectiveFormData.client_name,
          clientEmail: effectiveFormData.client_email,
          paymentAmount: effectiveFormData.payment_amount,
          paymentCurrency: effectiveFormData.payment_currency,
          paymentMethod: 'Wompi',
          paymentDate: new Date().toISOString(),
          transactionReference: wompiTransactionId,
          numSessions: effectiveFormData.num_sessions,
        },
        lang
      );
      if (emailResult.success) {
        successMessage += lang === 'es' ? '\nEmail de confirmación enviado.' : '\nConfirmation email sent.';
      }

      // 5. Update Supabase payment record with Zoho + email data
      if (paymentId) {
        await supabase
          .from('payment_transactions')
          .update({
            email_sent: emailResult.success,
            email_sent_at: emailResult.success ? new Date().toISOString() : null,
            zoho_invoice_id: zohoInvoiceId,
            zoho_payment_id: zohoPaymentId,
          })
          .eq('id', paymentId);
      }

      alert(successMessage);

      // Reset Wompi state and form
      setWompiStatus('idle');
      setWompiTransactionId(null);
      setWompiSavedData(null);
      setSelectedRequest(null);
      setSelectedRequestIds(new Set());
      setFormData({ ...EMPTY_PAYMENT_FORM });
      setZohoInvoices([]);
      setSelectedInvoiceIds(new Set());
    } catch (err) {
      console.error('Error confirming Wompi session:', err);
      alert(
        lang === 'es'
          ? `Error al confirmar la sesión. Conserve este ID de transacción: ${wompiTransactionId}`
          : `Error confirming session. Please save this transaction ID: ${wompiTransactionId}`
      );
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountToPay = Number(selectedSessionsTotal) || Number(formData.payment_amount) || 0;
    if (selectedSessions.length === 0 || amountToPay <= 0) {
      alert(
        language === 'es'
          ? 'Seleccione sesiones con un monto adeudado para registrar el pago.'
          : 'Select sessions that have an amount due before recording the payment.'
      );
      return;
    }
    if (formData.payment_method === 'Bank Transfer') {
      const missingPse =
        (formData.user_type !== 0 && formData.user_type !== 1) ||
        !formData.user_legal_id_type?.trim() ||
        !formData.user_legal_id?.trim() ||
        !formData.financial_institution_code?.trim() ||
        !formData.payment_description?.trim();
      if (missingPse) {
        alert(
          language === 'es'
            ? 'Complete todos los datos PSE de la transferencia bancaria.'
            : 'Please complete all PSE bank transfer details.'
        );
        return;
      }
    }
    setLoading(true);

    let paymentId: string | undefined;
    let zohoInvoiceId: string | undefined;
    let zohoPaymentId: string | undefined;
    const paidInvoiceIds: string[] = [];
    const paymentPayload: PaymentFormData = {
      ...formData,
      payment_amount: amountToPay,
      ...(formData.payment_method === 'Bank Transfer'
        ? {
            type: 'PSE',
            user_type: formData.user_type === 1 ? 1 : 0,
          }
        : {}),
    };

    try {
      const paymentData = await createPaymentTransaction(paymentPayload);

      if (paymentData) {
        paymentId = paymentData.id;
      }

      let successMessage = language === 'es'
        ? 'Transacción de pago registrada exitosamente!'
        : 'Payment transaction recorded successfully!';

      if (formData.payment_status === 'Completed') {
        for (const req of selectedSessions) {
          await markClientRequestPaid(req);
        }
        const lang = t('language') === 'es' ? 'es' : 'en';

        // Fetch professional data for invoice + Meet creation
        const professional = selectedRequest?.professional_id
          ? await fetchProfessional(selectedRequest.professional_id)
          : null;

        // Create Zoho invoice and send invoice email
        if (selectedRequest && amountToPay > 0) {
          const newInvoiceId = await createAndSendInvoice(selectedRequest, professional, lang);
          if (newInvoiceId) {
            zohoInvoiceId = newInvoiceId;
            successMessage += lang === 'es'
              ? '\nFactura de Zoho creada y enviada por correo.'
              : '\nZoho invoice created and emailed.';

            // Record payment against the newly created invoice
            const zohoClient = createZohoBooksClient();
            if (zohoClient) {
              try {
                const paymentMode = formData.payment_method.toLowerCase().replace(/\s+/g, '_');
                const paymentResponse = await zohoClient.recordPayment({
                  invoiceId: newInvoiceId,
                  amount: paymentPayload.payment_amount,
                  paymentDate: new Date().toISOString().split('T')[0],
                  paymentMode,
                  description: `Payment via ${formData.payment_method}`,
                  referenceNumber: formData.transaction_reference,
                  currencyCode: formData.payment_currency,
                  exchangeRate: formData.exchange_rate,
                });
                zohoPaymentId = paymentResponse.payment.payment_id;
                successMessage += lang === 'es'
                  ? '\nPago registrado en Zoho Books.'
                  : '\nPayment recorded in Zoho Books.';
              } catch (zohoPayErr) {
                console.error('Error recording Zoho payment:', zohoPayErr);
              }
            }
          }
        } else {
          // No invoice to create — fall back to finding/paying existing invoices
          const zohoClient = createZohoBooksClient();
          if (zohoClient) {
            try {
              const paymentMode = formData.payment_method.toLowerCase().replace(/\s+/g, '_');

              if (selectedInvoices.length > 0) {
                const paymentResults = await zohoClient.recordPaymentForMultipleInvoices({
                  invoices: selectedInvoices.map(inv => ({
                    invoiceId: inv.invoice_id,
                    amount: inv.balance,
                  })),
                  paymentDate: new Date().toISOString().split('T')[0],
                  paymentMode,
                  description: `Payment via ${formData.payment_method} for ${selectedInvoices.length} invoice(s)`,
                  referenceNumber: formData.transaction_reference,
                  currencyCode: formData.payment_currency,
                  exchangeRate: formData.exchange_rate,
                });

                for (const result of paymentResults) {
                  paidInvoiceIds.push(result.payment.invoice_id);
                  if (!zohoPaymentId) zohoPaymentId = result.payment.payment_id;
                }
                zohoInvoiceId = paidInvoiceIds.join(',');

                successMessage += lang === 'es'
                  ? `\n${paidInvoiceIds.length} factura(s) marcada(s) como pagada(s) en Zoho Books.`
                  : `\n${paidInvoiceIds.length} invoice(s) marked as paid in Zoho Books.`;
              } else {
                const allowCrossCurrency = !!formData.exchange_rate;
                const foundInvoiceId = await zohoClient.findUnpaidInvoiceForCustomer(
                  formData.client_email,
                  paymentPayload.payment_amount,
                  formData.payment_currency,
                  allowCrossCurrency
                );
                zohoInvoiceId = foundInvoiceId || undefined;
                if (zohoInvoiceId) {
                  const paymentResponse = await zohoClient.recordPayment({
                    invoiceId: zohoInvoiceId,
                    amount: paymentPayload.payment_amount,
                    paymentDate: new Date().toISOString().split('T')[0],
                    paymentMode,
                    description: `Payment via ${formData.payment_method}`,
                    referenceNumber: formData.transaction_reference,
                    currencyCode: formData.payment_currency,
                    exchangeRate: formData.exchange_rate,
                  });
                  zohoPaymentId = paymentResponse.payment.payment_id;
                  successMessage += lang === 'es'
                    ? '\nPago registrado en Zoho Books.'
                    : '\nPayment recorded in Zoho Books.';
                }
              }
            } catch (zohoError) {
              console.error('Error recording payment in Zoho Books:', zohoError);
              successMessage += lang === 'es'
                ? '\nPago guardado localmente. Integración bancaria/Zoho pendiente de configuración.'
                : '\nPayment saved locally. Bank/Zoho integration is not configured yet.';
            }
          } else {
            successMessage += lang === 'es'
              ? '\nPago guardado localmente. Integración bancaria/Zoho pendiente de configuración.'
              : '\nPayment saved locally. Bank/Zoho integration is not configured yet.';
          }
        }

        // Create Google Meet if session is already scheduled
        if (selectedRequest?.scheduled_datetime && selectedRequest.meeting_platform !== 'manual') {
          const meetResult = await createGoogleMeetForPayment(selectedRequest, professional);
          if (meetResult?.meetingUri) {
            successMessage += lang === 'es'
              ? `\nGoogle Meet creado: ${meetResult.meetingUri}`
              : `\nGoogle Meet created: ${meetResult.meetingUri}`;
          }
        }

        const emailResult = await sendPaymentConfirmationEmail(
          {
            clientName: formData.client_name,
            clientEmail: formData.client_email,
            paymentAmount: paymentPayload.payment_amount,
            paymentCurrency: formData.payment_currency,
            paymentMethod: formData.payment_method,
            paymentDate: new Date().toISOString(),
            transactionReference: formData.transaction_reference,
            numSessions: formData.num_sessions,
          },
          lang
        );

        if (emailResult.success) {
          successMessage += lang === 'es'
            ? '\nEmail de confirmación enviado.'
            : '\nConfirmation email sent.';

          if (paymentId) {
            await supabase
              .from('payment_transactions')
              .update({
                email_sent: true,
                email_sent_at: new Date().toISOString(),
                zoho_invoice_id: zohoInvoiceId,
                zoho_payment_id: zohoPaymentId,
              })
              .eq('id', paymentId);
          }
        } else {
          successMessage += lang === 'es'
            ? '\nAdvertencia: No se pudo enviar el email de confirmación.'
            : '\nWarning: Could not send confirmation email.';
        }
      }

      if (zohoInvoiceId && paymentId) {
        await supabase
          .from('payment_transactions')
          .update({
            zoho_invoice_id: zohoInvoiceId,
            zoho_payment_id: zohoPaymentId,
          })
          .eq('id', paymentId);
      }

      alert(successMessage);

      setFormData({ ...EMPTY_PAYMENT_FORM });
      setSelectedRequest(null);
      setSelectedRequestIds(new Set());
      setZohoInvoices([]);
      setSelectedInvoiceIds(new Set());
      setInvoiceDateFrom('');
      setInvoiceDateTo('');
    } catch (error) {
      console.error('Error creating payment transaction:', error);
      alert(
        (language === 'es' ? 'Error al registrar la transacción: ' : 'Failed to record payment transaction: ') +
        (error as Error).message
      );
    } finally {
      setLoading(false);
    }
  };

  // Show loading while fetching data
  if (currentUser && loadingRequests) {
    return (
      <div className="payment-form-container">
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="spinner" style={{
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #4CAF50',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p>{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Show sign-in form if not authenticated
  if (!currentUser) {
    return (
      <div className="payment-form-container">
        <div style={{
          backgroundColor: '#fff3e0',
          border: '2px solid #ff9800',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#ff9800" style={{ marginBottom: '1rem' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <h2 style={{ marginBottom: '1rem', color: '#e65100' }}>
              {language === 'es' ? 'Autenticación Requerida' : 'Authentication Required'}
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#666' }}>
              {language === 'es'
                ? 'Debe iniciar sesión para acceder al formulario de pago. Esto nos permite calcular automáticamente el monto total de sus citas pendientes.'
                : 'You must sign in to access the payment form. This allows us to automatically calculate the total amount from your outstanding appointments.'}
            </p>
          </div>
        </div>
        <SignInForm
          onSubmit={handleSignIn}
          loading={signingIn}
          currentUser={null}
        />
      </div>
    );
  }

  return (
    <div className="payment-form-container">
      <h2>{t('paymentForm') || 'Payment Transaction'}</h2>

      <div style={{
        backgroundColor: '#fff8e1',
        border: '1px solid #ffcc80',
        borderLeft: '4px solid #f57c00',
        borderRadius: '8px',
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        color: '#7a4f01',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
          <span>{language === 'es' ? 'Modo de pago manual temporal' : 'Temporary manual payment mode'}</span>
        </div>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>
          {language === 'es'
            ? 'Los pagos se registran localmente mientras se termina la configuración bancaria/Zoho. Puede registrar pagos sin procesamiento de tarjeta en esta etapa.'
            : 'Payments are being recorded locally while bank/Zoho setup is completed. You can record payments without card processing at this stage.'}
        </div>
      </div>

      {/* Session list — one line each, with status filter */}
      <div className="payment-session-list">
        <div className="payment-session-list__header">
          <h3>
            {language === 'es' ? 'Sesiones' : 'Sessions'}
            {currentUser.full_name ? ` — ${currentUser.full_name.split(/\s+/)[0]}` : ''}
          </h3>
          <label className="payment-session-list__status">
            <span>{language === 'es' ? 'Estado' : 'Status'}</span>
            <select
              value={statusFilter === 'all' ? 'all' : String(statusFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setStatusFilter(v === 'all' ? 'all' : Number(v) as SessionStatusCode);
              }}
            >
              <option value="all">{language === 'es' ? 'Todos' : 'All'}</option>
              {getSessionStatusOptions(language).map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {pendingRequestsError && (
          <p className="payment-session-list__error">{pendingRequestsError}</p>
        )}

        {filteredPendingRequests.length > 0 ? (
          <ul className="payment-session-list__rows">
            {filteredPendingRequests.map((req) => {
              const isSelected = Boolean(req.id && selectedRequestIds.has(req.id));
              const key = req.id || `${req.client_email}-${req.preferred_date}`;
              const dateLabel = req.preferred_date
                ? new Date(req.preferred_date.includes('T') ? req.preferred_date : `${req.preferred_date}T12:00:00`).toLocaleDateString()
                : '—';
              const timeLabel = req.preferred_time || '—';
              const clientLabel = req.client_name || req.full_name || req.username || req.client_email || '—';
              const prof = req.professional_id ? professionalNames[req.professional_id] : undefined;
              const profLabel = prof ? (language === 'es' ? prof.es : prof.en) : '';
              const due = sessionDueAmount(req, sessionPrices);
              const amountLabel = due.amount > 0
                ? `${due.currency} ${due.amount.toFixed(2)}`.trim()
                : '—';
              const statusCode = getClientRequestStatusValue(req);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`payment-session-line${isSelected ? ' is-selected' : ''}`}
                    onClick={() => toggleSessionSelection(req)}
                  >
                    <span className="payment-session-line__check" aria-hidden="true">
                      {isSelected ? '☑' : '☐'}
                    </span>
                    <span className="payment-session-line__when">{dateLabel} {timeLabel}</span>
                    <span className="payment-session-line__who" title={clientLabel}>{clientLabel}</span>
                    {profLabel && (
                      <span className="payment-session-line__pro" title={profLabel}>{profLabel}</span>
                    )}
                    <span className="payment-session-line__amt">{amountLabel}</span>
                    <span className="payment-session-line__st">{getSessionStatusLabel(statusCode, language)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="payment-session-list__empty">
            {language === 'es'
              ? 'No hay sesiones con ese estado para este usuario.'
              : 'No sessions with that status for this user.'}
          </p>
        )}

        {selectedSessions.length > 0 ? (
          <p className="payment-session-list__hint">
            {language === 'es'
              ? `Monto a pagar = total de ${selectedSessions.length} sesión(es) seleccionada(s).`
              : `Amount to pay = total of ${selectedSessions.length} selected session(s).`}
          </p>
        ) : (
          <p className="payment-session-list__hint">
            {language === 'es'
              ? 'Seleccione una o más sesiones. El monto a pagar será el total adeudado.'
              : 'Select one or more sessions. Amount to pay will be the total due.'}
          </p>
        )}

        {selectedUnpaidPending.length > 0 && (
          <div className="payment-session-list__cancel-bar">
            <p>
              {language === 'es'
                ? `Cambiar ${selectedUnpaidPending.length} sesión(es) pendiente(s) a Cancelado sin pago. Las filas no se eliminan.`
                : `Change ${selectedUnpaidPending.length} pending session(s) to Canceled no payment. Rows will not be deleted.`}
            </p>
            <button
              type="button"
              className="payment-session-list__cancel-confirm"
              onClick={() => void handleConfirmCanceledNoPayment()}
              disabled={cancelNoPaySubmitting}
            >
              {cancelNoPaySubmitting
                ? (language === 'es' ? 'Guardando…' : 'Saving…')
                : (language === 'es' ? 'Confirmar' : 'Confirm')}
            </button>
            {cancelNoPayError && (
              <p className="payment-session-list__error">{cancelNoPayError}</p>
            )}
          </div>
        )}
      </div>

        {/* Totals + currency view */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#e8f5e9',
          borderRadius: '4px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <strong style={{ fontSize: '1.1rem', color: '#2e7d32' }}>
              {language === 'es' ? 'Monto a pagar:' : 'Amount to pay:'}
            </strong>
            <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4CAF50' }}>
              {formData.payment_currency} {formData.payment_amount.toFixed(2)}
            </span>
          </div>

          <div style={{
            borderTop: '1px solid #a5d6a7',
            paddingTop: '1rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap'
            }}>
              <label htmlFor="display_currency_outstanding" style={{
                fontSize: '0.9rem',
                color: '#2e7d32',
                whiteSpace: 'nowrap'
              }}>
                {language === 'es' ? 'Ver en:' : 'View in:'}
              </label>
              <select
                id="display_currency_outstanding"
                value={displayCurrency.code}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #a5d6a7',
                  fontSize: '0.9rem',
                  backgroundColor: 'white'
                }}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.symbol}
                  </option>
                ))}
              </select>
              {displayCurrency.code !== formData.payment_currency && (
                <span style={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: '#1976d2',
                  marginLeft: 'auto'
                }}>
                  {displayCurrency.symbol} {convertedAmount.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-section">
          <h3>{t('clientInformation') || 'Client Information'}</h3>

          <div className="form-group">
            <label htmlFor="client_name">
              {t('clientName') || 'Client Name'} <span className="required">*</span>
            </label>
            <input
              type="text"
              id="client_name"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="client_email">
              {t('clientEmail') || 'Client Email'} <span className="required">*</span>
            </label>
            <input
              type="email"
              id="client_email"
              name="client_email"
              value={formData.client_email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="client_phone">
              {t('clientPhone') || 'Client Phone'}
            </label>
            <input
              type="tel"
              id="client_phone"
              name="client_phone"
              value={formData.client_phone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>{t('paymentDetails') || 'Payment Details'}</h3>

          <div className="form-group">
            <label htmlFor="payment_amount">
              {t('paymentAmount') || 'Payment Amount'} <span className="required">*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                id="payment_currency"
                name="payment_currency"
                value={formData.payment_currency}
                disabled
                style={{ width: '120px', backgroundColor: '#f7fafc' }}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
              <input
                type="number"
                id="payment_amount"
                value={Number(formData.payment_amount || 0).toFixed(2)}
                readOnly
                min="0"
                step="0.01"
                required
                style={{ flex: 1, backgroundColor: '#f7fafc' }}
              />
            </div>
            <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
              {language === 'es'
                ? 'El monto es el total adeudado de las sesiones seleccionadas.'
                : 'Amount equals the total due for the selected sessions.'}
            </small>
          </div>

          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '0.75rem'
            }}>
              <label htmlFor="display_currency" style={{
                fontWeight: '500',
                color: '#333',
                whiteSpace: 'nowrap'
              }}>
                {language === 'es' ? 'Ver en otra moneda:' : 'View in another currency:'}
              </label>
              <select
                id="display_currency"
                value={displayCurrency.code}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '1rem',
                  flex: 1,
                  maxWidth: '300px'
                }}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.name} ({currency.symbol})
                  </option>
                ))}
              </select>
            </div>

            {displayCurrency.code !== formData.payment_currency && (
              <div style={{
                backgroundColor: '#e3f2fd',
                border: '1px solid #2196F3',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '0.75rem'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: '#1565c0', fontWeight: '500' }}>
                      {language === 'es' ? 'Monto Convertido:' : 'Converted Amount:'}
                    </span>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                      {language === 'es' ? 'Tasa de cambio:' : 'Exchange rate:'} 1 {formData.payment_currency} = {(displayCurrency.rate / (CURRENCIES.find(c => c.code === formData.payment_currency)?.rate || 1)).toFixed(4)} {displayCurrency.code}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: '#1976d2'
                  }}>
                    {displayCurrency.symbol} {convertedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="label-with-ai-inline">
              <label htmlFor="payment_method">
                {t('paymentMethod') || 'Payment Method'} <span className="required">*</span>
              </label>
              <button
                type="button"
                className="ai-explain-button-inline"
                onClick={() => handleExplainField('payment_method')}
                title={t('explainField') || 'Explain this field'}
              >
                <GeminiAiIcon />
              </button>
            </div>
            <select
              id="payment_method"
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              required
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {language === 'es' ? method.es : method.en}
                </option>
              ))}
            </select>
          </div>

          {isPseFieldsMethod(formData.payment_method) && (
            <div className="pse-transfer-fields">
              <h4 className="pse-transfer-fields__title">
                {isWompiPseMethod(formData.payment_method)
                  ? (language === 'es' ? 'Datos Wompi PSE' : 'Wompi PSE details')
                  : (language === 'es' ? 'Datos de transferencia PSE' : 'PSE bank transfer details')}
              </h4>

              <div className="form-group">
                <label htmlFor="pse_type">
                  Type <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="pse_type"
                  name="type"
                  value="PSE"
                  readOnly
                  required
                  style={{ backgroundColor: '#f7fafc' }}
                />
                <small>{language === 'es' ? 'Debe ser PSE.' : 'Must be PSE.'}</small>
              </div>

              <div className="form-group">
                <label htmlFor="user_type">
                  {language === 'es' ? 'Tipo de usuario' : 'User type'} <span className="required">*</span>
                </label>
                <select
                  id="user_type"
                  name="user_type"
                  value={formData.user_type ?? 0}
                  onChange={handleChange}
                  required
                >
                  <option value={0}>{language === 'es' ? '0 — Persona natural' : '0 — Individual'}</option>
                  <option value={1}>{language === 'es' ? '1 — Empresa' : '1 — Business'}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="user_legal_id_type">
                  {language === 'es' ? 'Tipo de identificación' : 'ID type'} <span className="required">*</span>
                </label>
                <select
                  id="user_legal_id_type"
                  name="user_legal_id_type"
                  value={formData.user_legal_id_type || (formData.user_type === 1 ? 'NIT' : 'CC')}
                  onChange={handleChange}
                  required
                >
                  {PSE_LEGAL_ID_TYPES.map((idType) => (
                    <option key={idType.value} value={idType.value}>
                      {language === 'es' ? idType.es : idType.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="user_legal_id">
                  {language === 'es' ? 'Número de identificación / NIT' : 'ID / tax registration number'} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="user_legal_id"
                  name="user_legal_id"
                  value={formData.user_legal_id || ''}
                  onChange={handleChange}
                  required
                  placeholder={formData.user_type === 1 ? 'NIT' : 'CC'}
                />
              </div>

              <div className="form-group">
                <label htmlFor="financial_institution_code">
                  {language === 'es' ? 'Banco (código)' : 'Bank (institution code)'} <span className="required">*</span>
                </label>
                <select
                  id="financial_institution_code"
                  name="financial_institution_code"
                  value={formData.financial_institution_code || ''}
                  onChange={handleChange}
                  required
                >
                  <option value="">
                    {language === 'es' ? 'Seleccione un banco' : 'Select a bank'}
                  </option>
                  {PSE_BANKS.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.code} — {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="payment_description">
                  {language === 'es' ? 'Descripción del pago' : 'Payment description'} <span className="required">*</span>
                </label>
                <textarea
                  id="payment_description"
                  name="payment_description"
                  value={formData.payment_description || ''}
                  onChange={handleChange}
                  required
                  rows={3}
                  placeholder={
                    language === 'es'
                      ? 'Motivo de la transferencia'
                      : 'Reason for this transaction'
                  }
                />
              </div>
            </div>
          )}

          {!isWompiOnlineMethod(formData.payment_method) && (
          <>
          <div className="form-group">
            <div className="label-with-ai-inline">
              <label htmlFor="payment_status">
                {t('paymentStatus') || 'Payment Status'} <span className="required">*</span>
              </label>
              <button
                type="button"
                className="ai-explain-button-inline"
                onClick={() => handleExplainField('payment_status')}
                title={t('explainField') || 'Explain this field'}
              >
                <GeminiAiIcon />
              </button>
            </div>
            <select
              id="payment_status"
              name="payment_status"
              value={formData.payment_status}
              onChange={handleChange}
              required
            >
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="label-with-ai-inline">
              <label htmlFor="transaction_reference">
                {formData.payment_method === 'PayPal'
                  ? (language === 'es' ? 'ID de transacción de PayPal' : 'PayPal transaction ID')
                  : (language === 'es' ? 'Confirmación / referencia de transferencia' : 'Transfer confirmation / reference')}
              </label>
              <button
                type="button"
                className="ai-explain-button-inline"
                onClick={() => handleExplainField('transaction_reference')}
                title={t('explainField') || 'Explain this field'}
              >
                <GeminiAiIcon />
              </button>
            </div>
            <input
              type="text"
              id="transaction_reference"
              name="transaction_reference"
              value={formData.transaction_reference}
              onChange={handleChange}
              placeholder={
                formData.payment_method === 'PayPal'
                  ? (language === 'es' ? 'ej. 8A412345678901234' : 'e.g. 8A412345678901234')
                  : (language === 'es' ? 'ej. número de transferencia o comprobante' : 'e.g. wire confirmation or receipt number')
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">
              {t('notes') || 'Notes'}
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder={t('additionalNotes') || 'Additional notes about this transaction...'}
            />
          </div>
          </>
          )}
        </div>

        {showExplanation && (
          <div className="form-explanation-panel" style={{ marginBottom: '1.5rem' }}>
            <div className="explanation-panel-header">
              <h4>{t('fieldExplanation') || 'Field Explanation'}</h4>
              <button
                type="button"
                className="close-explanation-button"
                onClick={() => setShowExplanation(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div className="explanation-panel-content">
              {loadingExplanation ? (
                <div className="loading-spinner">
                  <div className="spinner"></div>
                  <p>{t('loading') || 'Loading...'}</p>
                </div>
              ) : (
                <div className="explanation-text">
                  {explanation.split('\n').map((paragraph, index) => (
                    paragraph.trim() && <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedInvoices.length > 0 && (
          <div className="invoice-payment-summary">
            <h3 className="invoice-payment-summary-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1b5e20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {language === 'es' ? 'Facturas a Pagar' : 'Invoices to Pay'}
            </h3>
            <div className="invoice-payment-summary-list">
              {selectedInvoices.map((inv) => (
                <div key={inv.invoice_id} className="invoice-payment-summary-row">
                  <div className="invoice-payment-summary-info">
                    <span className="invoice-payment-summary-number">{inv.invoice_number}</span>
                    <span className="invoice-payment-summary-date">{inv.date}</span>
                    {inv.due_date && (
                      <span className="invoice-payment-summary-due">
                        {language === 'es' ? 'Vence:' : 'Due:'} {inv.due_date}
                      </span>
                    )}
                  </div>
                  <span className="invoice-payment-summary-amount">
                    {inv.currency_code} {inv.balance.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="invoice-payment-summary-footer">
              <strong>{language === 'es' ? 'Total a Pagar:' : 'Total to Pay:'}</strong>
              <strong className="invoice-payment-summary-total">
                {selectedInvoices[0]?.currency_code} {selectedInvoicesTotal.toFixed(2)}
              </strong>
            </div>
          </div>
        )}

        {invoiceCreationError && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
            fontSize: '0.9rem',
          }}>
            <strong>{language === 'es' ? 'Error de facturación:' : 'Invoice Error:'}</strong> {invoiceCreationError}
          </div>
        )}

        {invoiceCreated && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '4px',
            color: '#2e7d32',
            fontSize: '0.9rem',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            {language === 'es' ? 'Factura creada y enviada exitosamente.' : 'Invoice created and emailed successfully.'}
          </div>
        )}

        {meetLink && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196F3',
            borderRadius: '4px',
            color: '#1565c0',
            fontSize: '0.9rem',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
            {language === 'es' ? 'Google Meet creado: ' : 'Google Meet created: '}
            <a href={meetLink} target="_blank" rel="noopener noreferrer" style={{ color: '#1565c0' }}>{meetLink}</a>
          </div>
        )}

        {/* ── Wompi payment details — only when Wompi (Bancolombia) is selected ──── */}
        {formData.payment_method === 'Wompi' && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            borderTop: '1px solid #e0d5cf',
            paddingTop: '1.25rem',
          }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
              {language === 'es'
                ? 'Tokenice la tarjeta con Wompi y luego complete el pago.'
                : 'Tokenize the card with Wompi, then complete payment.'}
            </p>

            <div className="wompi-card-fields">
              <h4 className="wompi-card-fields__title">
                {language === 'es' ? 'Pago con tarjeta Wompi' : 'Wompi credit card'}
              </h4>

              <div className="form-group">
                <label htmlFor="card_holder">
                  {language === 'es' ? 'Nombre en la tarjeta' : 'Card holder'} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="card_holder"
                  autoComplete="cc-name"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder={language === 'es' ? 'Nombre del titular' : 'Name on card'}
                />
              </div>

              <div className="form-group">
                <label htmlFor="card_number">
                  {language === 'es' ? 'Número de tarjeta' : 'Card number'} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="card_number"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="XXXX XXXX XXXX XXXX"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 7rem' }}>
                  <label htmlFor="card_exp_month">{language === 'es' ? 'Mes' : 'Month'}</label>
                  <select
                    id="card_exp_month"
                    autoComplete="cc-exp-month"
                    value={cardExpMonth}
                    onChange={(e) => setCardExpMonth(e.target.value)}
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 7rem' }}>
                  <label htmlFor="card_exp_year">{language === 'es' ? 'Año' : 'Year'}</label>
                  <select
                    id="card_exp_year"
                    autoComplete="cc-exp-year"
                    value={cardExpYear}
                    onChange={(e) => setCardExpYear(e.target.value)}
                  >
                    <option value="">YY</option>
                    {Array.from({ length: 12 }, (_, i) => String((new Date().getFullYear() + i) % 100).padStart(2, '0')).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 7rem' }}>
                  <label htmlFor="card_cvc">CVC</label>
                  <input
                    type="password"
                    id="card_cvc"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    maxLength={4}
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ''))}
                    placeholder="***"
                  />
                </div>
              </div>

              <button
                type="button"
                className="wompi-tokenize-button"
                onClick={handleTokenizeWompiCard}
                disabled={tokenizingCard || wompiLoading}
              >
                {tokenizingCard
                  ? (language === 'es' ? 'Tokenizando…' : 'Tokenizing…')
                  : (language === 'es' ? 'Tokenizar tarjeta (POST /v1/tokens/cards)' : 'Tokenize card (POST /v1/tokens/cards)')}
              </button>
              {cardLastFour && (
                <p className="wompi-card-fields__hint">
                  {cardBrand ? `${cardBrand} ` : ''}
                  {language === 'es' ? `terminada en ${cardLastFour}` : `ending in ${cardLastFour}`}
                </p>
              )}

              <div className="form-group">
                <label htmlFor="wompi_type">
                  Type <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="wompi_type"
                  value="CARD"
                  readOnly
                  style={{ backgroundColor: '#f7fafc' }}
                />
                <small>{language === 'es' ? 'Debe ser CARD.' : 'Must be CARD.'}</small>
              </div>

              <div className="form-group">
                <label htmlFor="wompi_token">
                  Token <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="wompi_token"
                  name="token"
                  value={formData.token || ''}
                  onChange={handleChange}
                  placeholder="tok_"
                  style={{ backgroundColor: formData.token?.startsWith('tok_') ? '#f7fafc' : undefined }}
                />
                <small>
                  {language === 'es'
                    ? 'Debe comenzar con tok_ después de tokenizar.'
                    : 'Must start with tok_ after tokenization.'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="installments">
                  {language === 'es' ? 'Cuotas' : 'Installments'} <span className="required">*</span>
                </label>
                <select
                  id="installments"
                  name="installments"
                  value={formData.installments ?? 1}
                  onChange={handleChange}
                  required
                >
                  {WOMPI_INSTALLMENTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Wompi status banners */}
            {wompiStatus === 'verifying' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fff8e1',
                border: '1px solid #ffcc80',
                borderRadius: '6px',
                color: '#7a4f01',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <div style={{ width: 18, height: 18, border: '2px solid #f57c00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                {language === 'es' ? 'Verificando pago de Wompi…' : 'Verifying Wompi payment…'}
              </div>
            )}

            {wompiStatus === 'approved' && (
              <div style={{
                padding: '0.85rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#e8f5e9',
                border: '1px solid #4caf50',
                borderLeft: '4px solid #2e7d32',
                borderRadius: '6px',
                color: '#1b5e20',
                fontSize: '0.9rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                  <strong>
                    {language === 'es' ? '¡Pago de Wompi aprobado!' : 'Wompi payment approved!'}
                  </strong>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {language === 'es' ? 'Referencia:' : 'Reference:'} {wompiTransactionId}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  {language === 'es'
                    ? 'Haga clic en "Confirmar Sesión" para registrar el pago en Zoho, crear el Google Meet y enviar el email.'
                    : 'Click "Confirm Session" to record the payment in Zoho, create the Google Meet, and send the confirmation email.'}
                </div>
              </div>
            )}

            {wompiStatus === 'declined' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '6px',
                color: '#c33',
                fontSize: '0.9rem',
              }}>
                <strong>
                  {language === 'es' ? 'Pago de Wompi rechazado.' : 'Wompi payment declined.'}
                </strong>
                {' '}
                {language === 'es'
                  ? 'Por favor intente de nuevo o use otro método.'
                  : 'Please try again or use a different payment method.'}
              </div>
            )}

            {wompiStatus === 'error' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fff3e0',
                border: '1px solid #ffcc80',
                borderRadius: '6px',
                color: '#7a4f01',
                fontSize: '0.9rem',
              }}>
                <strong>
                  {language === 'es' ? 'No se pudo verificar el pago de Wompi.' : 'Could not verify Wompi payment.'}
                </strong>
                {wompiTransactionId && (
                  <span> {language === 'es' ? 'ID de transacción:' : 'Transaction ID:'} {wompiTransactionId}</span>
                )}
              </div>
            )}

            {/* Pay with Wompi button */}
            {wompiStatus !== 'approved' && (
              <button
                type="button"
                className="wompi-button"
                onClick={handleWompiCheckout}
                disabled={
                  wompiLoading || loading || wompiStatus === 'verifying' || tokenizingCard ||
                  !formData.client_request_id ||
                  !formData.payment_amount ||
                  formData.payment_amount <= 0 ||
                  !(formData.token || '').startsWith('tok_')
                }
                title={
                  !formData.client_request_id
                    ? (language === 'es' ? 'Seleccione una solicitud pendiente' : 'Select a pending request first')
                    : !(formData.token || '').startsWith('tok_')
                      ? (language === 'es' ? 'Tokenice la tarjeta primero' : 'Tokenize the card first')
                      : undefined
                }
              >
                {wompiLoading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {language === 'es' ? 'Redirigiendo a Wompi…' : 'Redirecting to Wompi…'}
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}>
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    {language === 'es' ? 'Detalles de pago' : 'Payment details'}
                  </>
                )}
              </button>
            )}

            {/* Confirm Session button — enabled only after Wompi payment is approved */}
            {wompiStatus === 'approved' && (
              <button
                type="button"
                className="wompi-confirm-button"
                onClick={confirmWompiSession}
                disabled={loading || creatingGoogleMeet}
              >
                {loading || creatingGoogleMeet ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {t('processing') || 'Processing…'}
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}>
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                    {language === 'es' ? 'Confirmar Sesión' : 'Confirm Session'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        )}
        {/* ── end Wompi payment details ───────────────────────────────── */}

        {isWompiPseMethod(formData.payment_method) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            borderTop: '1px solid #e0d5cf',
            paddingTop: '1.25rem',
          }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
              {language === 'es'
                ? 'Wompi abrirá el banco PSE para completar el pago. Al volver, confirme la sesión.'
                : 'Wompi will open your PSE bank to complete payment. When you return, confirm the session.'}
            </p>

            {wompiStatus === 'verifying' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fff8e1',
                border: '1px solid #ffcc80',
                borderRadius: '6px',
                color: '#7a4f01',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <div style={{ width: 18, height: 18, border: '2px solid #f57c00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                {language === 'es' ? 'Verificando pago PSE de Wompi…' : 'Verifying Wompi PSE payment…'}
              </div>
            )}

            {wompiStatus === 'approved' && (
              <div style={{
                padding: '0.85rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#e8f5e9',
                border: '1px solid #4caf50',
                borderLeft: '4px solid #2e7d32',
                borderRadius: '6px',
                color: '#1b5e20',
                fontSize: '0.9rem',
              }}>
                <strong>
                  {language === 'es' ? '¡Pago PSE de Wompi aprobado!' : 'Wompi PSE payment approved!'}
                </strong>
                <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.3rem' }}>
                  {language === 'es' ? 'Referencia:' : 'Reference:'} {wompiTransactionId}
                </div>
              </div>
            )}

            {wompiStatus === 'declined' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '6px',
                color: '#c33',
                fontSize: '0.9rem',
              }}>
                <strong>
                  {language === 'es' ? 'Pago PSE de Wompi rechazado.' : 'Wompi PSE payment declined.'}
                </strong>
              </div>
            )}

            {wompiStatus === 'error' && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#fff3e0',
                border: '1px solid #ffcc80',
                borderRadius: '6px',
                color: '#7a4f01',
                fontSize: '0.9rem',
              }}>
                <strong>
                  {language === 'es' ? 'No se pudo verificar el pago PSE de Wompi.' : 'Could not verify Wompi PSE payment.'}
                </strong>
              </div>
            )}

            {wompiStatus !== 'approved' && (
              <button
                type="button"
                className="wompi-button"
                onClick={() => void handleWompiPseCheckout()}
                disabled={
                  wompiLoading || loading || wompiStatus === 'verifying' ||
                  !formData.client_request_id ||
                  !formData.payment_amount ||
                  formData.payment_amount <= 0 ||
                  !formData.user_legal_id?.trim() ||
                  !formData.financial_institution_code?.trim() ||
                  !formData.payment_description?.trim()
                }
              >
                {wompiLoading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {language === 'es' ? 'Abriendo banco PSE…' : 'Opening PSE bank…'}
                  </>
                ) : (
                  language === 'es' ? 'Pagar con Wompi PSE' : 'Pay with Wompi PSE'
                )}
              </button>
            )}

            {wompiStatus === 'approved' && (
              <button
                type="button"
                className="wompi-confirm-button"
                onClick={confirmWompiSession}
                disabled={loading || creatingGoogleMeet}
              >
                {loading || creatingGoogleMeet
                  ? (t('processing') || 'Processing…')
                  : (language === 'es' ? 'Confirmar Sesión' : 'Confirm Session')}
              </button>
            )}
          </div>
        </div>
        )}

        {!isWompiOnlineMethod(formData.payment_method) && (
        <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1.25rem' }}>
        <button
          type="submit"
          className="submit-button"
          disabled={
            loading || creatingInvoice || creatingGoogleMeet ||
            !formData.client_request_id ||
            !formData.payment_currency ||
            !formData.payment_amount ||
            formData.payment_amount <= 0
          }
          title={
            !formData.client_request_id
              ? (language === 'es' ? 'Seleccione una solicitud pendiente para registrar el pago.' : 'Select a pending request to record the payment.')
              : formData.payment_amount <= 0
                ? (language === 'es' ? 'Falta el monto a pagar para registrar el pago.' : 'Missing amount to pay to record the payment.')
                : undefined
          }
        >
          {(loading || creatingInvoice || creatingGoogleMeet)
            ? (t('processing') || 'Processing...')
            : (t('recordPayment') || 'Record Payment')}
        </button>
        </div>
        )}
      </form>

      {showZohoTokenGenerator && (
        <ZohoTokenGenerator onClose={() => setShowZohoTokenGenerator(false)} />
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .payment-form-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
          background: #fff;
        }

        .payment-form-container h2 {
          margin-bottom: 1.25rem;
          color: #2d3748;
        }

        .payment-session-list {
          background: rgba(255,255,255,0.78);
          border: 1px solid rgba(212,175,55,0.35);
          border-radius: 10px;
          padding: 1rem 1.1rem 0.85rem;
          margin-bottom: 1.25rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        }

        .payment-session-list__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 0.65rem;
        }

        .payment-session-list__header h3 {
          margin: 0;
          color: #1a3c3a;
          font-size: 1.05rem;
        }

        .payment-session-list__status {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: #334155;
        }

        .payment-session-list__status select {
          padding: 0.3rem 0.55rem;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          font-size: 0.85rem;
        }

        .payment-session-list__rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .payment-session-line {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.4rem 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
          text-align: left;
          font-size: 0.88rem;
          color: #1e293b;
          line-height: 1.25;
        }

        .payment-session-line:hover {
          border-color: #c9a227;
          background: #fffbeb;
        }

        .payment-session-line.is-selected {
          border-color: #1a3c3a;
          background: #ecfdf5;
          box-shadow: inset 3px 0 0 #1a3c3a;
        }

        .payment-session-line__check {
          flex: 0 0 1rem;
          color: #1a3c3a;
        }

        .payment-session-line__when {
          flex: 0 0 9.5rem;
          white-space: nowrap;
          font-weight: 600;
        }

        .payment-session-line__who,
        .payment-session-line__pro {
          flex: 1 1 8rem;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .payment-session-line__amt {
          flex: 0 0 7rem;
          text-align: right;
          font-weight: 700;
          color: #166534;
          white-space: nowrap;
        }

        .payment-session-line__st {
          flex: 0 0 7.5rem;
          text-align: right;
          color: #475569;
          white-space: nowrap;
          font-size: 0.8rem;
        }

        .payment-session-list__empty,
        .payment-session-list__error,
        .payment-session-list__hint {
          margin: 0.35rem 0 0;
          font-size: 0.85rem;
        }

        .payment-session-list__error { color: #b91c1c; }
        .payment-session-list__hint { color: #166534; }

        .payment-session-list__cancel-bar {
          margin-top: 0.75rem;
          padding: 0.75rem 0.85rem;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fef2f2;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem 0.85rem;
        }

        .payment-session-list__cancel-bar p {
          margin: 0;
          flex: 1 1 16rem;
          font-size: 0.88rem;
          color: #7f1d1d;
          line-height: 1.4;
        }

        .payment-session-list__cancel-confirm {
          padding: 0.45rem 1.15rem;
          border: none;
          border-radius: 8px;
          background: #b91c1c;
          color: #fff;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
        }

        .payment-session-list__cancel-confirm:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .payment-form {
          background: rgba(255,255,255,0.78);
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        }

        .pse-transfer-fields {
          margin: 0 0 1.5rem;
          padding: 1rem 1.1rem 0.25rem;
          border: 1px solid #c9a227;
          border-radius: 8px;
          background: #fffbeb;
        }

        .pse-transfer-fields__title {
          margin: 0 0 1rem;
          font-size: 1rem;
          color: #1a3c3a;
        }

        .wompi-card-fields {
          margin: 0 0 1.25rem;
          padding: 1rem 1.1rem 0.35rem;
          border: 1px solid #c7d2fe;
          border-radius: 8px;
          background: #eef2ff;
          text-align: left;
        }

        .wompi-card-fields__title {
          margin: 0 0 1rem;
          font-size: 1rem;
          color: #1e3a8a;
        }

        .wompi-card-fields__hint {
          margin: 0.35rem 0 0.85rem;
          font-size: 0.85rem;
          color: #166534;
        }

        .wompi-tokenize-button {
          width: 100%;
          margin-bottom: 1rem;
          padding: 0.7rem 1rem;
          background: #4338ca;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .wompi-tokenize-button:disabled {
          background: #a5b4fc;
          cursor: not-allowed;
        }

        .wompi-card-fields small {
          display: block;
          margin-top: 0.35rem;
          color: #666;
        }

        .form-section {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #e0e0e0;
        }

        .form-section:last-of-type {
          border-bottom: none;
        }

        .form-section h3 {
          margin-bottom: 1.5rem;
          color: #555;
          font-size: 1.1rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #4CAF50;
        }

        .required {
          color: #f44336;
        }

        .payment-summary {
          background: #f5f5f5;
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          font-size: 1rem;
        }

        .summary-row.total {
          border-top: 2px solid #ddd;
          margin-top: 0.5rem;
          padding-top: 1rem;
          font-weight: bold;
          font-size: 1.2rem;
          color: #4CAF50;
        }

        .summary-row .amount {
          font-weight: 600;
          color: #333;
        }

        .summary-row.total .amount {
          color: #4CAF50;
        }

        .submit-button {
          width: 100%;
          padding: 1rem;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        .submit-button:hover:not(:disabled) {
          background: #45a049;
        }

        .submit-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .wompi-button {
          width: 100%;
          padding: 0.9rem 1rem;
          background: #5B2FC9;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .wompi-button:hover:not(:disabled) {
          background: #4922a8;
        }

        .wompi-button:disabled {
          background: #9e87d6;
          cursor: not-allowed;
        }

        .wompi-confirm-button {
          width: 100%;
          padding: 1rem;
          background: #2e7d32;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 1.05rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(46,125,50,0.35);
        }

        .wompi-confirm-button:hover:not(:disabled) {
          background: #1b5e20;
        }

        .wompi-confirm-button:disabled {
          background: #a5d6a7;
          cursor: not-allowed;
        }

        .invoice-search-panel {
          background: white;
          padding: 1.5rem 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 2rem;
          border-top: 3px solid #2e7d32;
        }

        .invoice-search-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 0.5rem;
          color: #2e7d32;
          font-size: 1.15rem;
        }

        .invoice-section-desc {
          color: #666;
          font-size: 0.9rem;
          margin: 0 0 1rem;
        }

        .invoice-date-filter {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 0.75rem;
          align-items: end;
          margin-bottom: 1rem;
        }

        .invoice-date-field label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #4a5568;
          margin-bottom: 0.3rem;
        }

        .invoice-date-field input {
          width: 100%;
          padding: 0.6rem 0.75rem;
          border: 1.5px solid #d1d9e6;
          border-radius: 6px;
          font-size: 0.9rem;
          background: white;
          box-sizing: border-box;
        }

        .invoice-date-field input:focus {
          outline: none;
          border-color: #4CAF50;
          box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
        }

        .invoice-fetch-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 1.2rem;
          background: #2e7d32;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          height: fit-content;
        }

        .invoice-fetch-btn:hover:not(:disabled) {
          background: #1b5e20;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(46, 125, 50, 0.3);
        }

        .invoice-fetch-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .invoice-error {
          margin: 0.5rem 0;
          padding: 0.6rem 0.85rem;
          font-size: 0.875rem;
          color: #991b1b;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 6px;
        }

        .invoice-list {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .invoice-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #f7fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .invoice-select-all {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          color: #4a5568;
        }

        .invoice-select-all input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #4CAF50;
        }

        .invoice-count {
          font-size: 0.85rem;
          color: #718096;
          font-weight: 500;
        }

        .invoice-item {
          display: flex;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: all 0.15s;
        }

        .invoice-item:last-child {
          border-bottom: none;
        }

        .invoice-item:hover {
          background: #f0faf0;
        }

        .invoice-item-selected {
          background: #e8f5e9;
          border-left: 3px solid #4CAF50;
        }

        .invoice-item-selected:hover {
          background: #dcedc8;
        }

        .invoice-item-check {
          display: flex;
          align-items: center;
          padding-top: 2px;
        }

        .invoice-item-check input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #4CAF50;
        }

        .invoice-item-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .invoice-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .invoice-item-number {
          font-weight: 700;
          color: #1a365d;
          font-size: 0.95rem;
        }

        .invoice-item-status {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
          text-transform: capitalize;
          background: #fff3e0;
          color: #e65100;
        }

        .invoice-item-date,
        .invoice-item-due {
          font-size: 0.825rem;
          color: #718096;
        }

        .invoice-item-total {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .invoice-item-balance {
          font-size: 0.9rem;
          font-weight: 700;
          color: #2e7d32;
        }

        .invoice-payment-summary {
          background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%);
          border: 2px solid #4CAF50;
          border-radius: 10px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .invoice-payment-summary-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 1rem;
          color: #1b5e20;
          font-size: 1.1rem;
        }

        .invoice-payment-summary-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .invoice-payment-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.65rem 0.75rem;
          border-bottom: 1px solid #c8e6c9;
          background: rgba(255, 255, 255, 0.6);
          transition: background 0.15s;
        }

        .invoice-payment-summary-row:first-child {
          border-radius: 6px 6px 0 0;
        }

        .invoice-payment-summary-row:last-child {
          border-bottom: none;
          border-radius: 0 0 6px 6px;
        }

        .invoice-payment-summary-row:hover {
          background: rgba(255, 255, 255, 0.9);
        }

        .invoice-payment-summary-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .invoice-payment-summary-number {
          font-weight: 700;
          color: #1a365d;
          font-size: 0.95rem;
        }

        .invoice-payment-summary-date {
          font-size: 0.85rem;
          color: #4a5568;
        }

        .invoice-payment-summary-due {
          font-size: 0.8rem;
          color: #718096;
        }

        .invoice-payment-summary-amount {
          font-weight: 700;
          color: #2e7d32;
          font-size: 0.95rem;
          white-space: nowrap;
        }

        .invoice-payment-summary-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 2px solid #66bb6a;
          font-size: 1.15rem;
          color: #1b5e20;
        }

        .invoice-payment-summary-total {
          font-size: 1.25rem;
          color: #1b5e20;
        }

        @media (max-width: 600px) {
          .invoice-date-filter {
            grid-template-columns: 1fr 1fr;
          }
          .invoice-fetch-btn {
            grid-column: 1 / -1;
          }
          .invoice-item-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.15rem;
          }
        }
      `}</style>
    </div>
  );
}
