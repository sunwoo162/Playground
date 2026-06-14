import { useState } from 'react';
import type { ApiSpec as ApiSpecType } from '../../types';

interface Props {
  items: ApiSpecType[];
  onChange: (items: ApiSpecType[]) => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const methodColor: Record<string, string> = {
  GET: '#2ed573', POST: '#70a1ff', PUT: '#ffa502',
  PATCH: '#ff6b81', DELETE: '#ff4757',
};

export function ApiSpec({ items, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [method, setMethod] = useState<ApiSpecType['method']>('GET');
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [requestBody, setRequestBody] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setMethod('GET'); setEndpoint(''); setDescription('');
    setRequestBody(''); setResponseBody('');
    setEditId(null); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint.trim()) return;

    const data: ApiSpecType = {
      id: editId ?? crypto.randomUUID(),
      method, endpoint: endpoint.trim(),
      description: description.trim(),
      requestBody: requestBody.trim() || undefined,
      responseBody: responseBody.trim() || undefined,
    };

    if (editId) {
      onChange(items.map((i) => i.id === editId ? data : i));
    } else {
      onChange([...items, data]);
    }
    resetForm();
  };

  const startEdit = (item: ApiSpecType) => {
    setEditId(item.id); setMethod(item.method);
    setEndpoint(item.endpoint); setDescription(item.description);
    setRequestBody(item.requestBody ?? ''); setResponseBody(item.responseBody ?? '');
    setShowForm(true);
  };

  return (
    <div className="tab-content">
      <div className="tab-content-header">
        <h3 className="tab-section-title">API 명세서</h3>
        {!showForm && (
          <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ API 추가</button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="form-row-inline">
            <div className="form-row" style={{ flex: '0 0 120px' }}>
              <label>메서드</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as ApiSpecType['method'])}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>엔드포인트 *</label>
              <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/api/users" autoFocus required />
            </div>
          </div>
          <div className="form-row">
            <label>설명</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 API가 하는 일" />
          </div>
          <div className="form-row">
            <label>Request Body</label>
            <textarea value={requestBody} onChange={(e) => setRequestBody(e.target.value)} placeholder={'{\n  "name": "string"\n}'} rows={3} className="code-textarea" />
          </div>
          <div className="form-row">
            <label>Response Body</label>
            <textarea value={responseBody} onChange={(e) => setResponseBody(e.target.value)} placeholder={'{\n  "id": 1,\n  "name": "string"\n}'} rows={3} className="code-textarea" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-sm">{editId ? '수정' : '추가'}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>취소</button>
          </div>
        </form>
      )}

      {items.length === 0 && !showForm && (
        <div className="empty-state-sm">아직 API가 없어요. 추가해보세요.</div>
      )}

      <div className="api-list">
        {items.map((item) => (
          <div key={item.id} className="api-item">
            <div className="api-item-header" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
              <div className="api-main">
                <span className="method-badge" style={{ backgroundColor: methodColor[item.method] }}>
                  {item.method}
                </span>
                <span className="api-endpoint">{item.endpoint}</span>
                {item.description && <span className="api-desc-inline">— {item.description}</span>}
              </div>
              <span className="expand-icon">{expandedId === item.id ? '▲' : '▼'}</span>
            </div>

            {expandedId === item.id && (
              <div className="api-detail">
                {item.requestBody && (
                  <div className="code-block">
                    <span className="code-label">Request</span>
                    <pre>{item.requestBody}</pre>
                  </div>
                )}
                {item.responseBody && (
                  <div className="code-block">
                    <span className="code-label">Response</span>
                    <pre>{item.responseBody}</pre>
                  </div>
                )}
                <div className="item-actions">
                  <button className="btn-text" onClick={() => startEdit(item)}>수정</button>
                  <button className="btn-text danger" onClick={() => onChange(items.filter((i) => i.id !== item.id))}>삭제</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
