# Zoho Books Invoice Integration

This document explains how to set up and use the Zoho Books invoice integration in the application.

## Overview

The Zoho Books integration allows you to automatically create invoices for therapy sessions directly from the Book Sessions panel. When you select a client request and click "Create Invoice", the system will:

1. Check if the customer exists in Zoho Books (by email)
2. Create a new customer if they don't exist
3. Create an invoice with session details
4. Display the invoice number and total

## Features

- **Automatic Customer Creation:** If a customer doesn't exist in Zoho Books, one is created automatically
- **Invoice Generation:** Creates professional invoices with line items and terms
- **Payment Recording:** Automatically logs completed payments to Zoho Books invoices
- **Email Confirmation:** Sends payment confirmation emails to clients
- **Reference Numbers:** Links invoices to client request IDs for tracking
- **Multi-Currency Support:** Handles different currencies (USD, EUR, etc.)
- **Email Integration:** Can send invoices directly to clients via email

## Setup Instructions

### 1. Get Zoho Books Credentials

You need two pieces of information from your Zoho Books account:

#### Access Token

1. Log in to [Zoho API Console](https://api-console.zoho.com/)
2. Create a new "Self Client" application
3. Generate an access token with the following scopes:
   - `ZohoBooks.contacts.CREATE`
   - `ZohoBooks.contacts.READ`
   - `ZohoBooks.invoices.CREATE`
   - `ZohoBooks.invoices.READ`
   - `ZohoBooks.invoices.UPDATE`
4. Copy the access token

**Note:** Access tokens expire. For production use, you should implement OAuth 2.0 refresh token flow. For testing, you can generate a new access token as needed.

#### Organization ID

1. Log in to [Zoho Books](https://books.zoho.com/)
2. Go to Settings → Organization Profile
3. Your Organization ID is displayed in the URL or profile page
4. Copy the Organization ID

### 2. Configure Environment Variables

Add the following variables to your `.env` file:

```env
# Zoho Books Configuration
VITE_ZOHO_ACCESS_TOKEN=your_access_token_here
VITE_ZOHO_ORGANIZATION_ID=your_organization_id_here
VITE_ZOHO_API_BASE_URL=https://books.zoho.com/api/v3
```

**Important:**
- If you're using Zoho Books India, use `https://books.zoho.in/api/v3`
- If you're using Zoho Books EU, use `https://books.zoho.eu/api/v3`
- For other regions, check [Zoho Books API Documentation](https://www.zoho.com/books/api/v3/)

### 3. Restart the Development Server

After adding the environment variables, restart your development server:

```bash
npm run dev
```

## Usage

### Creating an Invoice from Book Sessions Panel

1. Navigate to the "Book Sessions" section
2. Select a client request from the pending requests list
3. The booking panel will appear on the right
4. Click the "Create Invoice" button (orange button)
5. The system will:
   - Create or find the customer in Zoho Books
   - Generate an invoice with session details
   - Display a success message with the invoice number and total

### Invoice Details

The invoice automatically includes:

- **Customer Information:** Client name, email, and phone (if available)
- **Line Item:** Therapy session with:
  - Psychologist name
  - Session date
  - Session duration
  - Number of sessions included
  - Price and currency
- **Reference Number:** Request ID for tracking
- **Payment Terms:** 30 days by default
- **Notes:** Professional thank you message
- **Due Date:** 30 days from invoice date

## API Client Module

The Zoho Books integration is implemented in `/src/lib/zohoBooksClient.ts`. This module provides:

### ZohoBooksClient Class

```typescript
const client = new ZohoBooksClient(accessToken, organizationId, baseUrl);
```

### Methods

**Customer Management:**
- `createCustomer(customer)`: Low-level method to create a customer
- `addCustomer(params)`: High-level method to add a customer with validation
- `updateCustomer(customerId, updates)`: Update customer information
- `getCustomer(customerId)`: Get customer details by ID
- `listCustomers(page, perPage)`: List all customers with pagination
- `findCustomerByEmail(email)`: Find an existing customer by email

**Invoice Management:**
- `createInvoice(invoiceData)`: Create a new invoice (automatically handles customer creation)
- `getInvoice(invoiceId)`: Retrieve invoice details
- `sendInvoice(invoiceId, emails)`: Email the invoice to specified addresses

### Factory Function

```typescript
import { createZohoBooksClient } from '../lib/zohoBooksClient';

const client = createZohoBooksClient(); // Uses env variables
if (client) {
  // Use the client
}
```

### Customer Sync Module

The customer sync utilities are in `/src/lib/zohoCustomerSync.ts`:

**Functions:**
- `syncCustomerToZoho(email, fullName, phone, additionalParams)`: Sync a single customer
- `syncClientRequestToZoho(clientRequestId)`: Sync a customer from a client request
- `bulkSyncClientsToZoho(limit, onlyPending)`: Bulk sync client requests
- `syncAllUsersToZoho(limit)`: Bulk sync all users from database
- `getZohoCustomerList()`: Get list of all customers in Zoho Books

## Data Flow

1. **User Action:** Admin clicks "Create Invoice" in Book Sessions panel
2. **Data Collection:** System gathers client request data:
   - Client name, email, phone
   - Psychologist information
   - Session date and duration
   - Pricing details
3. **Customer Sync:**
   - Automatically sync customer to Zoho Books
   - Check if customer exists by email
   - Create new customer if needed
   - Log sync result (created/exists/failed)
4. **Invoice Creation:**
   - Build invoice with line items
   - Link to synced customer ID
   - Include reference number (Request ID)
   - Set payment terms and due date
5. **Response:** Display success message with invoice number and total, or error

## JSON Structure

### Invoice Request Payload Example

```json
{
  "customer_id": "123456789",
  "date": "2024-01-31",
  "due_date": "2024-03-02",
  "currency_code": "USD",
  "line_items": [
    {
      "name": "Therapy Session",
      "description": "Therapy session with Dr. Smith - 1/31/2024 (1 hour)\n1 session(s) included",
      "rate": 150.00,
      "quantity": 1
    }
  ],
  "notes": "Thank you for trusting our mental health services.",
  "terms": "Payment is due within 30 days.",
  "reference_number": "REQ-42"
}
```

### Customer Creation Payload Example

```json
{
  "contact_name": "John Doe",
  "contact_type": "customer",
  "email": "john.doe@example.com",
  "contact_persons": [
    {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "is_primary_contact": true
    }
  ]
}
```

## Customer Management

The Zoho Books integration includes comprehensive customer management features:

### Automatic Customer Sync

When creating an invoice, the system automatically:
1. Checks if the customer exists in Zoho Books (by email)
2. Creates the customer if they don't exist
3. Uses the existing customer if found

This happens transparently when you click "Create Invoice" in the Book Sessions panel.

### Manual Customer Management

You can also manage customers programmatically using the API:

#### Add a Single Customer

```typescript
import { createZohoBooksClient } from '../lib/zohoBooksClient';

const client = createZohoBooksClient();
if (client) {
  const customer = await client.addCustomer({
    contactName: 'John Doe',
    email: 'john.doe@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    mobile: '+1234567890',
    currencyCode: 'USD',
    billingAddress: {
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA',
    },
  });
  console.log('Customer created:', customer.customer_id);
}
```

#### Find Customer by Email

```typescript
const customer = await client.findCustomerByEmail('john.doe@example.com');
if (customer) {
  console.log('Found customer:', customer.customer_id);
}
```

#### Update Customer Information

```typescript
const updated = await client.updateCustomer('customer_id_here', {
  phone: '+9876543210',
  billingAddress: {
    address: '456 Oak Ave',
    city: 'Boston',
    state: 'MA',
    zip: '02101',
    country: 'USA',
  },
});
```

#### Get Customer Details

```typescript
const customer = await client.getCustomer('customer_id_here');
console.log(customer);
```

#### List All Customers

```typescript
const customers = await client.listCustomers(1, 200); // page 1, 200 per page
console.log(`Found ${customers.length} customers`);
```

### Bulk Customer Sync

The system includes utilities to sync customers from your Supabase database to Zoho Books:

#### Sync Single Client Request

```typescript
import { syncClientRequestToZoho } from '../lib/zohoCustomerSync';

const result = await syncClientRequestToZoho('request_id_here');
if (result.success) {
  console.log(`Customer ${result.action}:`, result.customerId);
}
```

#### Sync All Pending Client Requests

```typescript
import { bulkSyncClientsToZoho } from '../lib/zohoCustomerSync';

const result = await bulkSyncClientsToZoho(100, true); // limit 100, pending only
console.log(`Synced ${result.succeeded} of ${result.total} customers`);
console.log('Results:', result.results);
```

#### Sync All Users

```typescript
import { syncAllUsersToZoho } from '../lib/zohoCustomerSync';

const result = await syncAllUsersToZoho(100); // limit 100
console.log(`Synced ${result.succeeded} of ${result.total} users`);
```

### Customer Data Fields

When creating or updating customers, you can include:

**Basic Information:**
- Contact name (required)
- Email (required)
- First name
- Last name
- Phone
- Mobile
- Website
- Notes

**Billing Address:**
- Attention
- Address line 1
- Address line 2
- City
- State
- ZIP code
- Country
- Phone

**Shipping Address:**
- Same fields as billing address

**Business Information:**
- Payment terms (days)
- Currency code
- Tax ID
- GST number

## Error Handling

The integration includes comprehensive error handling:

- **Missing Credentials:** Clear error message if env variables are not set
- **API Errors:** Zoho Books API errors are caught and displayed to the user
- **Missing Data:** Validates that price information exists before creating invoice
- **Network Errors:** Handles connection issues gracefully

## Troubleshooting

### "Zoho Books is not configured" Error

**Solution:** Check that `VITE_ZOHO_ACCESS_TOKEN` and `VITE_ZOHO_ORGANIZATION_ID` are set in your `.env` file and restart the dev server.

### "Access Token Invalid" Error

**Solution:** Your access token may have expired. Generate a new one from the Zoho API Console.

### "Customer Creation Failed" Error

**Solution:** Check that your access token has the `ZohoBooks.contacts.CREATE` scope.

### Invoice Not Creating

**Solution:**
1. Check browser console for detailed error messages
2. Verify the organization ID is correct
3. Ensure the API base URL matches your Zoho Books region
4. Confirm the access token has invoice creation permissions

## Production Considerations

For production deployment:

1. **OAuth 2.0 Flow:** Implement refresh token mechanism instead of using static access tokens
2. **Error Logging:** Add server-side error logging and monitoring
3. **Webhook Integration:** Set up Zoho Books webhooks for invoice payment notifications
4. **Rate Limiting:** Implement rate limiting to avoid API quota issues
5. **Security:** Store access tokens securely (use server-side proxy instead of client-side)
6. **Testing:** Add comprehensive tests for invoice creation and error scenarios

## Payment Logging

The system now includes automatic payment recording to Zoho Books when payments are submitted through the Payment Form.

### How It Works

1. **Payment Submitted:** Admin records a payment via the Payment Form
2. **Status Check:** If payment status is "Completed":
   - System searches for matching unpaid invoice in Zoho Books
   - Records payment against the found invoice
   - Links local payment record to Zoho Books invoice and payment IDs
   - Sends confirmation email to client
3. **Database Update:** Updates payment transaction with Zoho Books IDs and email status

### Invoice Matching

The system automatically finds the correct invoice by matching:
- Customer email address
- Payment amount (within $0.01)
- Currency code
- Unpaid balance

### Payment Confirmation Emails

When a payment is completed:
- Client receives automatic email confirmation
- Email includes payment details, amount, method, and reference number
- Email is sent in client's preferred language (English/Spanish)
- Email delivery is tracked in the database

### Configuration

See [`PAYMENT_LOGGING_SETUP.md`](PAYMENT_LOGGING_SETUP.md) for:
- Detailed setup instructions
- EmailJS configuration
- Payment flow diagrams
- Troubleshooting guide
- API method documentation

### Required Scopes

Ensure your Zoho Books access token includes these additional scopes:
- `ZohoBooks.customerpayments.CREATE`
- `ZohoBooks.customerpayments.READ`

## Additional Resources

- [Zoho Books API Documentation](https://www.zoho.com/books/api/v3/)
- [Zoho API Console](https://api-console.zoho.com/)
- [Zoho OAuth 2.0 Guide](https://www.zoho.com/accounts/protocol/oauth.html)
- [Payment Logging Setup Guide](PAYMENT_LOGGING_SETUP.md)
