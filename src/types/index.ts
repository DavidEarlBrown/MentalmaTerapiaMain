export interface Profession {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  is_active: boolean;
  created_at: string;
}

export interface Specialty {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  icon: string;
  is_active: boolean;
  profession_id?: string | null;
  created_at: string;
}

export interface CounselingType {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  is_active: boolean;
  profession_id?: string | null;
  created_at: string;
}

export interface Professional {
  id: string;
  name_en: string;
  name_es: string;
  bio_en: string;
  bio_es: string;
  specialties_en: string[];
  specialties_es: string[];
  counseling_types?: string[];
  photo_url: string;
  is_active: boolean;
  created_at: string;
  time_zone?: string;
  PrimaryLanguage?: string;
  SecondaryLanguages?: string[];
  Título?: string;
  Clasificación?: string;
  email?: string;
  profession?: string | null;
  profession_id?: string | null;
  user_id?: string | null;
  minimum_notice?: number | null;
  'Minimum Notice'?: number | null;
}

export interface AvailableSlot {
  id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  created_at: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

/** Unified calendar row built from sessions and/or client_requests. */
export interface CalendarItem {
  id: string;
  source: 'session' | 'client_request';
  professional_id: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  subject: string;
  status: string;
  scheduled_at: string;
  price_amount?: string;
  price_currency?: string;
  num_sessions?: number;
  TimeSlotId?: string;
}

export interface ClientRequest {
  id?: string;
  user_id?: string;
  username: string;
  full_name?: string;
  client_name?: string;
  client_email: string;
  client_phone?: string;
  issue: string;
  preferred_date: string;
  preferred_time?: string;
  // IANA timezone used by the client for this request (used for time comparisons).
  time_zone?: string;
  session_length?: number;
  scheduled_datetime?: string;
  professional_id: string;
  specialty_id?: string;
  counseling_type_id?: string;
  status?: string;
  statusvalue?: number | null;
  session_status?: number;
  notes?: string;
  created_at?: string;
  session_price_id?: number;
  price_amount?: string;
  price_currency?: string;
  num_sessions?: number;
  session_no?: number;
  meeting_uri?: string;
  meeting_code?: string;
  meeting_platform?: string;
  calendar_event_id?: string;
  TimeSlotId?: string;
}

export interface ClientRequestFormData {
  user_id?: string;
  username: string;
  full_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  issue: string;
  preferred_date: string;
  preferred_time?: string;
  // Sent along when creating/updating a client request.
  time_zone?: string;
  session_length?: number;
  professional_id: string;
  specialty_id?: string;
  counseling_type_id?: string;
  session_price_id?: number;
  price_amount?: string;
  price_currency?: string;
  num_sessions?: number;
  session_no?: number;
  TimeSlotId?: string;
  statusvalue?: number;
  session_status?: number;
}

export interface User {
  id?: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role?: string;
  user_type?: string;
  is_active?: boolean;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserFormData {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  user_type?: string;
}

export interface SessionPrice {
  id: number;
  created_at: string;
  Price: string;
  Name: string;
  NumSessions: number;
  Descriptions: string;
  Currency: string;
  professional_id?: string | null;
}

export interface PaymentTransaction {
  id?: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  session_price_id?: number;
  num_sessions: number;
  payment_amount: number;
  payment_currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference?: string;
  notes?: string;
  professional_id?: string;
  client_request_id?: string;
  zoho_invoice_id?: string;
  payment_date?: string;
  created_at?: string;
  updated_at?: string;
  type?: string;
  user_type?: number;
  user_legal_id_type?: string;
  user_legal_id?: string;
  financial_institution_code?: string;
  payment_description?: string;
  token?: string;
  installments?: number;
}

export interface PaymentFormData {
  client_name: string;
  client_email: string;
  client_phone?: string;
  session_price_id?: number;
  num_sessions: number;
  payment_amount: number;
  payment_currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference?: string;
  notes?: string;
  professional_id?: string;
  client_request_id?: string;
  exchange_rate?: number;
  /** Payment source type: "PSE" for bank transfer / Wompi PSE, "CARD" for Wompi cards. */
  type?: string;
  token?: string;
  installments?: number;
  /** 0 = individual, 1 = business */
  user_type?: number;
  user_legal_id_type?: string;
  user_legal_id?: string;
  financial_institution_code?: string;
  payment_description?: string;
}

export interface Session {
  id: string;
  user_id?: string;
  username?: string;
  full_name?: string;
  client_name?: string;
  client_email: string;
  professional_id: string;
  session_date: string;
  duration_minutes: number;
  session_length?: number;
  amount: string;
  currency: string;
  payment_status: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  TimeSlotId?: string;
  PriceCharged?: string;
  TotalAmtCharged?: string;
  online_platform?: string;
  num_sessions?: number;
  session_no?: number;
  client_rating?: number | null;
}

export interface Problem {
  id: number;
  created_at: string;
  problem_abrev: string;
  problem_desc: string;
  status: string;
  profession: string;
  problem_abrev_es: string;
  problem_desc_es: string;
  profession_id?: string | null;
}

export interface ConsultLogEntry {
  id?: number;
  session_id: string;
  action_type: string;
  reason: string;
  old_session_date?: string;
  new_session_date?: string;
  performed_by: string;
  additional_notes?: string;
  created_at?: string;
  UserId?: string;
}

/** Row shape returned by the admin Data Browser API (dynamic columns). */
export type AdminTableRow = Record<string, unknown> & { id: string | number };

/** Psychologist resume / application record (legacy column names from DB). */
export interface Resume {
  id: number;
  Name: string;
  Country: string;
  Language: string[];
  'TypeThera;y': string[];
  ReasonForInterest: string[];
  AppStatus?: string;
  created_at: string;
}
