import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Profession } from '../types';

// Query the DB directly via the Supabase JS client so we always get a fresh,
// uncached result on the same connection that the realtime subscription uses.
async function loadProfessions(): Promise<Profession[]> {
  const { data, error } = await supabase
    .from('professions')
    .select('*')
    .order('name_en');
  if (error) throw error;
  return (data ?? []) as Profession[];
}

interface ProfessionContextType {
  professions: Profession[];
  activeProfession: Profession | null;
  setActiveProfession: (p: Profession | null) => void;
}

const ProfessionContext = createContext<ProfessionContextType | undefined>(undefined);

// Use a user-specific key so each user's choice is stored independently.
// Falls back to the legacy global key when no user is signed in.
function storageKey(userId: string | null): string {
  return userId ? `activeProfession_${userId}` : 'activeProfession';
}

function loadStoredProfession(userId: string | null): Profession | null {
  try {
    // Try the user-specific key first, then fall back to the legacy global key
    const userKey = storageKey(userId);
    const raw = localStorage.getItem(userKey) ?? (userId ? localStorage.getItem('activeProfession') : null);
    return raw ? (JSON.parse(raw) as Profession) : null;
  } catch {
    return null;
  }
}

function saveStoredProfession(userId: string | null, profession: Profession | null): void {
  const key = storageKey(userId);
  if (profession) {
    localStorage.setItem(key, JSON.stringify(profession));
  } else {
    localStorage.removeItem(key);
  }
}

export function ProfessionProvider({ children }: { children: ReactNode }) {
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [activeProfession, setActiveProfessionState] = useState<Profession | null>(
    () => loadStoredProfession(null)
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Keep a ref so the auth-change effect can validate against the already-loaded list
  const professionsRef = useRef<Profession[]>([]);

  // Subscribe to Supabase auth so we know which user is signed in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Whenever the signed-in user changes, load their stored profession preference
  useEffect(() => {
    const stored = loadStoredProfession(currentUserId);
    const list = professionsRef.current;
    const firstActive = (l: Profession[]) => l.find(p => p.is_active) ?? l[0] ?? null;

    if (!stored) {
      // No stored preference — fall back to first active profession
      setActiveProfessionState(firstActive(list));
      return;
    }
    // Validate against the already-loaded profession list (if available)
    if (list.length > 0) {
      const match = list.find(p => p.id === stored.id);
      setActiveProfessionState(match?.is_active ? match : firstActive(list));
    } else {
      // Professions haven't loaded yet; set it tentatively and let the fetch effect validate it
      setActiveProfessionState(stored);
    }
  }, [currentUserId]);

  // Fetch all professions from the DB (no is_active filter — show every entry)
  // and subscribe to real-time changes so the list stays in sync without a page refresh.
  useEffect(() => {
    const firstActive = (list: Profession[]) =>
      list.find(p => p.is_active) ?? list[0] ?? null;

    const applyList = (data: Profession[]) => {
      setProfessions(data);
      professionsRef.current = data;
      setActiveProfessionState(prev => {
        if (prev) {
          // Keep the current selection if it's still active; otherwise fall back to the first active one
          const current = data.find(p => p.id === prev.id);
          if (current?.is_active) return current;
          return firstActive(data);
        }
        return firstActive(data);
      });
    };

    loadProfessions().then(applyList).catch(() => setProfessions([]));

    const channel = supabase
      .channel('professions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professions' },
        () => {
          loadProfessions().then(applyList).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const setActiveProfession = (p: Profession | null) => {
    setActiveProfessionState(p);
    saveStoredProfession(currentUserId, p);
  };

  return (
    <ProfessionContext.Provider value={{ professions, activeProfession, setActiveProfession }}>
      {children}
    </ProfessionContext.Provider>
  );
}

export function useProfession() {
  const ctx = useContext(ProfessionContext);
  if (!ctx) throw new Error('useProfession must be used within a ProfessionProvider');
  return ctx;
}
