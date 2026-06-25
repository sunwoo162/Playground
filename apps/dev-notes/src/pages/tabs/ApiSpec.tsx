import { useState } from 'react';
import type { ApiSpec as ApiSpecType } from '../../types';

interface Props {
  items: ApiSpecType[];
  onChange: (items: ApiSpecType[]) => void;
}

type KVRow = { key: string; value: string; description: string };

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const methodColor: Record<string, string> = {
  GET: '#2ed573', POST: '#70a1ff', PUT: '#ffa502',
  PATCH: '#ff6b81', DELETE: '#ff4757',
};

function emptyKV(): KVRow { return { key: '', value: '', description: '' }; }

function KVEditor({
  label, rows, onChange,
}: {
  label: string;
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
}) {
  const update = (i: number, field: keyof KVRow, val: string) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, emptyKV()]);

  return (
    <div className="kv-editor">
      <div className="kv-header-row">
        <label>{label}</label>
        <button type="button" className="btn-text" onClick={add}>+ 추가</button>
      </div>
      {rows.length === 0 && (
        <p className="kv-empty">없음 — 추가 버튼으로 입력하세요.</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="kv-row">
          <input
            className="kv-input"
            placeholder="Key"
            value={row.key}
            onChange={(e) => update(i, 'key', e.target.value)}
          />
          <input
            className="kv-input"
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(i, 'value', e.target.value)}
          />
          <input
            className="kv-input kv-desc"
            placeholder="설명 (선택)"
            value={row.description}
            onChange={(e) => update(i, 'description', e.target.value)}
          />
          <button type="button" className="btn-icon-delete" onClick={() => remove(i)} aria-label="삭제">✕</button>
        </div>
      ))}
    </div>
  );
}

function KVReadonly({ label, rows }: { label: string; rows: { key: string; value: string; description?: string }[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="kv-readonly">
      <span className="code-label">{label}</span>
      <table className="kv-table">
        <thead>
          <tr><th>Key</th><th>Value</th><th>설명</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><code>{r.key}</code></td>
              <td><code>{r.value}</code></td>
              <td>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiSpec({ items, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [method, setMethod] = useState<ApiSpecType['method']>('GET');
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [headers, setHeaders] = useState<KVRow[]>([]);
  const [queryParams, setQueryParams] = useState<KVRow[]>([]);
  const [requestBody, setRequestBody] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setMethod('GET'); setEndpoint(''); setDescription('');
    setHeaders([]); setQueryParams([]);
    setRequestBody(''); setResponseBody('');
    setEditId(null); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint.trim()) return;

    const data: ApiSpecType = {
      id: editId ?? crypto.randomUUID(),
      method,
      endpoint: endpoint.trim(),
      description: description.trim(),
      headers: headers.filter(r => r.key.trim()),
      queryParams: queryParams.filter(r => r.key.trim()),
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
    setEditId(item.id);
    setMethod(item.method);
    setEndpoint(item.endpoint);
    setDescription(item.description);
    setHeaders(item.headers?.map(h => ({ ...h, description: h.description ?? '' })) ?? []);
    setQueryParams(item.queryParams?.map(q => ({ ...q, description: q.description ?? '' })) ?? []);
    setRequestBody(item.requestBody ?? '');
    setResponseBody(item.responseBody ?? '');
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
              <input
                type="text" value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/users/:id" autoFocus required
              />
            </div>
          </div>
          <div className="form-row">
            <label>설명</label>
            <input
              type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 API가 하는 일"
            />
          </div>

          <KVEditor label="Headers" rows={headers} onChange={setHeaders} />
          <KVEditor label="Query Parameters" rows={queryParams} onChange={setQueryParams} />

          <div className="form-row">
            <label>Request Body</label>
            <textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              placeholder={'{\n  "name": "string"\n}'}
              rows={3} className="code-textarea"
            />
          </div>
          <div className="form-row">
            <label>Response Body</label>
            <textarea
              value={responseBody}
              onChange={(e) => setResponseBody(e.target.value)}
              placeholder={'{\n  "id": 1,\n  "name": "string"\n}'}
              rows={3} className="code-textarea"
            />
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
            <div
              className="api-item-header"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
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
                <KVReadonly label="Headers" rows={item.headers ?? []} />
                <KVReadonly label="Query Parameters" rows={item.queryParams ?? []} />
                {item.requestBody && (
                  <div className="code-block">
                    <span className="code-label">Request Body</span>
                    <pre>{item.requestBody}</pre>
                  </div>
                )}
                {item.responseBody && (
                  <div className="code-block">
                    <span className="code-label">Response Body</span>
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
