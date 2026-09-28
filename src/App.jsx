import { useEffect, useMemo, useState } from 'react'
import { hourKey, msUntilNextHour, pickKicker, supabase } from './lib/supabase'

export default function App() {
  const [view, setView] = useState('home')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pieces, setPieces] = useState([])
  const [mine, setMine] = useState([])
  const [hour, setHour] = useState(null)
  const [open, setOpen] = useState(null)
  const [tick, setTick] = useState(Date.now())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', title: '', body: '', is_public: true, handle: '', display_name: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadPublic()
    ensureHour()
  }, [tick - (tick % 60000)])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setMine([])
      return
    }
    ensureProfile(session.user)
    loadMine(session.user.id)
  }, [session])

  async function ensureProfile(user) {
    const { data } = await supabase.from('ashline_profiles').select('*').eq('id', user.id).maybeSingle()
    if (data) {
      setProfile(data)
      setForm((f) => ({ ...f, handle: data.handle, display_name: data.display_name }))
      return
    }
    const handle = (user.email?.split('@')[0] || 'member') + user.id.slice(0, 4)
    const row = { id: user.id, handle, display_name: user.email?.split('@')[0] || 'Member' }
    const { data: created } = await supabase.from('ashline_profiles').upsert(row).select().single()
    setProfile(created || row)
  }

  async function loadPublic() {
    const { data } = await supabase
      .from('ashline_pieces')
      .select('id,title,body,created_at,author_id,ashline_profiles(handle,display_name)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(36)
    setPieces(data || [])
  }

  async function loadMine(id) {
    const { data } = await supabase
      .from('ashline_pieces')
      .select('*')
      .eq('author_id', id)
      .order('created_at', { ascending: false })
    setMine(data || [])
  }

  async function ensureHour() {
    const key = hourKey()
    const { data: existing } = await supabase.from('ashline_hours').select('*, ashline_pieces(id,title,body,author_id)').eq('hour_key', key).maybeSingle()
    if (existing) {
      setHour(existing)
      return
    }
    const { data: publics } = await supabase
      .from('ashline_pieces')
      .select('id,title,body')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(24)
    const pick = publics && publics.length ? publics[Math.floor(Math.random() * publics.length)] : null
    const row = {
      hour_key: key,
      piece_id: pick?.id || null,
      kicker: pickKicker(),
      note: pick
        ? pick.body.slice(0, 280)
        : 'The desk is still empty this hour. Write something and mark it public — the next turn may carry it.',
    }
    const { data: saved } = await supabase.from('ashline_hours').insert(row).select('*, ashline_pieces(id,title,body,author_id)').maybeSingle()
    setHour(saved || { ...row, ashline_pieces: pick })
  }

  const remain = useMemo(() => {
    const ms = msUntilNextHour(new Date(tick))
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [tick])

  async function signUp() {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signUp({ email: form.email.trim(), password: form.password })
    setBusy(false)
    setMsg(error ? error.message : 'Account made. If email confirm is on, check your inbox, then sign in.')
  }

  async function signIn() {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
    setBusy(false)
    if (error) setMsg(error.message)
    else setView('desk')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setView('home')
  }

  async function saveProfile() {
    if (!session?.user) return
    const { error } = await supabase.from('ashline_profiles').update({
      handle: form.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || profile.handle,
      display_name: form.display_name.trim().slice(0, 48) || profile.display_name,
    }).eq('id', session.user.id)
    setMsg(error ? error.message : 'Name saved.')
    ensureProfile(session.user)
  }

  async function savePiece() {
    if (!session?.user || !profile) {
      setView('gate')
      return
    }
    if (!form.title.trim() || !form.body.trim()) {
      setMsg('Give it a title and a body.')
      return
    }
    setBusy(true); setMsg('')
    const { error } = await supabase.from('ashline_pieces').insert({
      author_id: profile.id,
      title: form.title.trim().slice(0, 120),
      body: form.body.trim().slice(0, 12000),
      is_public: !!form.is_public,
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setForm((f) => ({ ...f, title: '', body: '' }))
    setMsg('Saved to the desk.')
    loadMine(session.user.id)
    loadPublic()
  }

  async function togglePublic(piece) {
    await supabase.from('ashline_pieces').update({ is_public: !piece.is_public, updated_at: new Date().toISOString() }).eq('id', piece.id)
    loadMine(session.user.id)
    loadPublic()
  }

  function openPiece(p) {
    setOpen(p)
    setView('piece')
  }

  const featured = hour?.ashline_pieces

  return (
    <div className="shell">
      <header className="topbar">
        <a className="mark" href="#home" onClick={(e) => { e.preventDefault(); setView('home') }}>
          <b>Ashline</b>
          <span>hourly press</span>
        </a>
        <nav className="nav">
          <button onClick={() => setView('home')}>This hour</button>
          <button onClick={() => setView('board')}>Public</button>
          <button onClick={() => setView(session ? 'desk' : 'gate')}>{session ? 'Desk' : 'Sign in'}</button>
          {session && <button className="ghost" onClick={signOut}>Leave</button>}
        </nav>
      </header>

      {view === 'home' && (
        <>
          <section className="hero">
            <div>
              <p className="kicker">A living press · UTC</p>
              <h1>The hour turns.<br />Something stays.</h1>
              <p className="lede">Write privately on the desk. Mark a piece public and it can be featured when the clock folds. Nothing here is meant to look generated. It is meant to look kept.</p>
            </div>
            <article className="hour-card">
              <div className="kicker">{hour?.kicker || 'Setting the type'}</div>
              <h2>{featured?.title || 'Empty press'}</h2>
              <p>{(featured?.body || hour?.note || 'Waiting on the first public page.').slice(0, 320)}</p>
              <div className="meta">
                <span className="clock">Next turn {remain}</span>
                <span>{hour?.hour_key || hourKey()}</span>
              </div>
            </article>
          </section>
          <section className="grid">
            {pieces.slice(0, 6).map((p, i) => (
              <article key={p.id} className="card" style={{ animationDelay: `${i * 60}ms` }} onClick={() => openPiece(p)}>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.body.slice(0, 140)}</p>
                </div>
                <div className="meta">
                  <span>{p.ashline_profiles?.display_name || 'Anonymous desk'}</span>
                  <span>{new Date(p.created_at).toUTCString().slice(0, 17)}</span>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {view === 'board' && (
        <section>
          <div className="hero" style={{ paddingBottom: 8 }}>
            <div>
              <p className="kicker">Open shelves</p>
              <h1>Public pages</h1>
              <p className="lede">Only pieces marked public appear here. Private drafts stay on their author’s desk.</p>
            </div>
          </div>
          <div className="grid">
            {pieces.map((p, i) => (
              <article key={p.id} className="card" style={{ animationDelay: `${i * 40}ms` }} onClick={() => openPiece(p)}>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.body.slice(0, 160)}</p>
                </div>
                <div className="meta">
                  <span>@{p.ashline_profiles?.handle || 'desk'}</span>
                  <span>public</span>
                </div>
              </article>
            ))}
            {!pieces.length && <p className="lede">No public pages yet. Be the first to leave one.</p>}
          </div>
        </section>
      )}

      {view === 'gate' && (
        <section className="panel">
          <p className="kicker">Membership</p>
          <h2>Sign in to the desk</h2>
          <p className="lede">Email and password. Your drafts persist. Public pages are the only ones the room can see.</p>
          <label>Email</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
          <div className="row">
            <button className="ghost" disabled={busy} onClick={signUp}>Create account</button>
            <button className="solid" disabled={busy} onClick={signIn}>Enter</button>
          </div>
          {msg && <p className={msg.includes('made') ? 'ok' : 'err'}>{msg}</p>}
        </section>
      )}

      {view === 'desk' && session && (
        <section className="panel">
          <p className="kicker">Your desk</p>
          <h2>{profile?.display_name || 'Unnamed'}</h2>
          <label>Display name</label>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <label>Handle</label>
          <input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          <div className="row"><button className="ghost" onClick={saveProfile}>Save name</button></div>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0' }} />
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label>Body</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Leave it on the page." />
          <label className="check">
            <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} />
            Mark public — it can appear on the board and in the hourly feature
          </label>
          <div className="row">
            <span className="ok">{msg}</span>
            <button className="solid" disabled={busy} onClick={savePiece}>Save piece</button>
          </div>
          <div className="grid" style={{ paddingTop: 28 }}>
            {mine.map((p) => (
              <article key={p.id} className="card" onClick={() => openPiece(p)}>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.body.slice(0, 120)}</p>
                </div>
                <div className="meta">
                  <span>{p.is_public ? 'public' : 'private'}</span>
                  <button className="ghost" onClick={(e) => { e.stopPropagation(); togglePublic(p) }}>
                    {p.is_public ? 'Make private' : 'Make public'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === 'piece' && open && (
        <article className="piece">
          <button className="ghost" onClick={() => setView('board')}>← shelves</button>
          <p className="kicker">{open.is_public === false ? 'Private draft' : 'Public page'}</p>
          <h1>{open.title}</h1>
          <p>{open.body}</p>
          <div className="meta">
            <span>{open.ashline_profiles?.display_name || profile?.display_name || ''}</span>
            <span>{open.created_at ? new Date(open.created_at).toUTCString() : ''}</span>
          </div>
        </article>
      )}
    </div>
  )
}
