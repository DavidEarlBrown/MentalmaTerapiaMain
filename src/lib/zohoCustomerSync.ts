import { supabase } from './supabaseClient';
import { createZohoBooksClient, type CreateCustomerParams, type ZohoCustomerResponse } from './zohoBooksClient';

interface ClientFromDatabase {
  id: string;
  email: string;
  full_name?: string;
  username?: string;
  client_phone?: string;
  created_at?: string;
}

export interface SyncResult {
  success: boolean;
  customerId?: string;
  email: string;
  name: string;
  error?: string;
  action: 'created' | 'exists' | 'failed';
}

export interface BulkSyncResult {
  total: number;
  succeeded: number;
  failed: number;
  results: SyncResult[];
}

export async function syncCustomerToZoho(
  email: string,
  fullName?: string,
  phone?: string,
  additionalParams?: Partial<CreateCustomerParams>
): Promise<SyncResult> {
  try {
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
      return {
        success: false,
        email,
        name: fullName || email,
        error: 'Zoho Books is not configured',
        action: 'failed',
      };
    }

    const existingCustomer = await zohoClient.findCustomerByEmail(email);
    if (existingCustomer) {
      return {
        success: true,
        customerId: existingCustomer.customer_id,
        email,
        name: fullName || email,
        action: 'exists',
      };
    }

    const nameParts = (fullName || email).split(' ');
    const firstName = nameParts[0] || 'Client';
    const lastName = nameParts.slice(1).join(' ') || '';

    const customerParams: CreateCustomerParams = {
      contactName: fullName || email,
      email,
      firstName,
      lastName,
      phone,
      ...additionalParams,
    };

    const result = await zohoClient.addCustomer(customerParams);

    return {
      success: true,
      customerId: result.customer_id,
      email,
      name: fullName || email,
      action: 'created',
    };
  } catch (error) {
    console.error('Error syncing customer to Zoho:', error);
    return {
      success: false,
      email,
      name: fullName || email,
      error: error instanceof Error ? error.message : 'Unknown error',
      action: 'failed',
    };
  }
}

export async function syncClientRequestToZoho(clientRequestId: string): Promise<SyncResult> {
  try {
    const { data: clientRequest, error } = await supabase
      .from('client_requests')
      .select('id, client_email, full_name, username, client_phone, created_at')
      .eq('id', clientRequestId)
      .maybeSingle();

    if (error || !clientRequest) {
      return {
        success: false,
        email: 'unknown',
        name: 'unknown',
        error: error?.message || 'Client request not found',
        action: 'failed',
      };
    }

    return await syncCustomerToZoho(
      clientRequest.client_email,
      clientRequest.full_name || clientRequest.username,
      clientRequest.client_phone
    );
  } catch (error) {
    console.error('Error syncing client request:', error);
    return {
      success: false,
      email: 'unknown',
      name: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
      action: 'failed',
    };
  }
}

export async function bulkSyncClientsToZoho(
  limit = 100,
  onlyPending = true
): Promise<BulkSyncResult> {
  const results: SyncResult[] = [];
  let succeeded = 0;
  let failed = 0;

  try {
    let query = supabase
      .from('client_requests')
      .select('id, client_email, full_name, username, client_phone, created_at, status')
      .limit(limit);

    if (onlyPending) {
      query = query.eq('status', 'pending');
    }

    const { data: clientRequests, error } = await query;

    if (error) {
      throw error;
    }

    if (!clientRequests || clientRequests.length === 0) {
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      };
    }

    const uniqueClients = new Map<string, ClientFromDatabase>();
    for (const request of clientRequests) {
      if (!uniqueClients.has(request.client_email)) {
        uniqueClients.set(request.client_email, {
          id: request.id,
          email: request.client_email,
          full_name: request.full_name,
          username: request.username,
          client_phone: request.client_phone,
          created_at: request.created_at,
        });
      }
    }

    for (const [email, client] of uniqueClients) {
      const result = await syncCustomerToZoho(
        email,
        client.full_name || client.username,
        client.client_phone
      );

      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      total: uniqueClients.size,
      succeeded,
      failed,
      results,
    };
  } catch (error) {
    console.error('Error in bulk sync:', error);
    return {
      total: 0,
      succeeded,
      failed,
      results,
    };
  }
}

export async function syncAllUsersToZoho(limit = 100): Promise<BulkSyncResult> {
  const results: SyncResult[] = [];
  let succeeded = 0;
  let failed = 0;

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name, username, phone')
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!users || users.length === 0) {
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      };
    }

    for (const user of users) {
      const result = await syncCustomerToZoho(
        user.email,
        user.full_name || user.username,
        user.phone
      );

      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      total: users.length,
      succeeded,
      failed,
      results,
    };
  } catch (error) {
    console.error('Error syncing users:', error);
    return {
      total: 0,
      succeeded,
      failed,
      results,
    };
  }
}

export async function getZohoCustomerList(): Promise<ZohoCustomerResponse[]> {
  try {
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
      console.error('Zoho Books is not configured');
      return [];
    }

    return await zohoClient.listCustomers();
  } catch (error) {
    console.error('Error fetching Zoho customer list:', error);
    return [];
  }
}
