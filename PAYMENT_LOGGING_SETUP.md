# Payment Logging and Email Confirmation Setup

This document describes the payment logging integration with Zoho Books and automatic email confirmation system.

## Overview

When payments are recorded through the Payment Form, the system now:
1. Saves the payment transaction to the local database
2. Automatically finds and links to the corresponding Zoho Books invoice
3. Records the payment in Zoho Books
4. Sends a confirmation email to the client
5. Updates the transaction record with email status

## Features

### 1. Automatic Zoho Books Payment Recording

When a payment is marked as "Completed", the system:
- Searches for unpaid invoices matching the customer email, amount, and currency
- Records the payment against the found invoice in Zoho Books
- Links the local payment transaction to the Zoho invoice and payment
- Logs all actions to console for tracking

### 2. Payment Confirmation Emails

Completed payments trigger automatic confirmation emails containing:
- Payment amount (formatted in the appropriate currency)
- Payment method
- Payment date (localized format)
- Transaction reference number
- Invoice number (if available)
- Number of sessions purchased

### 3. Email Tracking

The system tracks email delivery status:
- `email_sent` boolean flag
- `email_sent_at` timestamp
- Stored in the `payment_transactions` table

### 4. Bilingual Support

Emails are sent in the user's selected language (English or Spanish) with:
- Localized date formats
- Currency formatting
- Translated content

### 5. Multi-Currency Payment Support

The system now supports payments in different currencies than the invoice:
- **Automatic Currency Detection:** Compares payment currency with invoice currency
- **Exchange Rate Handling:** Accepts manual exchange rate input for cross-currency payments
- **Flexible Invoice Matching:** Can match invoices with different currencies when exchange rate is provided
- **Zoho Books Integration:** Automatically applies exchange rate when recording payment in Zoho Books
- **Fallback to Default Rate:** If no exchange rate provided, Zoho Books uses its default conversion rate

**How It Works:**
1. Admin enters payment amount in the payment currency (e.g., EUR)
2. If different from invoice currency (e.g., USD), admin provides exchange rate
3. System finds matching invoice (even with different currency when exchange rate is set)
4. Payment is recorded in Zoho Books with currency code and exchange rate
5. Zoho Books handles the currency conversion automatically

## Configuration

### Required Environment Variables

Add these to your `.env` file:

#### Zoho Books (Required for payment logging)
```env
VITE_ZOHO_ACCESS_TOKEN=your_zoho_access_token
VITE_ZOHO_ORGANIZATION_ID=your_zoho_organization_id
VITE_ZOHO_API_BASE_URL=https://books.zoho.com/api/v3
```

#### EmailJS (Required for confirmation emails)
```env
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id
VITE_EMAILJS_PAYMENT_TEMPLATE_ID=your_payment_confirmation_template_id
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
```

### EmailJS Template Setup

1. Create an account at [EmailJS](https://www.emailjs.com/)
2. Create a new email service (Gmail, Outlook, etc.)
3. Create a payment confirmation email template with these parameters:
   - `to_name` - Client name
   - `to_email` - Client email address
   - `payment_amount` - Formatted amount with currency
   - `payment_method` - Payment method used
   - `payment_date` - Formatted payment date
   - `transaction_reference` - Transaction reference number
   - `invoice_number` - Invoice number (if available)
   - `num_sessions` - Number of sessions purchased
   - `language` - Language code ('en' or 'es')

#### Sample Email Template

```html
Hello {{to_name}},

Thank you for your payment! This email confirms we have received your payment.

Payment Details:
- Amount: {{payment_amount}}
- Method: {{payment_method}}
- Date: {{payment_date}}
- Reference: {{transaction_reference}}
{{#if invoice_number}}
- Invoice: {{invoice_number}}
{{/if}}
- Sessions: {{num_sessions}}

If you have any questions, please don't hesitate to contact us.

Best regards,
Your Therapy Team
```

## Database Schema

The `payment_transactions` table includes these Zoho Books and email tracking fields:

```sql
ALTER TABLE payment_transactions ADD COLUMN zoho_invoice_id text;
ALTER TABLE payment_transactions ADD COLUMN zoho_payment_id text;
ALTER TABLE payment_transactions ADD COLUMN email_sent boolean DEFAULT false;
ALTER TABLE payment_transactions ADD COLUMN email_sent_at timestamptz;
```

## How It Works

### Payment Flow

```
1. User fills out Payment Form
   ↓
2. Payment transaction saved to database
   ↓
3. If status = "Completed":
   ├─ Find matching unpaid invoice in Zoho Books
   ├─ Record payment in Zoho Books
   ├─ Send confirmation email to client
   └─ Update transaction with Zoho IDs and email status
   ↓
4. Success message shown to admin
```

### Invoice Matching Logic

The system finds matching invoices by:
1. Customer email address
2. Invoice amount (must match within $0.01)
3. Currency code (must match exactly for same-currency payments)
4. Invoice status (must have unpaid balance)

If multiple invoices match, the first one is used.

**Multi-Currency Invoice Matching:**
When an exchange rate is provided:
- Currency matching becomes optional
- System prioritizes exact currency matches first
- If no exact match found, searches for any unpaid invoice for the customer
- Logs warning when different currencies are detected
- Applies exchange rate when recording payment in Zoho Books

**Example Scenarios:**

1. **Same Currency Payment:**
   - Invoice: $100 USD
   - Payment: $100 USD
   - Exchange Rate: Not needed
   - Result: Direct match and payment

2. **Different Currency Payment:**
   - Invoice: $100 USD
   - Payment: €85 EUR
   - Exchange Rate: 1.18 (EUR to USD)
   - Result: System finds USD invoice, records EUR payment with exchange rate

3. **No Exchange Rate Provided:**
   - Invoice: $100 USD
   - Payment: €85 EUR
   - Exchange Rate: Not provided
   - Result: Only matches invoices in EUR, or uses Zoho's default rate

### Payment Mode Mapping

Payment methods are automatically converted to Zoho Books payment modes:

| Form Payment Method | Zoho Payment Mode |
|---------------------|------------------|
| Credit Card         | credit_card      |
| Debit Card          | debit_card       |
| Cash               | cash             |
| Bank Transfer       | bank_transfer    |
| PayPal             | paypal           |
| Venmo              | venmo            |
| Zelle              | zelle            |
| Check              | check            |

## API Methods

### Zoho Books Client

New payment-related methods in `ZohoBooksClient`:

#### `recordPayment(params)`
Records a payment against an invoice in Zoho Books with optional multi-currency support.

**Same Currency Example:**
```typescript
const response = await zohoClient.recordPayment({
  invoiceId: 'invoice_id_123',
  amount: 150.00,
  paymentDate: '2024-01-31',
  paymentMode: 'credit_card',
  description: 'Payment via Credit Card',
  referenceNumber: 'TXN-12345',
});
```

**Multi-Currency Example:**
```typescript
const response = await zohoClient.recordPayment({
  invoiceId: 'invoice_id_123',
  amount: 127.50,
  paymentDate: '2024-01-31',
  paymentMode: 'credit_card',
  description: 'Payment via Credit Card',
  referenceNumber: 'TXN-12345',
  currencyCode: 'EUR',
  exchangeRate: 1.18,
});
```

**Parameters:**
- `invoiceId` (required): Zoho Books invoice ID
- `amount` (required): Payment amount
- `paymentDate` (optional): Date of payment
- `paymentMode` (optional): Payment method
- `description` (optional): Payment description
- `referenceNumber` (optional): Transaction reference
- `currencyCode` (optional): Payment currency (if different from invoice)
- `exchangeRate` (optional): Exchange rate for currency conversion

#### `getInvoicesByEmail(email)`
Retrieves all invoices for a customer by email.

```typescript
const invoices = await zohoClient.getInvoicesByEmail('client@example.com');
```

#### `findUnpaidInvoiceForCustomer(email, amount, currency, allowCrossCurrency)`
Finds an unpaid invoice matching the payment details with optional cross-currency matching.

**Same Currency Example:**
```typescript
const invoiceId = await zohoClient.findUnpaidInvoiceForCustomer(
  'client@example.com',
  150.00,
  'USD',
  false
);
```

**Cross-Currency Example:**
```typescript
const invoiceId = await zohoClient.findUnpaidInvoiceForCustomer(
  'client@example.com',
  127.50,
  'EUR',
  true
);
```

**Parameters:**
- `email` (required): Customer email address
- `amount` (required): Payment amount
- `currency` (required): Payment currency code
- `allowCrossCurrency` (optional, default: false): Allow matching invoices in different currencies

### Email Service

Payment confirmation methods in `emailService`:

#### `sendPaymentConfirmationEmail(params, language)`
Sends a payment confirmation email.

```typescript
const result = await sendPaymentConfirmationEmail({
  clientName: 'John Doe',
  clientEmail: 'john@example.com',
  paymentAmount: 150.00,
  paymentCurrency: 'USD',
  paymentMethod: 'Credit Card',
  paymentDate: '2024-01-31',
  transactionReference: 'TXN-12345',
  numSessions: 1,
}, 'en');
```

#### `isEmailConfigured()`
Checks if EmailJS is properly configured.

```typescript
if (isEmailConfigured()) {
  // Send emails
}
```

## User Experience

### For Admins (Payment Form)

When submitting a completed payment:
1. Fill out payment form with client details
2. Select payment method and amount
3. Set status to "Completed"
4. Click Submit
5. Success message shows:
   - Payment recorded
   - Zoho Books status (if configured)
   - Email status (sent or warning)

### For Clients

Clients with completed payments receive:
1. Immediate email confirmation
2. Payment details in their language
3. Professional receipt for their records

## Error Handling

The system handles errors gracefully:

### Zoho Books Errors
- If Zoho Books is not configured, payment is still saved locally
- If no matching invoice found, payment is saved but not linked
- If API call fails, error is logged but email still sends
- Console shows detailed error messages for debugging

### Email Errors
- If EmailJS is not configured, warning is shown
- If email send fails, payment is still recorded
- Email failure doesn't prevent payment from being saved
- Admin sees warning in success message

### Partial Failures

The system handles partial failures:
```
✅ Payment saved to database
❌ Zoho Books not configured
✅ Email sent successfully

Result: Payment recorded, confirmation email sent
```

## Console Logging

The system logs all actions for debugging:

```javascript
// When payment is submitted
"Looking for unpaid invoice for customer: client@example.com"

// If invoice found
"Found invoice: 12345678"
"Payment recorded in Zoho Books: payment_id_789"

// Email status
"Sending payment confirmation email..."
"Confirmation email sent successfully"
```

## Testing

### Test Without Zoho Books
1. Remove `VITE_ZOHO_ACCESS_TOKEN` from `.env`
2. Submit a completed payment
3. Verify: Payment saved, email sent, warning about Zoho

### Test Without Email
1. Remove EmailJS credentials from `.env`
2. Submit a completed payment
3. Verify: Payment saved, Zoho updated, warning about email

### Test Complete Flow
1. Ensure all env variables are set
2. Create an invoice in Zoho Books for a test client
3. Submit a completed payment matching the invoice
4. Verify:
   - Payment recorded in database
   - Payment recorded in Zoho Books
   - Email sent to client
   - All IDs linked in database

### Test Multi-Currency Payment
1. Create an invoice in Zoho Books in USD (e.g., $100)
2. Submit a payment in EUR (e.g., €85)
3. Provide exchange rate (e.g., 1.18)
4. Verify:
   - System finds USD invoice
   - Payment recorded with EUR amount and exchange rate
   - Zoho Books shows payment in EUR converted to USD
   - Email shows payment in EUR
5. Check Zoho Books to verify:
   - Payment appears in customer's account
   - Exchange rate is applied correctly
   - Invoice balance is reduced appropriately

## Troubleshooting

### Payment Not Recorded in Zoho Books

**Check:**
1. Are Zoho Books credentials configured?
2. Does an unpaid invoice exist for this client?
3. Do the amount and currency match exactly?
4. Check console for detailed error messages

### Email Not Sent

**Check:**
1. Are EmailJS credentials configured?
2. Is the email template created and ID correct?
3. Is the client email address valid?
4. Check console for email service errors

### Invoice Not Found

**Possible causes:**
- No invoice exists for this customer
- Invoice is already fully paid
- Amount doesn't match (check cents/decimals)
- Currency code doesn't match
- Customer email doesn't match invoice

**Solution:** Create invoice first or verify invoice details

### Payment Mode Not Recognized

**Issue:** Zoho Books may reject unknown payment modes

**Solution:** Use standard payment methods from the dropdown

### Multi-Currency Issues

**Issue:** Cross-currency payment not recorded correctly

**Check:**
1. Is exchange rate provided when currencies differ?
2. Is the exchange rate in the correct direction?
3. Check Zoho Books multi-currency settings enabled
4. Verify customer has correct currency preference in Zoho Books

**Common Exchange Rate Mistakes:**
- Using inverted rate (e.g., 0.85 instead of 1.18)
- Using outdated exchange rates
- Not accounting for transaction fees

**Best Practices:**
- Always use current market exchange rates
- Document the source of exchange rate (e.g., "XE.com rate as of [date]")
- Consider adding exchange rate to payment notes
- Verify conversion in Zoho Books after recording

**Solution:**
1. Use reliable exchange rate sources (XE.com, OANDA, etc.)
2. Double-check rate direction (payment currency to invoice currency)
3. Enable multi-currency in Zoho Books organization settings
4. Test with small amounts first

## Production Considerations

1. **Email Rate Limits:** EmailJS free tier has sending limits
2. **Error Monitoring:** Add server-side logging for production
3. **Email Templates:** Create professional branded templates
4. **Testing:** Test email delivery to spam folders
5. **Fallback:** Consider backup email service (SendGrid, AWS SES)
6. **Notifications:** Consider admin notifications for failed emails
7. **Retry Logic:** Consider retry mechanism for failed API calls

## Security Notes

- Never expose Zoho access tokens in client-side code
- EmailJS public key is safe to expose (it's designed for client-side)
- Consider moving to server-side payment processing for production
- Validate all payment amounts server-side
- Log all payment transactions for audit trail

## Best Practices

1. **Always verify invoice details** before recording payment
2. **Check email configuration** before going live
3. **Test with small amounts** first
4. **Monitor console logs** for issues
5. **Keep EmailJS templates updated** with current branding
6. **Review failed emails** regularly
7. **Maintain audit trail** of all payment transactions

## Future Enhancements

Potential improvements:
- Batch payment processing
- Automatic payment reminders
- SMS notifications
- Payment receipts as PDF attachments
- Webhook integration for real-time updates
- Multi-currency support with conversion
- Partial payment handling
- Payment plan support
