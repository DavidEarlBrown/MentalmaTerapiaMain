/**
 * analytics.ts — Google Analytics 4 helper for Mentalma SPA.
 *
 * All calls are no-ops when gtag is not loaded (dev without a real GA ID).
 *
 * Usage:
 *   import { trackPageView, trackEvent } from '../lib/analytics';
 *   trackPageView('home');
 *   trackEvent('book_appointment', { professional_id: '123' });
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/** Returns true when GA4 is loaded and has a real Measurement ID. */
function gaReady(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/** Human-readable titles for each section/route. */
const PAGE_TITLES: Record<string, string> = {
  home:                 'Home',
  professionals:        'Professionals',
  'professional-detail':'Professional Detail',
  appointments:         'Appointments',
  'book-appointment':   'Book Appointment',
  'client-info':        'Client Info',
  admin:                'Admin Panel',
  'admin-user-roles':   'User Roles',
  'manage-profile':     'Manage Profile',
  'payment':            'Payment',
  'support-tickets':    'Support Tickets',
  'mentalma-analysis':  'Mentalma Analysis',
  'zoho-token':         'Zoho Token',
  'google-token':       'Google Token',
  sessions:             'Sessions',
  'cancel-session':     'Cancel Session',
};

/**
 * Fire a GA4 page_view event for a section change.
 * Call this every time `currentSection` changes in App.tsx.
 */
export function trackPageView(section: string): void {
  if (!gaReady()) return;
  const title = PAGE_TITLES[section] ?? section;
  window.gtag!('event', 'page_view', {
    page_title:    `Mentalma – ${title}`,
    page_location: `${window.location.origin}/#${section}`,
    page_path:     `/#${section}`,
  });
}

/**
 * Fire a custom GA4 event.
 * @param eventName  GA4 event name (snake_case recommended)
 * @param params     Optional extra parameters
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (!gaReady()) return;
  window.gtag!('event', eventName, params ?? {});
}

// ── Common pre-built event helpers ────────────────────────────────────────────

export const GA = {
  /** User signed in */
  login: (method = 'email') =>
    trackEvent('login', { method }),

  /** User signed out */
  logout: () =>
    trackEvent('logout'),

  /** User started booking an appointment */
  beginBooking: (professionalId: string) =>
    trackEvent('begin_checkout', { professional_id: professionalId }),

  /** Appointment booked successfully */
  appointmentBooked: (professionalId: string) =>
    trackEvent('purchase', {
      transaction_id: `appt_${Date.now()}`,
      professional_id: professionalId,
    }),

  /** Support ticket created */
  ticketCreated: () =>
    trackEvent('generate_lead', { source: 'support_panel' }),

  /** Payment initiated */
  paymentInitiated: (amount: number, currency = 'COP') =>
    trackEvent('add_to_cart', { value: amount, currency }),

  /** Search performed */
  search: (term: string) =>
    trackEvent('search', { search_term: term }),
};
