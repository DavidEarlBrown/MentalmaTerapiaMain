import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchProfessionals } from '../lib/api';
import type { SessionPrice, Professional } from '../types';

type PriceFormData = Pick<SessionPrice, 'Name' | 'Price' | 'NumSessions' | 'Descriptions' | 'Currency' | 'professional_id'>;

interface SessionPriceManagerProps {
  onFetchPrices: () => void;
  onCreatePrice: (price: Omit<SessionPrice, 'id' | 'created_at'>) => void;
  onUpdatePrice: (id: number, price: Partial<SessionPrice>) => void;
  onDeletePrice: (id: number) => void;
  prices: SessionPrice[];
  loading: boolean;
}

export function SessionPriceManager({
  onFetchPrices,
  onCreatePrice,
  onUpdatePrice,
  onDeletePrice,
  prices,
  loading,
}: SessionPriceManagerProps) {
  const { t } = useLanguage();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [formData, setFormData] = useState<PriceFormData>({
    Name: '',
    Price: '',
    NumSessions: 1,
    Descriptions: '',
    Currency: 'USD',
    professional_id: null,
  });

  useEffect(() => {
    onFetchPrices();
    fetchProfessionals().then(setProfessionals).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      professional_id: formData.professional_id || null,
    };
    if (editingId !== null) {
      await onUpdatePrice(editingId, payload);
      setEditingId(null);
    } else {
      await onCreatePrice(payload as Omit<SessionPrice, 'id' | 'created_at'>);
      setIsCreating(false);
    }
    resetForm();
  };

  const handleEdit = (price: SessionPrice) => {
    setFormData({
      Name: price.Name,
      Price: price.Price,
      NumSessions: price.NumSessions,
      Descriptions: price.Descriptions,
      Currency: price.Currency,
      professional_id: price.professional_id ?? null,
    });
    setEditingId(price.id);
    setIsCreating(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('confirmDelete') || 'Are you sure you want to delete this price?')) {
      await onDeletePrice(id);
    }
  };

  const resetForm = () => {
    setFormData({
      Name: '',
      Price: '',
      NumSessions: 1,
      Descriptions: '',
      Currency: 'USD',
    professional_id: null,
  });
  setIsCreating(false);
    setEditingId(null);
  };

  const getPriceScope = (price: SessionPrice) => {
    if (price.professional_id) {
      const prof = professionals.find(p => p.id === price.professional_id);
      if (prof) return `Professional: ${prof.name_en}`;
      return `Professional ID: ${price.professional_id}`;
    }
    return t('generalDefault') || 'General Default (all professionals)';
  };

  return (
    <div className="session-price-manager">
      <div className="manager-header">
        <h3>{t('sessionPrices') || 'Session Prices'}</h3>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="button-primary"
          >
            {t('addPrice') || 'Add New Price'}
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="price-form">
          <h4>{editingId !== null ? (t('editPrice') || 'Edit Price') : (t('addPrice') || 'Add New Price')}</h4>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">
                {t('priceName') || 'Name'} <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.Name}
                onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                placeholder="e.g., Single Session, 10-Pack"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="numSessions">
                {t('numSessions') || 'Number of Sessions'} <span className="required">*</span>
              </label>
              <input
                type="number"
                id="numSessions"
                value={formData.NumSessions}
                onChange={(e) => setFormData({ ...formData, NumSessions: parseInt(e.target.value) || 1 })}
                min="1"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="price">
                {t('price') || 'Price'} <span className="required">*</span>
              </label>
              <input
                type="text"
                id="price"
                value={formData.Price}
                onChange={(e) => setFormData({ ...formData, Price: e.target.value })}
                placeholder="100000"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="currency">
                {t('currency') || 'Currency'} <span className="required">*</span>
              </label>
              <select
                id="currency"
                value={formData.Currency}
                onChange={(e) => setFormData({ ...formData, Currency: e.target.value })}
                required
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="COP">COP (Colombian Pesos)</option>
                <option value="MXN">MXN (Mexican Pesos)</option>
                <option value="ARS">ARS (Argentine Pesos)</option>
                <option value="Pesos">Pesos</option>
                <option value="ColombianPesos">Colombian Pesos</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">
              {t('description') || 'Description'}
            </label>
            <textarea
              id="description"
              value={formData.Descriptions}
              onChange={(e) => setFormData({ ...formData, Descriptions: e.target.value })}
              rows={3}
              placeholder="Brief description of this pricing option"
            />
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
              {t('priceScope') || 'Price Scope'}: {t('priceScopeHelp') || 'Optionally assign this price to a specific professional. Leave blank to use as the default price for all professionals.'}
            </p>
            <div className="form-group">
              <label htmlFor="professional_id">
                {t('professional') || 'Professional'} ({t('optional') || 'Optional'})
              </label>
              <select
                id="professional_id"
                value={formData.professional_id || ''}
                onChange={(e) => setFormData({ ...formData, professional_id: e.target.value || null })}
              >
                <option value="">{t('generalDefault') || 'Default — all professionals'}</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name_en}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="button-primary">
              {editingId !== null ? (t('update') || 'Update') : (t('create') || 'Create')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="button-secondary"
            >
              {t('cancel') || 'Cancel'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">{t('loading') || 'Loading...'}</div>
      ) : (
        <div className="prices-list">
          {prices.length === 0 ? (
            <p className="no-data">{t('noPrices') || 'No session prices configured yet.'}</p>
          ) : (
            <div className="prices-grid">
              {prices.map((price) => (
                <div key={price.id} className="price-card">
                  <div className="price-header">
                    <h4>{price.Name}</h4>
                    <div className="price-actions">
                      <button
                        onClick={() => handleEdit(price)}
                        className="icon-button"
                        title={t('edit') || 'Edit'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(price.id)}
                        className="icon-button danger"
                        title={t('delete') || 'Delete'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="price-details">
                    <div className="price-amount">
                      <span className="amount">{price.Price}</span>
                      <span className="currency">{price.Currency}</span>
                    </div>
                    <div className="price-info">
                      <span className="sessions-count">
                        {price.NumSessions} {price.NumSessions === 1 ? 'Session' : 'Sessions'}
                      </span>
                      {price.Descriptions && (
                        <p className="description">{price.Descriptions}</p>
                      )}
                    </div>
                  </div>

                  <div className="price-meta">
                    <small style={{ display: 'block', marginBottom: '0.25rem' }}>
                      <strong>{t('scope') || 'Scope'}:</strong> {getPriceScope(price)}
                    </small>
                    <small>
                      {t('created') || 'Created'}: {new Date(price.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
