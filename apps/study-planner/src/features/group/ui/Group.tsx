import { useState, useEffect } from 'react';

interface GroupMember { userId: string; login: string; avatarUrl: string | null; }
interface StudyGroup {
  id: number; name: string; description: string;
  ownerId: string; isOwner: boolean; memberCount: number;
  members: GroupMember[];
}
interface InviteUser {
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  friendStatus?: string | null;
}
interface RankEntry {
  rank: number; userId: string; login: string; name: string;
  avatarUrl: string | null; totalMinutes: number; isMe: boolean;
}
interface GroupInvitation {
  memberId: number;
  groupName: string;
  groupDescription: string | null;
  ownerLogin: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
}

async function api(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtMin(min: number): string {
  if (min === 0) return '0분';
  const h = Math.floor(min / 60), m = min % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

export function Group() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [selected, setSelected] = useState<StudyGroup | null>(null);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'detail' | 'create'>('list');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [friends, setFriends] = useState<InviteUser[]>([]);
  const [recentUsers, setRecentUsers] = useState<InviteUser[]>([]);
  const [loadingInviteUsers, setLoadingInviteUsers] = useState(false);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);

  useEffect(() => { loadGroups(); }, []);

  const loadGroups = async () => {
    try {
      const [groupList, inviteList] = await Promise.all([
        api('/api/study/groups'),
        api('/api/study/groups/invitations'),
      ]);
      setGroups(groupList);
      setInvitations(inviteList);
    } catch {}
  };

  const loadInviteUsers = async () => {
    setLoadingInviteUsers(true);
    try {
      const [friendList, recentList] = await Promise.all([
        api('/api/friends'),
        api('/api/friends/recent'),
      ]);
      setFriends(friendList);
      setRecentUsers(recentList);
    } catch {
      setFriends([]);
      setRecentUsers([]);
    } finally {
      setLoadingInviteUsers(false);
    }
  };

  const loadRanking = async (groupId: number, p: string) => {
    setLoading(true);
    try { setRanking(await api(`/api/study/groups/${groupId}/ranking?period=${p}`)); }
    finally { setLoading(false); }
  };

  const handleSelectGroup = (g: StudyGroup) => {
    setSelected(g); setView('detail');
    loadRanking(g.id, period);
    if (g.isOwner) loadInviteUsers();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api('/api/study/groups', { method: 'POST', body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }) });
      setNewName(''); setNewDesc('');
      await loadGroups();
      setView('list');
    } catch (err) { alert('그룹 생성 실패'); }
  };

  const refreshSelectedGroup = (updatedGroups: StudyGroup[]) => {
    if (!selected) return;
    setSelected(updatedGroups.find(g => g.id === selected.id) ?? null);
  };

  const handleInvite = async (targetId = inviteId.trim()) => {
    if (!selected || !targetId) return;
    try {
      await api(`/api/study/groups/${selected.id}/invite/${targetId}`, { method: 'POST' });
      alert('초대 완료!');
      setInviteId('');
      const updatedGroups = await api('/api/study/groups');
      setGroups(updatedGroups);
      refreshSelectedGroup(updatedGroups);
      await loadInviteUsers();
    } catch { alert('초대 실패. GitHub ID를 확인해주세요.'); }
  };

  const handleLeave = async () => {
    if (!selected) return;
    if (!confirm(selected.isOwner ? '그룹을 삭제할까요?' : '그룹을 탈퇴할까요?')) return;
    try {
      await api(`/api/study/groups/${selected.id}/leave`, { method: 'DELETE' });
      setSelected(null); setView('list');
      await loadGroups();
    } catch { alert('실패'); }
  };

  const handlePeriodChange = (p: 'today' | 'week' | 'month') => {
    setPeriod(p);
    if (selected) loadRanking(selected.id, p);
  };

  const handleInvitation = async (memberId: number, action: 'accept' | 'reject') => {
    await api(`/api/study/groups/invitations/${memberId}/${action}`, { method: 'POST' });
    await loadGroups();
  };

  const medalEmoji = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}위`;
  const memberIds = selected ? new Set(selected.members.map(m => m.userId)) : new Set<string>();
  const friendCandidates = friends.filter(u => !memberIds.has(u.githubId));
  const recentCandidates = recentUsers.filter(u =>
    !memberIds.has(u.githubId) && !friendCandidates.some(f => f.githubId === u.githubId)
  );
  const renderInviteUser = (user: InviteUser, label?: string) => (
    <div key={user.githubId} className="invite-user-item">
      {user.avatarUrl && <img src={user.avatarUrl} alt={user.login} className="invite-avatar" />}
      <div className="invite-user-info">
        <span className="invite-user-name">{user.name || user.login}</span>
        <span className="invite-user-login">@{user.login}</span>
      </div>
      {label && <span className="invite-user-tag">{label}</span>}
      <button className="btn-primary btn-sm" onClick={() => handleInvite(user.githubId)}>추가</button>
    </div>
  );

  if (view === 'create') return (
    <div className="group-page">
      <div className="section-card">
        <h3 className="section-title">새 그룹 만들기</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div className="form-row">
            <label>그룹 이름 *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 알고리즘 스터디" required />
          </div>
          <div className="form-row">
            <label>설명</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="그룹 소개 (선택)" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">만들기</button>
            <button type="button" className="btn-ghost" onClick={() => setView('list')}>취소</button>
          </div>
        </form>
      </div>
    </div>
  );

  if (view === 'detail' && selected) return (
    <div className="group-page">
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 className="section-title">{selected.name}</h3>
            {selected.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{selected.description}</p>}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>멤버 {selected.memberCount}명</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => setView('list')}>← 목록</button>
            <button className="btn-ghost btn-sm" style={{ color: '#ff4757', borderColor: '#ff4757' }} onClick={handleLeave}>
              {selected.isOwner ? '삭제' : '탈퇴'}
            </button>
          </div>
        </div>

        {/* 멤버 목록 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {selected.members.map(m => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 20, padding: '4px 10px' }}>
              {m.avatarUrl && <img src={m.avatarUrl} alt={m.login} style={{ width: 22, height: 22, borderRadius: '50%' }} />}
              <span style={{ fontSize: '0.82rem' }}>@{m.login}</span>
            </div>
          ))}
        </div>

        {/* 초대 (소유자만) */}
        {selected.isOwner && (
          <div className="invite-panel">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={inviteId} onChange={e => setInviteId(e.target.value)} placeholder="초대할 GitHub ID" style={{ flex: 1, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.88rem' }} />
              <button className="btn-primary btn-sm" onClick={() => handleInvite()}>초대</button>
            </div>

            <div className="invite-users">
              <div className="invite-section">
                <p className="invite-section-title">친구</p>
                {loadingInviteUsers ? (
                  <p className="empty-text">불러오는 중...</p>
                ) : friendCandidates.length === 0 ? (
                  <p className="empty-text">추가할 친구가 없어요.</p>
                ) : (
                  friendCandidates.map(user => renderInviteUser(user, '친구'))
                )}
              </div>

              <div className="invite-section">
                <p className="invite-section-title">최근 가입 사용자</p>
                {loadingInviteUsers ? (
                  <p className="empty-text">불러오는 중...</p>
                ) : recentCandidates.length === 0 ? (
                  <p className="empty-text">추가할 사용자가 없어요.</p>
                ) : (
                  recentCandidates.map(user => renderInviteUser(user))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 랭킹 */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="section-title">🏆 대결 랭킹</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['today', 'week', 'month'] as const).map(p => (
              <button key={p} className={`btn-ghost btn-sm ${period === p ? 'active' : ''}`} style={period === p ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}} onClick={() => handlePeriodChange(p)}>
                {p === 'today' ? '오늘' : p === 'week' ? '이번 주' : '이번 달'}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="empty-text">로딩 중...</p> : ranking.length === 0 ? <p className="empty-text">공부 기록이 없어요.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ranking.map(r => (
              <div key={r.userId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: r.isMe ? 'rgba(112,161,255,0.08)' : 'var(--surface-2)',
                border: `1px solid ${r.isMe ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
              }}>
                <span style={{ fontSize: r.rank <= 3 ? '1.4rem' : '0.95rem', fontWeight: 700, minWidth: 36, textAlign: 'center' }}>{medalEmoji(r.rank)}</span>
                {r.avatarUrl && <img src={r.avatarUrl} alt={r.login} style={{ width: 36, height: 36, borderRadius: '50%' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{r.name || r.login} {r.isMe && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>(나)</span>}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>@{r.login}</div>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: r.rank === 1 ? '#ffd32a' : 'var(--text)' }}>{fmtMin(r.totalMinutes)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="group-page">
      <div className="section-header">
        <h3 className="section-title">내 그룹</h3>
        <button className="btn-primary btn-sm" onClick={() => setView('create')}>+ 그룹 만들기</button>
      </div>
      {invitations.length > 0 && (
        <div className="section-card invite-request-card">
          <h3 className="section-title">받은 그룹 초대</h3>
          <div className="invite-request-list">
            {invitations.map(inv => (
              <div key={inv.memberId} className="invite-request-item">
                {inv.ownerAvatarUrl && <img src={inv.ownerAvatarUrl} alt={inv.ownerLogin} className="invite-avatar" />}
                <div className="invite-user-info">
                  <span className="invite-user-name">{inv.groupName}</span>
                  <span className="invite-user-login">{inv.ownerName || inv.ownerLogin}님이 초대했어요.</span>
                </div>
                <button className="btn-primary btn-sm" onClick={() => handleInvitation(inv.memberId, 'accept')}>수락</button>
                <button className="btn-ghost btn-sm" onClick={() => handleInvitation(inv.memberId, 'reject')}>거절</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {groups.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: '2rem' }}>👥</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>아직 그룹이 없어요.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6 }}>그룹을 만들고 친구와 공부 시간을 대결해보세요!</p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setView('create')}>+ 그룹 만들기</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(g => (
            <div key={g.id} className="section-card" style={{ cursor: 'pointer' }} onClick={() => handleSelectGroup(g)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{g.name}</h4>
                  {g.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>{g.description}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>👥 {g.memberCount}명</span>
                  {g.isOwner && <span style={{ fontSize: '0.72rem', background: 'rgba(112,161,255,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 10 }}>소유자</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
