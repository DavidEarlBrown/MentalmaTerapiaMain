import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { updateRow } from '../lib/api';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  full_name: string;
  user_type: string;
  role: string;
}

interface UserRoleModalProps {
  onClose: () => void;
}

interface UserRoleManagerContentProps {
  onClose?: () => void;
}

type RoleOption = 'client' | 'Professional' | 'Administrator';

const ROLE_OPTIONS: { label: string; value: RoleOption; role: string; description: string }[] = [
  {
    label: 'Client',
    value: 'client',
    role: 'client',
    description: 'Regular client who can book sessions and submit requests.',
  },
  {
    label: 'Professional',
    value: 'Professional',
    role: 'professional',
    description: 'Professional or therapist who can be assigned sessions.',
  },
  {
    label: 'Administrator',
    value: 'Administrator',
    role: 'admin',
    description: 'Full admin access to manage the platform.',
  },
];

function UserRoleManagerContent({ onClose }: UserRoleManagerContentProps) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length >= 2) {
        searchUsers(search.trim());
      } else if (search.trim().length === 0) {
        loadAllUsers();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, full_name, user_type, role')
        .order('full_name', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const searchUsers = async (query: string) => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, full_name, user_type, role')
        .or(`email.ilike.%${query}%,full_name.ilike.%${query}%,username.ilike.%${query}%`)
        .order('full_name', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSelectUser = (user: UserRecord) => {
    setSelectedUser(user);
    const currentRole = getDisplayRole(user) as RoleOption;
    setSelectedRole(currentRole);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (!selectedUser || !selectedRole) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    const option = ROLE_OPTIONS.find(o => o.value === selectedRole)!;

    try {
      await updateRow('users', selectedUser.id, {
        user_type: option.value,
        role: option.role,
      });

      setSuccessMessage(`${selectedUser.full_name || selectedUser.email} is now set to ${option.label}.`);

      setUsers(prev =>
        prev.map(u =>
          u.id === selectedUser.id
            ? { ...u, user_type: option.value, role: option.role }
            : u
        )
      );
      setSelectedUser(prev => (prev ? { ...prev, user_type: option.value, role: option.role } : prev));
    } catch (err) {
      console.error('Error updating user role:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setSaving(false);
    }
  };

  const getDisplayRole = (user: UserRecord) => {
    if (user.user_type) return user.user_type;
    if (user.role === 'admin') return 'Administrator';
    if (user.role === 'professional') return 'Professional';
    return 'client';
  };

  const getRoleBadgeColor = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r === 'administrator' || r === 'admin') return '#dc2626';
    if (r === 'professional') return '#0369a1';
    return '#16a34a';
  };

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        margin: '1rem',
      }}
    >
      <div
        style={{
          padding: '1.5rem 1.75rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 600 }}>
            Manage User Roles
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
            Search for a user and change their access level.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#374151',
              flexShrink: 0,
            }}
            title="Close"
          >
            &times;
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            width: '55%',
            borderRight: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '1rem 1.25rem 0.75rem', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem 1rem' }}>
            {loadingUsers && (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                }}
              >
                Loading users...
              </div>
            )}
            {!loadingUsers && users.length === 0 && (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                }}
              >
                No users found.
              </div>
            )}
            {!loadingUsers &&
              users.map((user) => {
                const displayRole = getDisplayRole(user);
                const isSelected = selectedUser?.id === user.id;
                return (
                  <div
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    style={{
                      padding: '0.75rem 0.875rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                      border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                      marginBottom: '0.25rem',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: '0.9rem',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user.full_name || user.username || '(no name)'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: '#6b7280',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user.email}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '12px',
                          backgroundColor: getRoleBadgeColor(displayRole) + '18',
                          color: getRoleBadgeColor(displayRole),
                          whiteSpace: 'nowrap',
                          marginLeft: '0.5rem',
                          flexShrink: 0,
                        }}
                      >
                        {displayRole}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!selectedUser ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: '0.9rem',
                textAlign: 'center',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Select a user to change their role
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.25rem',
                  }}
                >
                  Selected User
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: '#111827',
                    fontSize: '1rem',
                  }}
                >
                  {selectedUser.full_name || selectedUser.username}
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#6b7280',
                  }}
                >
                  {selectedUser.email}
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.75rem',
                  }}
                >
                  Assign Role
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {ROLE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border:
                          '1px solid ' +
                          (selectedRole === option.value ? getRoleBadgeColor(option.value) : '#e5e7eb'),
                        backgroundColor:
                          selectedRole === option.value
                            ? getRoleBadgeColor(option.value) + '0e'
                            : '#fafafa',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option.value}
                        checked={selectedRole === option.value}
                        onChange={() => setSelectedRole(option.value)}
                        style={{ marginTop: '0.125rem', accentColor: getRoleBadgeColor(option.value) }}
                      />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            color: '#111827',
                          }}
                        >
                          {option.label}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: '#6b7280',
                            marginTop: '0.125rem',
                          }}
                        >
                          {option.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {successMessage && (
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    color: '#15803d',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                  }}
                >
                  {successMessage}
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    color: '#dc2626',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || (selectedUser && selectedRole === getDisplayRole(selectedUser))}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor:
                    saving || (selectedUser && selectedRole === getDisplayRole(selectedUser))
                      ? '#d1d5db'
                      : '#1d4ed8',
                  color:
                    saving || (selectedUser && selectedRole === getDisplayRole(selectedUser))
                      ? '#9ca3af'
                      : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor:
                    saving || (selectedUser && selectedRole === getDisplayRole(selectedUser))
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Role Change'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UserRoleModal({ onClose }: UserRoleModalProps) {
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <UserRoleManagerContent onClose={onClose} />
    </div>
  );
}

export function UserRoleManager() {
  return (
    <div style={{ padding: '0.5rem 0 1rem' }}>
      <UserRoleManagerContent />
    </div>
  );
}
