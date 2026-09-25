# Zoho Books Customer Management

This document provides a quick reference for managing customers in Zoho Books through the application.

## Overview

The application now includes comprehensive customer management capabilities for Zoho Books:

- **Automatic customer sync** when creating invoices
- **Manual customer creation** with full field support
- **Customer search** by email
- **Customer updates** for existing records
- **Bulk sync** from Supabase database to Zoho Books
- **Customer listing** with pagination

## Key Features

### 1. Automatic Customer Sync (Invoice Creation)

When you create an invoice from the Book Sessions panel:
- The system automatically checks if the customer exists in Zoho Books
- If not found, creates a new customer with contact details
- Uses the existing customer if found
- Logs the result to console (created/exists/failed)

This happens transparently - no manual action needed!

### 2. Enhanced Customer Data

Customers can now be created with comprehensive information:

```typescript
{
  // Basic Info
  contactName: "John Doe",
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  phone: "+1234567890",
  mobile: "+1234567890",
  website: "https://example.com",
  notes: "VIP client",

  // Business Info
  paymentTerms: 30,
  currencyCode: "USD",
  taxId: "12-3456789",

  // Billing Address
  billingAddress: {
    address: "123 Main St",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "USA",
    phone: "+1234567890"
  },

  // Shipping Address (optional)
  shippingAddress: { ... }
}
```

### 3. Customer API Methods

#### Create Customer
```typescript
import { createZohoBooksClient } from './lib/zohoBooksClient';

const client = createZohoBooksClient();
const customer = await client.addCustomer({
  contactName: 'Jane Smith',
  email: 'jane@example.com',
  phone: '+1234567890'
});
```

#### Find Customer by Email
```typescript
const customer = await client.findCustomerByEmail('jane@example.com');
if (customer) {
  console.log('Customer ID:', customer.customer_id);
}
```

#### Update Customer
```typescript
await client.updateCustomer('customer_id', {
  phone: '+9876543210',
  notes: 'Updated contact information'
});
```

#### Get Customer Details
```typescript
const customer = await client.getCustomer('customer_id');
console.log(customer);
```

#### List All Customers
```typescript
const customers = await client.listCustomers(1, 200); // page, per_page
```

### 4. Database Sync Utilities

#### Sync Single Client
```typescript
import { syncCustomerToZoho } from './lib/zohoCustomerSync';

const result = await syncCustomerToZoho(
  'client@example.com',
  'Client Name',
  '+1234567890'
);

console.log(`Customer ${result.action}:`, result.customerId);
```

#### Sync Client Request
```typescript
import { syncClientRequestToZoho } from './lib/zohoCustomerSync';

const result = await syncClientRequestToZoho('request_id');
if (result.success) {
  console.log('Synced:', result.name);
}
```

#### Bulk Sync Pending Requests
```typescript
import { bulkSyncClientsToZoho } from './lib/zohoCustomerSync';

const result = await bulkSyncClientsToZoho(100, true);
console.log(`✅ Success: ${result.succeeded}`);
console.log(`❌ Failed: ${result.failed}`);
console.log(`📊 Total: ${result.total}`);

// Check individual results
result.results.forEach(r => {
  console.log(`${r.email} - ${r.action} - ${r.success ? '✅' : '❌'}`);
});
```

#### Sync All Users
```typescript
import { syncAllUsersToZoho } from './lib/zohoCustomerSync';

const result = await syncAllUsersToZoho(100);
console.log(`Synced ${result.succeeded} users to Zoho Books`);
```

#### Get Zoho Customer List
```typescript
import { getZohoCustomerList } from './lib/zohoCustomerSync';

const customers = await getZohoCustomerList();
console.log(`Total customers in Zoho: ${customers.length}`);
```

## Common Use Cases

### Use Case 1: Manual Customer Addition
When you need to add a customer outside of the invoice flow:

```typescript
const client = createZohoBooksClient();
if (client) {
  const customer = await client.addCustomer({
    contactName: 'New Customer',
    email: 'new@example.com',
    phone: '+1234567890',
    currencyCode: 'USD'
  });
  alert(`Customer added: ${customer.customer_id}`);
}
```

### Use Case 2: Sync Before Bulk Operations
Before sending bulk invoices, ensure all customers exist:

```typescript
// Sync all pending client requests first
const syncResult = await bulkSyncClientsToZoho(200, true);
console.log(`Prepared ${syncResult.succeeded} customers`);

// Now proceed with bulk invoice creation
// ... your invoice logic here
```

### Use Case 3: Update Customer After Info Change
When a client updates their information:

```typescript
const customer = await client.findCustomerByEmail(clientEmail);
if (customer) {
  await client.updateCustomer(customer.customer_id, {
    phone: newPhone,
    billingAddress: newAddress
  });
}
```

### Use Case 4: Check Customer Status
Before creating an invoice manually:

```typescript
const customer = await client.findCustomerByEmail(email);
if (!customer) {
  console.log('Customer does not exist, will be created with invoice');
} else {
  console.log('Using existing customer:', customer.customer_id);
}
```

## Response Types

### SyncResult
```typescript
{
  success: boolean;
  customerId?: string;      // Zoho Books customer ID
  email: string;
  name: string;
  error?: string;           // Error message if failed
  action: 'created' | 'exists' | 'failed';
}
```

### BulkSyncResult
```typescript
{
  total: number;           // Total customers attempted
  succeeded: number;       // Successfully synced
  failed: number;          // Failed to sync
  results: SyncResult[];   // Individual results
}
```

### ZohoCustomerResponse
```typescript
{
  customer_id: string;
  contact_name: string;
  email: string;
  phone?: string;
  mobile?: string;
  currency_code?: string;
  created_time?: string;
  last_modified_time?: string;
}
```

## Error Handling

All customer operations include error handling:

```typescript
try {
  const result = await syncCustomerToZoho(email, name, phone);
  if (result.success) {
    console.log('✅ Success:', result.customerId);
  } else {
    console.error('❌ Error:', result.error);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

## Rate Limiting

The bulk sync operations include automatic rate limiting:
- 100ms delay between customer creations
- Prevents API quota issues
- Ensures reliable operation

## Best Practices

1. **Always check for existing customers** before creating duplicates
2. **Use bulk sync** for initial setup or periodic synchronization
3. **Include complete contact information** when possible
4. **Handle errors gracefully** and log failures for review
5. **Use appropriate currency codes** for international clients
6. **Keep customer data synchronized** between systems

## Console Logging

Customer operations log to console for debugging:

```
Syncing customer to Zoho Books...
Customer created in Zoho Books: customer_id_123456
```

or

```
Customer exists in Zoho Books: customer_id_789012
```

## Testing

To test customer management without creating invoices:

```typescript
// Test 1: Create customer
const client = createZohoBooksClient();
const newCustomer = await client.addCustomer({
  contactName: 'Test User',
  email: 'test@example.com'
});
console.log('Created:', newCustomer);

// Test 2: Find customer
const found = await client.findCustomerByEmail('test@example.com');
console.log('Found:', found);

// Test 3: List customers
const all = await client.listCustomers();
console.log('Total:', all.length);
```

## Integration Points

The customer management integrates with:
- **Book Sessions Panel** - Automatic sync on invoice creation
- **Supabase Database** - Sync from client_requests and users tables
- **Zoho Books API** - Direct API integration for all operations

## Next Steps

To use customer management:
1. Ensure Zoho Books credentials are configured in `.env`
2. Customer sync happens automatically when creating invoices
3. Use manual methods for advanced scenarios
4. Use bulk sync for initial data migration
5. Monitor console logs for sync results
