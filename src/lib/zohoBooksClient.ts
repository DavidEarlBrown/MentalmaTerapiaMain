interface ZohoCustomer {
  contact_name: string;
  contact_type: 'customer';
  email: string;
  phone?: string;
  mobile?: string;
  website?: string;
  billing_address?: {
    attention?: string;
    address?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  shipping_address?: {
    attention?: string;
    address?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  contact_persons?: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    mobile?: string;
    is_primary_contact: boolean;
  }>;
  notes?: string;
  payment_terms?: number;
  payment_terms_label?: string;
  currency_code?: string;
  twitter?: string;
  facebook?: string;
  gst_treatment?: string;
  gst_no?: string;
  tax_id?: string;
}

interface ZohoLineItem {
  item_id?: string;
  name: string;
  description: string;
  rate: number;
  quantity: number;
  discount?: number;
  tax_id?: string;
}

interface ZohoInvoice {
  customer_id?: string;
  customer_name?: string;
  contact_persons?: string[];
  invoice_number?: string;
  reference_number?: string;
  date: string;
  due_date: string;
  payment_terms?: number;
  payment_terms_label?: string;
  currency_code: string;
  exchange_rate?: number;
  discount?: number;
  is_discount_before_tax?: boolean;
  discount_type?: 'entity_level' | 'item_level';
  is_inclusive_tax?: boolean;
  line_items: ZohoLineItem[];
  notes?: string;
  terms?: string;
  shipping_charge?: number;
  adjustment?: number;
  adjustment_description?: string;
  reason?: string;
}

interface ZohoInvoiceResponse {
  code: number;
  message: string;
  invoice?: {
    invoice_id: string;
    invoice_number: string;
    customer_id?: string;
    customer_name?: string;
    status: string;
    total: number;
    balance: number;
    created_time: string;
    date?: string;
    due_date?: string;
    currency_code?: string;
    invoice_url: string;
    line_items?: ZohoLineItem[];
  };
}

export interface CreateCustomerParams {
  contactName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  billingAddress?: {
    attention?: string;
    address?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  shippingAddress?: {
    attention?: string;
    address?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  notes?: string;
  paymentTerms?: number;
  currencyCode?: string;
  taxId?: string;
}

export interface ZohoCustomerResponse {
  customer_id: string;
  contact_name: string;
  email: string;
  phone?: string;
  mobile?: string;
  currency_code?: string;
  created_time?: string;
  last_modified_time?: string;
}

export interface CreateInvoiceParams {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  lineItems: Array<{
    name: string;
    description: string;
    rate: number;
    quantity: number;
  }>;
  notes?: string;
  terms?: string;
  referenceNumber?: string;
}

export interface RecordPaymentParams {
  invoiceId: string;
  amount: number;
  paymentDate?: string;
  paymentMode?: string;
  description?: string;
  referenceNumber?: string;
  currencyCode?: string;
  exchangeRate?: number;
}

export interface ZohoPaymentResponse {
  code: number;
  message: string;
  payment: {
    payment_id: string;
    payment_number: string;
    invoice_id: string;
    customer_id: string;
    amount: number;
    date: string;
    payment_mode: string;
    reference_number?: string;
  };
}

export class ZohoBooksClient {
  private organizationId: string;
  private accessToken: string;
  private useStoredToken: boolean;

  constructor(accessToken: string, organizationId: string, useStoredToken = false) {
    this.accessToken = accessToken;
    this.organizationId = organizationId;
    this.useStoredToken = useStoredToken;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const requestBody: Record<string, unknown> = {
      endpoint,
      method,
      body,
      useStoredToken: this.useStoredToken,
    };

    if (this.accessToken) {
      requestBody.accessToken = this.accessToken;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/zoho-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok || (data.code && data.code !== 0)) {
      throw new Error(
        `Zoho Books API Error: ${data.message || data.error || response.statusText}`
      );
    }

    return data;
  }

  async createCustomer(customer: ZohoCustomer): Promise<{ customer_id: string }> {
    try {
      const response = await this.makeRequest<{
        code: number;
        message: string;
        contact: { contact_id: string };
      }>(
        `/contacts?organization_id=${this.organizationId}`,
        'POST',
        customer
      );

      return { customer_id: response.contact.contact_id };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (/already.*exist|duplicate/i.test(errorMsg)) {
        const existing = await this.findCustomerByEmail(customer.email);
        if (existing) {
          return { customer_id: existing.customer_id };
        }

        const byName = await this.findCustomerByName(customer.contact_name);
        if (byName) {
          return { customer_id: byName.customer_id };
        }
      }
      throw err;
    }
  }

  async findCustomerByName(name: string): Promise<{ customer_id: string } | null> {
    try {
      const response = await this.makeRequest<{
        code: number;
        message: string;
        contacts: Array<{ contact_id: string; contact_name: string }>;
      }>(
        `/contacts?organization_id=${this.organizationId}&contact_name=${encodeURIComponent(name)}`
      );

      if (response.contacts && response.contacts.length > 0) {
        return { customer_id: response.contacts[0].contact_id };
      }

      return null;
    } catch {
      return null;
    }
  }

  async addCustomer(params: CreateCustomerParams): Promise<ZohoCustomerResponse> {
    const customerData: ZohoCustomer = {
      contact_name: params.contactName,
      contact_type: 'customer',
      email: params.email,
      phone: params.phone,
      mobile: params.mobile,
      website: params.website,
      notes: params.notes,
      payment_terms: params.paymentTerms,
      currency_code: params.currencyCode,
      tax_id: params.taxId,
    };

    if (params.billingAddress) {
      customerData.billing_address = params.billingAddress;
    }

    if (params.shippingAddress) {
      customerData.shipping_address = params.shippingAddress;
    }

    if (params.firstName || params.lastName) {
      customerData.contact_persons = [
        {
          first_name: params.firstName || params.contactName.split(' ')[0] || 'Client',
          last_name: params.lastName || params.contactName.split(' ').slice(1).join(' ') || '',
          email: params.email,
          phone: params.phone,
          mobile: params.mobile,
          is_primary_contact: true,
        },
      ];
    }

    const result = await this.createCustomer(customerData);

    return {
      customer_id: result.customer_id,
      contact_name: params.contactName,
      email: params.email,
      phone: params.phone,
      mobile: params.mobile,
      currency_code: params.currencyCode,
    };
  }

  async updateCustomer(
    customerId: string,
    updates: Partial<CreateCustomerParams>
  ): Promise<ZohoCustomerResponse> {
    const customerData: Partial<ZohoCustomer> = {};

    if (updates.contactName) customerData.contact_name = updates.contactName;
    if (updates.email) customerData.email = updates.email;
    if (updates.phone) customerData.phone = updates.phone;
    if (updates.mobile) customerData.mobile = updates.mobile;
    if (updates.website) customerData.website = updates.website;
    if (updates.notes) customerData.notes = updates.notes;
    if (updates.paymentTerms) customerData.payment_terms = updates.paymentTerms;
    if (updates.currencyCode) customerData.currency_code = updates.currencyCode;
    if (updates.taxId) customerData.tax_id = updates.taxId;
    if (updates.billingAddress) customerData.billing_address = updates.billingAddress;
    if (updates.shippingAddress) customerData.shipping_address = updates.shippingAddress;

    const response = await this.makeRequest<{
      code: number;
      message: string;
      contact: {
        contact_id: string;
        contact_name: string;
        email: string;
        phone?: string;
        mobile?: string;
        currency_code?: string;
      };
    }>(
      `/contacts/${customerId}?organization_id=${this.organizationId}`,
      'PUT',
      customerData
    );

    return {
      customer_id: response.contact.contact_id,
      contact_name: response.contact.contact_name,
      email: response.contact.email,
      phone: response.contact.phone,
      mobile: response.contact.mobile,
      currency_code: response.contact.currency_code,
    };
  }

  async getCustomer(customerId: string): Promise<ZohoCustomerResponse> {
    const response = await this.makeRequest<{
      code: number;
      message: string;
      contact: {
        contact_id: string;
        contact_name: string;
        email: string;
        phone?: string;
        mobile?: string;
        currency_code?: string;
        created_time?: string;
        last_modified_time?: string;
      };
    }>(
      `/contacts/${customerId}?organization_id=${this.organizationId}`
    );

    return {
      customer_id: response.contact.contact_id,
      contact_name: response.contact.contact_name,
      email: response.contact.email,
      phone: response.contact.phone,
      mobile: response.contact.mobile,
      currency_code: response.contact.currency_code,
      created_time: response.contact.created_time,
      last_modified_time: response.contact.last_modified_time,
    };
  }

  async listCustomers(page = 1, perPage = 200): Promise<ZohoCustomerResponse[]> {
    const response = await this.makeRequest<{
      code: number;
      message: string;
      contacts: Array<{
        contact_id: string;
        contact_name: string;
        email: string;
        phone?: string;
        mobile?: string;
        currency_code?: string;
        created_time?: string;
        last_modified_time?: string;
      }>;
    }>(
      `/contacts?organization_id=${this.organizationId}&page=${page}&per_page=${perPage}`
    );

    return response.contacts.map((contact) => ({
      customer_id: contact.contact_id,
      contact_name: contact.contact_name,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      currency_code: contact.currency_code,
      created_time: contact.created_time,
      last_modified_time: contact.last_modified_time,
    }));
  }

  async findCustomerByEmail(email: string): Promise<{ customer_id: string } | null> {
    try {
      const response = await this.makeRequest<{
        code: number;
        message: string;
        contacts: Array<{ contact_id: string; email: string }>;
      }>(
        `/contacts?organization_id=${this.organizationId}&email=${encodeURIComponent(email)}`
      );

      if (response.contacts && response.contacts.length > 0) {
        return { customer_id: response.contacts[0].contact_id };
      }

      return null;
    } catch (error) {
      console.error('Error finding customer:', error);
      return null;
    }
  }

  async createInvoice(invoiceData: CreateInvoiceParams): Promise<ZohoInvoiceResponse> {
    let customerId: string | undefined;

    const existingCustomer = await this.findCustomerByEmail(invoiceData.customerEmail);
    if (existingCustomer) {
      customerId = existingCustomer.customer_id;
    } else {
      const nameParts = invoiceData.customerName.split(' ');
      const firstName = nameParts[0] || 'Client';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      const newCustomer = await this.createCustomer({
        contact_name: invoiceData.customerName,
        contact_type: 'customer',
        email: invoiceData.customerEmail,
        contact_persons: [
          {
            first_name: firstName,
            last_name: lastName,
            email: invoiceData.customerEmail,
            is_primary_contact: true,
          },
        ],
      });
      customerId = newCustomer.customer_id;
    }

    const invoice: ZohoInvoice = {
      customer_id: customerId,
      date: invoiceData.invoiceDate,
      due_date: invoiceData.dueDate,
      currency_code: invoiceData.currencyCode,
      line_items: invoiceData.lineItems.map((item) => ({
        name: item.name,
        description: item.description,
        rate: item.rate,
        quantity: item.quantity,
      })),
      notes: invoiceData.notes,
      terms: invoiceData.terms,
      reference_number: invoiceData.referenceNumber,
    };

    return await this.makeRequest<ZohoInvoiceResponse>(
      `/invoices?organization_id=${this.organizationId}`,
      'POST',
      invoice
    );
  }

  async getInvoice(invoiceId: string): Promise<ZohoInvoiceResponse> {
    return await this.makeRequest<ZohoInvoiceResponse>(
      `/invoices/${invoiceId}?organization_id=${this.organizationId}`
    );
  }

  /** Update an existing invoice (unpaid preferred; paid may accept notes/reason only). */
  async updateInvoice(
    invoiceId: string,
    updates: {
      line_items?: Array<{ name: string; description: string; rate: number; quantity: number }>;
      notes?: string;
      terms?: string;
      currency_code?: string;
      reference_number?: string;
      reason?: string;
    },
  ): Promise<ZohoInvoiceResponse> {
    return await this.makeRequest<ZohoInvoiceResponse>(
      `/invoices/${invoiceId}?organization_id=${this.organizationId}`,
      'PUT',
      updates,
    );
  }

  /** Void an unpaid invoice in Zoho Books. */
  async voidInvoice(invoiceId: string, reason?: string): Promise<{ code: number; message: string }> {
    return await this.makeRequest<{ code: number; message: string }>(
      `/invoices/${invoiceId}/status/void?organization_id=${this.organizationId}`,
      'POST',
      reason ? { reason } : undefined,
    );
  }

  /** Create a customer credit note for a cancellation refund. */
  async createCreditNote(params: {
    customerId: string;
    amount: number;
    currencyCode?: string;
    referenceNumber?: string;
    date?: string;
    notes?: string;
    lineName?: string;
    lineDescription?: string;
  }): Promise<{
    code: number;
    message: string;
    creditnote?: {
      creditnote_id: string;
      creditnote_number: string;
      customer_id?: string;
      total?: number;
      status?: string;
    };
  }> {
    const today = params.date || new Date().toISOString().split('T')[0];
    const rate = Math.round(params.amount * 100) / 100;
    return await this.makeRequest(
      `/creditnotes?organization_id=${this.organizationId}`,
      'POST',
      {
        customer_id: params.customerId,
        date: today,
        currency_code: params.currencyCode,
        reference_number: params.referenceNumber,
        notes: params.notes,
        line_items: [
          {
            name: params.lineName || 'Session cancellation credit',
            description: params.lineDescription || params.notes || 'Credit for cancelled session',
            rate,
            quantity: 1,
          },
        ],
      },
    );
  }

  /** Apply a credit note to one or more invoices. Paid invoices may reject this. */
  async applyCreditNoteToInvoice(
    creditNoteId: string,
    invoiceId: string,
    amountApplied: number,
  ): Promise<{ code: number; message: string }> {
    return await this.makeRequest<{ code: number; message: string }>(
      `/creditnotes/${creditNoteId}/invoices?organization_id=${this.organizationId}`,
      'POST',
      {
        invoices: [
          {
            invoice_id: invoiceId,
            amount_applied: Math.round(amountApplied * 100) / 100,
          },
        ],
      },
    );
  }

  async sendInvoice(
    invoiceId: string,
    toEmails: string[],
    options?: {
      ccEmails?: string[];
      subject?: string;
      body?: string;
    }
  ): Promise<{ code: number; message: string }> {
    const payload: Record<string, unknown> = {
      to_mail_ids: toEmails,
      send_customer_statement: false,
    };

    if (options?.ccEmails && options.ccEmails.length > 0) {
      payload.cc_mail_ids = options.ccEmails;
    }
    if (options?.subject) {
      payload.subject = options.subject;
    }
    if (options?.body) {
      payload.body = options.body;
    }

    return await this.makeRequest<{ code: number; message: string }>(
      `/invoices/${invoiceId}/email?organization_id=${this.organizationId}`,
      'POST',
      payload
    );
  }

  async recordPayment(params: RecordPaymentParams): Promise<ZohoPaymentResponse> {
    const invoice = await this.getInvoice(params.invoiceId);

    if (!invoice.invoice || !invoice.invoice.customer_id) {
      throw new Error('Invoice not found or missing customer ID');
    }

    const invoiceCurrency = invoice.invoice.currency_code;
    const paymentCurrency = params.currencyCode;
    const isDifferentCurrency = paymentCurrency && paymentCurrency !== invoiceCurrency;

    const paymentData: {
      customer_id: string;
      payment_mode: string;
      amount: number;
      date: string;
      reference_number: string;
      description: string;
      invoices: Array<{ invoice_id: string; amount_applied: number }>;
      currency_code?: string;
      exchange_rate?: number;
    } = {
      customer_id: invoice.invoice.customer_id,
      payment_mode: params.paymentMode || 'cash',
      amount: params.amount,
      date: params.paymentDate || new Date().toISOString().split('T')[0],
      reference_number: params.referenceNumber || '',
      description: params.description || 'Payment received',
      invoices: [
        {
          invoice_id: params.invoiceId,
          amount_applied: params.amount,
        },
      ],
    };

    if (isDifferentCurrency) {
      paymentData.currency_code = paymentCurrency;

      if (params.exchangeRate) {
        paymentData.exchange_rate = params.exchangeRate;
      } else {
        console.warn(`Cross-currency payment detected (${paymentCurrency} -> ${invoiceCurrency}) but no exchange rate provided. Zoho Books will use its default rate.`);
      }
    }

    return await this.makeRequest<ZohoPaymentResponse>(
      `/customerpayments?organization_id=${this.organizationId}`,
      'POST',
      paymentData
    );
  }

  async getInvoicesByEmail(email: string): Promise<ZohoInvoiceResponse[]> {
    try {
      const customer = await this.findCustomerByEmail(email);
      if (!customer) {
        return [];
      }

      const response = await this.makeRequest<{
        code: number;
        message: string;
        invoices: Array<{
          invoice_id: string;
          invoice_number: string;
          customer_id: string;
          customer_name: string;
          total: number;
          balance: number;
          status: string;
          date: string;
          due_date: string;
          currency_code: string;
        }>;
      }>(
        `/invoices?organization_id=${this.organizationId}&customer_id=${customer.customer_id}`
      );

      return response.invoices.map((inv) => ({
        code: 0,
        message: 'Success',
        invoice: {
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_id: inv.customer_id,
          customer_name: inv.customer_name,
          total: inv.total,
          balance: inv.balance,
          status: inv.status,
          date: inv.date,
          due_date: inv.due_date,
          currency_code: inv.currency_code,
          created_time: inv.date,
          invoice_url: '',
          line_items: [],
        },
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }
  }

  async getInvoicesByEmailAndDateRange(
    email: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<ZohoInvoiceResponse[]> {
    try {
      const customer = await this.findCustomerByEmail(email);
      if (!customer) {
        return [];
      }

      let endpoint = `/invoices?organization_id=${this.organizationId}&customer_id=${customer.customer_id}&status=unpaid`;
      if (dateFrom) endpoint += `&date_start=${dateFrom}`;
      if (dateTo) endpoint += `&date_end=${dateTo}`;

      const response = await this.makeRequest<{
        code: number;
        message: string;
        invoices: Array<{
          invoice_id: string;
          invoice_number: string;
          customer_id: string;
          customer_name: string;
          total: number;
          balance: number;
          status: string;
          date: string;
          due_date: string;
          currency_code: string;
        }>;
      }>(endpoint);

      return (response.invoices || []).map((inv) => ({
        code: 0,
        message: 'Success',
        invoice: {
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_id: inv.customer_id,
          customer_name: inv.customer_name,
          total: inv.total,
          balance: inv.balance,
          status: inv.status,
          date: inv.date,
          due_date: inv.due_date,
          currency_code: inv.currency_code,
          created_time: inv.date,
          invoice_url: '',
          line_items: [],
        },
      }));
    } catch (error) {
      console.error('Error fetching invoices by date range:', error);
      return [];
    }
  }

  async recordPaymentForMultipleInvoices(params: {
    invoices: Array<{ invoiceId: string; amount: number }>;
    paymentDate?: string;
    paymentMode?: string;
    description?: string;
    referenceNumber?: string;
    currencyCode?: string;
    exchangeRate?: number;
  }): Promise<ZohoPaymentResponse[]> {
    const results: ZohoPaymentResponse[] = [];
    for (const inv of params.invoices) {
      const result = await this.recordPayment({
        invoiceId: inv.invoiceId,
        amount: inv.amount,
        paymentDate: params.paymentDate,
        paymentMode: params.paymentMode,
        description: params.description,
        referenceNumber: params.referenceNumber,
        currencyCode: params.currencyCode,
        exchangeRate: params.exchangeRate,
      });
      results.push(result);
    }
    return results;
  }

  async findUnpaidInvoiceForCustomer(
    customerEmail: string,
    amount: number,
    currencyCode: string,
    allowCrossCurrency: boolean = false
  ): Promise<string | null> {
    try {
      const invoices = await this.getInvoicesByEmail(customerEmail);

      const matchingInvoice = invoices.find((inv) => {
        if (!inv.invoice) return false;

        const balance = inv.invoice.balance;
        const total = inv.invoice.total;
        const isUnpaid = balance > 0;
        const matchesAmount = Math.abs(total - amount) < 0.01;
        const matchesCurrency = inv.invoice.currency_code === currencyCode;

        if (allowCrossCurrency) {
          return isUnpaid && matchesAmount;
        }

        return isUnpaid && matchesAmount && matchesCurrency;
      });

      if (!matchingInvoice && allowCrossCurrency) {
        console.log('No exact currency match found, searching for cross-currency invoices...');
        const crossCurrencyInvoice = invoices.find((inv) => {
          if (!inv.invoice) return false;
          const balance = inv.invoice.balance;
          return balance > 0;
        });

        if (crossCurrencyInvoice) {
          console.log(
            `Found unpaid invoice in ${crossCurrencyInvoice.invoice?.currency_code}, ` +
            `payment is in ${currencyCode}. Make sure to provide exchange rate.`
          );
        }

        return crossCurrencyInvoice?.invoice?.invoice_id || null;
      }

      return matchingInvoice?.invoice?.invoice_id || null;
    } catch (error) {
      console.error('Error finding unpaid invoice:', error);
      return null;
    }
  }
}

let cachedAccessToken: string | null = null;

export function createZohoBooksClient(): ZohoBooksClient | null {
  const organizationId = import.meta.env.VITE_ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    console.log('createZohoBooksClient: no organization ID configured');
    return null;
  }

  const accessToken = cachedAccessToken || import.meta.env.VITE_ZOHO_ACCESS_TOKEN || '';

  return new ZohoBooksClient(accessToken, organizationId, true);
}

export function hasZohoRefreshToken(): boolean {
  return true;
}

export async function refreshZohoAccessToken(): Promise<string | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const refreshToken = import.meta.env.VITE_ZOHO_REFRESH_TOKEN || '';
    const clientId = import.meta.env.VITE_ZOHO_API_CLIENT_ID || '';
    const clientSecret = import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || '';

    let response;
    if (refreshToken && clientId && clientSecret) {
      response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });
    } else {
      response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ grant_type: 'refresh_from_db' }),
      });
    }

    const data = await response.json();
    console.log('refreshZohoAccessToken: response:', data);

    if (data.access_token) {
      cachedAccessToken = data.access_token;
      return data.access_token;
    }

    return null;
  } catch (err) {
    console.log('refreshZohoAccessToken: error:', err);
    return null;
  }
}

export async function checkZohoConnection(): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'check_connection' }),
    });

    const data = await response.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

export function isTokenError(errorMessage: string): boolean {
  return /invalid.*token|unauthorized|token.*expired|oauth|No valid access token/i.test(errorMessage);
}
