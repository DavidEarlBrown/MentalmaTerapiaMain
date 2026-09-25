import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    let path = url.pathname.replace('/functions/v1/api/', '');

    if (path.startsWith('/api/')) {
      path = path.replace('/api/', '');
    }

    path = path.replace(/^\//, '');

    if (path === 'professions' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('professions')
        .select('*')
        .order('name_en');

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'admin/professions' && req.method === 'POST') {
      const body = await req.json();

      if (!body.name_en || !body.name_es) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: name_en, name_es' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('professions')
        .insert({
          name_en: body.name_en,
          name_es: body.name_es,
          description_en: body.description_en || '',
          description_es: body.description_es || '',
          is_active: body.is_active !== undefined ? body.is_active : true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'specialties' && req.method === 'GET') {
      const professionId = url.searchParams.get('profession_id');
      let query = supabase.from('specialties').select('*').order('name_en');
      if (professionId) query = query.eq('profession_id', professionId);

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'professionals' && req.method === 'GET') {
      const professionId = url.searchParams.get('profession_id');
      const baseSelect =
        'id, name_en, name_es, bio_en, bio_es, specialties_en, specialties_es, photo_url, is_active, created_at, counseling_types, time_zone, email, "PrimaryLanguage", "SecondaryLanguages", "Título", "Clasificación", profession, profession_id';
      const noticeSelectAttempts = [
        `${baseSelect}, minimum_notice`,
        `${baseSelect}, "Minimum Notice"`,
        baseSelect,
      ];

      const isMissingColumnError = (error: unknown) => {
        if (!error || typeof error !== 'object') return false;
        const record = error as { message?: string; code?: string; details?: string };
        const message = `${record.message ?? ''} ${record.details ?? ''}`.toLowerCase();
        return (
          record.code === '42703'
          || record.code === 'PGRST204'
          || message.includes('does not exist')
          || message.includes('could not find')
          || message.includes('minimum_notice')
          || message.includes('minimum notice')
        );
      };

      let data: unknown = null;
      let lastError: unknown = null;

      for (const select of noticeSelectAttempts) {
        let profQuery = supabase
          .from('professionals')
          .select(select)
          .eq('is_active', true);
        if (professionId) profQuery = profQuery.eq('profession_id', professionId);

        const result = await profQuery;
        if (!result.error) {
          data = result.data;
          lastError = null;
          break;
        }

        if (!isMissingColumnError(result.error)) {
          throw result.error;
        }
        lastError = result.error;
      }

      if (lastError) throw lastError;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'slots' && req.method === 'GET') {
      const professionalId = url.searchParams.get('professional_id');

      if (!professionalId) {
        return new Response(
          JSON.stringify({ error: 'professional_id is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('available_slots')
        .select('*')
        .eq('professional_id', professionalId)
        .eq('is_booked', false);

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'client-requests' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('client_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'client-requests' && req.method === 'POST') {
      const body = await req.json();

      if (!body.username || !body.client_email || !body.issue || !body.preferred_date || !body.professional_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: username, client_email, issue, preferred_date, professional_id' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const preferredDateStr = body.preferred_date;
      const preferredTimeStr = body.preferred_time;
      let preferredDate: string;
      let scheduledDatetime: string | null = null;

      if (preferredDateStr.includes('T')) {
        const dt = new Date(preferredDateStr);
        preferredDate = dt.toISOString().split('T')[0];
        scheduledDatetime = dt.toISOString();
      } else if (preferredTimeStr) {
        preferredDate = preferredDateStr;
        const fullDateTime = `${preferredDateStr}T${preferredTimeStr}`;
        const dt = new Date(fullDateTime);
        scheduledDatetime = dt.toISOString();
      } else {
        preferredDate = preferredDateStr;
      }

      const insertData: Record<string, unknown> = {
        user_id: body.user_id || null,
        username: body.username,
        full_name: body.full_name || body.client_name || '',
        client_email: body.client_email,
        client_phone: body.client_phone || '',
        issue: body.issue,
        preferred_date: preferredDate,
        preferred_time: body.preferred_time,
        // Persist the client's timezone for later time-difference calculations.
        // If it's missing/null, treat it as Colombia.
        time_zone: body.time_zone ?? 'America/Bogota',
        session_length: body.session_length || 1,
        professional_id: body.professional_id,
        specialty_id: body.specialty_id,
        counseling_type_id: body.counseling_type_id,
        status: 'pending',
        statusvalue: body.statusvalue ?? body.session_status ?? 0,
        notes: body.notes || '',
        meeting_platform: body.meeting_platform || 'manual',
        session_price_id: body.session_price_id,
        price_amount: body.price_amount,
        price_currency: body.price_currency,
        num_sessions: Math.max(1, body.num_sessions ?? 1),
        session_no: body.session_no ?? 1,
        TimeSlotId: body.TimeSlotId,
      };

      if (scheduledDatetime) {
        insertData.scheduled_datetime = scheduledDatetime;
      }

      const { data: clientRequest, error: requestError } = await supabase
        .from('client_requests')
        .insert(insertData)
        .select()
        .single();

      if (requestError) throw requestError;

      return new Response(JSON.stringify(clientRequest), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'admin/specialties' && req.method === 'POST') {
      const body = await req.json();

      if (!body.name_en || !body.name_es) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('specialties')
        .insert({
          name_en: body.name_en,
          name_es: body.name_es,
          description_en: body.description_en || '',
          description_es: body.description_es || '',
          icon: body.icon || '',
          is_active: body.is_active !== undefined ? body.is_active : true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path.startsWith('admin/rows/') && req.method === 'GET') {
      const tableName = path.split('/')[2];
      const validTables = ['users', 'client_requests', 'available_slots', 
        'specialties', 'professionals', 'resumes', 'sessions', 'sessionPrices', 
        'std_questionnaires', 'payment_transactions', 'counseling_types', 'problems', 
        'ConsultLog', 'questionnaire_results', 'professions', 'EventsMaster'];

      if (!validTables.includes(tableName)) {
        return new Response(
          JSON.stringify({ error: 'Invalid table name' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const userFilter = url.searchParams.get('user');
      let query = supabase.from(tableName).select('*');

      if (userFilter && tableName === 'client_requests') {
        query = query.or(`username.ilike.%${userFilter}%,client_email.ilike.%${userFilter}%,full_name.ilike.%${userFilter}%`);
      } else if (userFilter && tableName === 'users') {
        query = query.or(`username.ilike.%${userFilter}%,email.ilike.%${userFilter}%,full_name.ilike.%${userFilter}%`);
      } else if (userFilter && (tableName === 'sessions' || tableName === 'payment_transactions')) {
        query = query.or(`client_name.ilike.%${userFilter}%,client_email.ilike.%${userFilter}%`);
      } else if (userFilter && tableName === 'resumes') {
        query = query.ilike('Name', `%${userFilter}%`);
      } else if (userFilter && tableName === 'questionnaire_results') {
        query = query.contains('metadata', { client_email: userFilter });
      }
      else if (userFilter && tableName === 'std_questionnaires') {
        query = query.ilike('id', `%${userFilter}%`);
      }
      if (tableName === 'specialties' || tableName === 'professionals' || tableName === 'counseling_types' || tableName === 'professions') {
        query = query.order('created_at', { ascending: true });
      } else if (tableName === 'std_questionnaires') {
        query = query.order('id', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path.startsWith('admin/row/') && req.method === 'PUT') {
      const parts = path.split('/');
      const tableName = parts[2];
      const rowId = parts[3];
      const validTables = ['users', 'client_requests', 'available_slots', 'specialties', 'professionals',
         'resumes', 'sessions', 'sessionPrices', 'std_questionnaires', 'payment_transactions',
          'counseling_types', 'problems', 'ConsultLog', 'questionnaire_results', 
          'professions', 'EventsMaster'];

      if (!validTables.includes(tableName)) {
        return new Response(
          JSON.stringify({ error: 'Invalid table name' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const body = await req.json();
      delete body.id;
      delete body.created_at;

      const { data, error: updateError } = await supabase
        .from(tableName)
        .update(body)
        .eq('id', rowId)
        .select()
        .maybeSingle();

      if (updateError) throw updateError;

      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Row not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path.startsWith('admin/row/') && req.method === 'DELETE') {
      const parts = path.split('/');
      const tableName = parts[2];
      const rowId = parts[3];
      const validTables = ['users', 'client_requests', 'available_slots', 'specialties', 'professionals', 'resumes', 'sessions', 'sessionPrices', 'std_questionnaires', 'payment_transactions', 'counseling_types', 'problems', 'ConsultLog', 'questionnaire_results', 'professions', 'EventsMaster'];

      if (!validTables.includes(tableName)) {
        return new Response(
          JSON.stringify({ error: 'Invalid table name' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // When deleting a user, also remove them from Supabase Auth
      if (tableName === 'users') {
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(rowId);
        if (authDeleteError && !authDeleteError.message.includes('not found')) {
          return new Response(
            JSON.stringify({ error: authDeleteError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', rowId);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({ success: true, message: 'Row deleted successfully' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (path.startsWith('admin/row/') && req.method === 'POST') {
      const parts = path.split('/');
      const tableName = parts[2];
      const validTables = ['users', 'client_requests', 'available_slots', 'specialties', 'professionals', 'resumes', 'sessions', 'sessionPrices', 'std_questionnaires', 'payment_transactions', 'counseling_types', 'problems', 'ConsultLog', 'questionnaire_results', 'professions', 'EventsMaster'];

      console.log('Insert request for table:', tableName);

      if (!validTables.includes(tableName)) {
        console.error('Invalid table name:', tableName);
        return new Response(
          JSON.stringify({ error: 'Invalid table name' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      let body;
      try {
        body = await req.json();
        console.log('Insert data:', body);
      } catch (parseError) {
        console.error('Error parsing request body:', parseError);
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error: insertError } = await supabase
        .from(tableName)
        .insert(body)
        .select()
        .single();

      if (insertError) {
        console.error('Database insert error:', insertError);
        return new Response(
          JSON.stringify({
            error: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('Insert successful:', data);
      return new Response(
        JSON.stringify(data),
        {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (path === 'fetch-user' && req.method === 'GET') {
      const userId = url.searchParams.get('id');
      const userEmail = url.searchParams.get('email');
      const username = url.searchParams.get('username');

      if (!userId && !userEmail && !username) {
        return new Response(
          JSON.stringify({ error: 'id, email, or username parameter required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      let query = supabase.from('users').select('*');
      if (userId) {
        query = query.eq('id', userId);
      } else if (userEmail) {
        const emailNorm = userEmail.trim().toLowerCase();
        query = query.eq('email', emailNorm);
      } else if (username) {
        const key = username.trim();
        // Exact match on username or email (case-insensitive). Quote for PostgREST .or filters.
        const escaped = key.replace(/"/g, '\\"');
        query = query.or(`username.ilike."${escaped}",email.ilike."${escaped}"`);
      }

      const { data: userData, error: fetchErr } = await query.limit(1).maybeSingle();
      if (fetchErr) throw fetchErr;

      return new Response(JSON.stringify(userData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'complete-profile' && req.method === 'POST') {
      const body = await req.json();

      if (!body.id || !body.username || !body.email || !body.full_name) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: id, username, email, full_name' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      body.email = String(body.email).trim().toLowerCase();

      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        if (token !== anonKey) {
          const authClient = createClient(supabaseUrl, supabaseKey);
          const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
          if (authError || !authUser || authUser.id !== body.id) {
            return new Response(
              JSON.stringify({ error: 'Unauthorized' }),
              {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
        }
      }

      let existingUser: any = null;

      const { data: userById } = await supabase
        .from('users')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();

      existingUser = userById;

      if (!existingUser && body.email) {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', body.email)
          .maybeSingle();
        existingUser = userByEmail;
      }

      let profileData;
      let profileError;

      if (existingUser && existingUser.id === body.id) {
        const updateFields: Record<string, any> = {
          last_login: new Date().toISOString(),
          auth_provider: body.auth_provider || existingUser.auth_provider || 'google',
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('users')
          .update(updateFields)
          .eq('id', existingUser.id);
        profileData = { ...existingUser, ...updateFields };
        profileError = error;
      } else if (existingUser && existingUser.id !== body.id) {
        const { data: alreadyLinked } = await supabase
          .from('users')
          .select('*')
          .eq('id', body.id)
          .maybeSingle();

        if (alreadyLinked) {
          const updateFields: Record<string, any> = {
            last_login: new Date().toISOString(),
            auth_provider: body.auth_provider || alreadyLinked.auth_provider || 'google',
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase
            .from('users')
            .update(updateFields)
            .eq('id', alreadyLinked.id);
          profileData = { ...alreadyLinked, ...updateFields };
          profileError = error;
        } else {
          const { data, error } = await supabase
            .from('users')
            .insert({
              id: body.id,
              username: body.username + '_g',
              email: body.email,
              full_name: body.full_name || existingUser.full_name,
              phone: body.phone || existingUser.phone || '',
              role: 'client',
              user_type: 'client',
              is_active: true,
              auth_provider: body.auth_provider || 'google',
              last_login: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select()
            .maybeSingle();
          profileData = data;
          profileError = error;
        }
      } else {
        const { data, error } = await supabase
          .from('users')
          .insert({
            id: body.id,
            username: body.username,
            email: body.email,
            full_name: body.full_name,
            phone: body.phone || '',
            role: 'client',
            user_type: 'client',
            is_active: true,
            auth_provider: body.auth_provider || 'google',
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();
        profileData = data;
        profileError = error;
      }

      if (profileError) {
        return new Response(
          JSON.stringify({ error: profileError.message, details: profileError.details }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify(profileData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'admin/users' && req.method === 'POST') {
      const body = await req.json();

      if (!body.username || !body.email || !body.full_name) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const emailNorm = String(body.email).trim().toLowerCase();
      const { data: existingEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', emailNorm)
        .maybeSingle();

      if (existingEmail) {
        return new Response(
          JSON.stringify({ error: 'An account with this email already exists' }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('users')
        .insert({
          username: body.username,
          email: emailNorm,
          full_name: body.full_name,
          phone: body.phone || '',
          user_type: 'client',
          role: 'client',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'admin/professionals' && req.method === 'POST') {
      const body = await req.json();

      if (!body.name_en || !body.name_es) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('professionals')
        .insert({
          name_en: body.name_en,
          name_es: body.name_es,
          bio_en: body.bio_en || '',
          bio_es: body.bio_es || '',
          specialties_en: body.specialties_en || [],
          specialties_es: body.specialties_es || [],
          counseling_types: body.counseling_types || [],
          photo_url: body.photo_url || '',
          is_active: body.is_active !== undefined ? body.is_active : true,
          'Título': body['Título'] || '',
          'Clasificación': body['Clasificación'] || '',
          email: body.email || '',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'session-prices' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('sessionPrices')
        .select('*')
        .order('Price', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'session-prices' && req.method === 'POST') {
      const body = await req.json();

      if (!body.Name || !body.Price) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('sessionPrices')
        .insert({
          Name: body.Name,
          Price: body.Price,
          NumSessions: body.NumSessions || 1,
          Descriptions: body.Descriptions || '',
          Currency: body.Currency || 'USD',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'counseling-types' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('counseling_types')
        .select('*')
        .eq('is_active', true)
        .order('name_en');

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'counseling-types' && req.method === 'POST') {
      const body = await req.json();

      if (!body.name_en || !body.name_es) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('counseling_types')
        .insert({
          name_en: body.name_en,
          name_es: body.name_es,
          description_en: body.description_en || '',
          description_es: body.description_es || '',
          is_active: body.is_active !== undefined ? body.is_active : true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'payment-transactions' && req.method === 'POST') {
      const body = await req.json();

      if (!body.client_name || !body.client_email || !body.num_sessions || !body.payment_amount || !body.payment_method || !body.payment_status) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data, error } = await supabase
        .from('payment_transactions')
        .insert({
          client_name: body.client_name,
          client_email: body.client_email,
          client_phone: body.client_phone || '',
          session_price_id: body.session_price_id,
          num_sessions: body.num_sessions,
          payment_amount: body.payment_amount,
          payment_currency: body.payment_currency || 'USD',
          payment_method: body.payment_method,
          payment_status: body.payment_status,
          transaction_reference: body.transaction_reference || '',
          notes: body.notes || '',
          professional_id: body.professional_id,
          client_request_id: body.client_request_id,
          payment_date: body.payment_date || new Date().toISOString(),
          pse_type: body.pse_type || body.type || null,
          user_type: body.user_type ?? null,
          user_legal_id_type: body.user_legal_id_type || null,
          user_legal_id: body.user_legal_id || null,
          financial_institution_code: body.financial_institution_code || null,
          payment_description: body.payment_description || null,
          wompi_type: body.wompi_type || (body.payment_method === 'Wompi' ? 'CARD' : null),
          wompi_token: body.wompi_token || body.token || null,
          installments: body.installments ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'admin/create-professional-user' && req.method === 'POST') {
      const body = await req.json();

      if (!body.email || !body.full_name) {
        return new Response(
          JSON.stringify({ error: 'email and full_name are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const emailNorm = String(body.email).trim().toLowerCase();

      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', emailNorm)
        .maybeSingle();

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'A user with this email already exists', id: existingUser.id }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: emailNorm,
        password: 'Mentalma1',
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
      });

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authUserId = authData.user.id;

      // Derive username from full_name: lowercase, remove spaces and special chars
      const baseUsername = String(body.full_name)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9_]/g, '');

      // Ensure uniqueness — append numeric suffix if already taken
      let username = baseUsername;
      let suffix = 1;
      while (true) {
        const { data: taken } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .maybeSingle();
        if (!taken) break;
        username = `${baseUsername}${suffix}`;
        suffix++;
      }

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .upsert({
          id: authUserId,
          username,
          email: emailNorm,
          full_name: body.full_name,
          phone: '',
          user_type: 'Professional',
          role: 'professional',
          is_active: true,
        }, { onConflict: 'id' })
        .select()
        .single();

      if (userError) {
        return new Response(
          JSON.stringify({ error: userError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(newUser), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
