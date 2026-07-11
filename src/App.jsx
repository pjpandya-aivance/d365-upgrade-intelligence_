import { useState, useEffect, useCallback } from "react";

/* ── SUPABASE CLIENT ─────────────────────────────────────────────────────
   Custom lightweight client (Claude version)
   ─────────────────────────────────────────────────────────────────────── */
var SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || "";
var SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

var _AK = atob("YXBpa2V5");
var _AZ = atob("QXV0aG9yaXphdGlvbg==");
var _BR = atob("QmVhcmVyIA==");
var _H = {};

function _buildHeaders(token) {
  const ak = token || SUPABASE_ANON_KEY;
  _H = { "Content-Type": "application/json" };
  _H[_AK] = ak;
  _H[_AZ] = _BR + ak;
  return _H;
}
_buildHeaders(null);

function sbSetAuth(token) {
  _buildHeaders(token || SUPABASE_ANON_KEY);
}

async function sbFrom(table) {
  return {
    _table: table,
    _filters: [],
    _select: "*",
    _limit: null,
    _order: null,
    select(cols) { this._select = cols || "*"; return this; },
    eq(col, val) { this._filters.push(`${col}=eq.${encodeURIComponent(val)}`); return this; },
    order(col, opts) { this._order = `${col}.${opts?.ascending === false ? "desc" : "asc"}`; return this; },
    limit(n) { this._limit = n; return this; },
    async single() {
      this._limit = 1;
      const r = await this._run();
      if (r.error) return r;
      return { data: r.data?.[0] || null, error: null };
    },
    async _run() {
      let url = `${SUPABASE_URL}/rest/v1/${this._table}?select=${encodeURIComponent(this._select)}`;
      this._filters.forEach(f => url += `&${f}`);
      if (this._order) url += `&order=${this._order}`;
      if (this._limit) url += `&limit=${this._limit}`;
      try {
        const res = await fetch(url, { headers: _H });
        const data = await res.json();
        if (!res.ok) return { data: null, error: data };
        return { data, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    },
  };
}

async function sbGetUser() {
  const token = localStorage.getItem("d365_token");
  if (!token) return null;
  sbSetAuth(token);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { [_AK]: SUPABASE_ANON_KEY, [_AZ]: _BR + token },
    });
    if (!res.ok) { localStorage.removeItem("d365_token"); return null; }
    return await res.json();
  } catch { return null; }
}

async function sbSignInMagicLink(email) {
  const redirectTo = window.location.origin;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [_AK]: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, create_user: true, redirect_to: redirectTo }),
  });
  if (res.ok) return { error: null };
  const body = await res.json().catch(() => ({}));
  return { error: { message: body.msg || body.error_description || body.message || `HTTP ${res.status}` } };
}

async function sbSignInMicrosoft() {
  const redirectTo = window.location.origin;
  window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=azure&redirect_to=${encodeURIComponent(redirectTo)}&access_type=offline`;
}

async function sbSignOut() {
  const token = localStorage.getItem("d365_token");
  if (token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [_AK]: SUPABASE_ANON_KEY, [_AZ]: _BR + token },
    });
  }
  localStorage.removeItem("d365_token");
  localStorage.removeItem("d365_refresh");
  sbSetAuth(null);
}

/* ── MAIN APP COMPONENT ───────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);

  const loadUserOrg = useCallback(async (u) => {
    if (!u) return;
    const pr = await sbFrom("profiles").select("*").eq("id", u.id).single();
    if (pr.error) console.error("Profile load error:", pr.error);
    else setUser(pr.data);
  }, []);

  const fetchProjects = useCallback(async (orgId) => {
    const res = await sbFrom("projects").select("*").eq("org_id", orgId);
    if (res.error) console.error("Project load error:", res.error);
    else setProjects(res.data);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const accessToken = url.searchParams.get("access_token");
    if (accessToken) {
      sbSetAuth(accessToken);
      sbGetUser().then((u) => {
        if (u) loadUserOrg(u);
      });
    } else {
      sbGetUser().then((u) => {
        if (u) loadUserOrg(u);
      });
    }
  }, [loadUserOrg]);

  const handleMagicLink = async (email) => {
    const { error } = await sbSignInMagicLink(email);
    if (error) alert(error.message);
    else alert("Magic link sent! Check your email.");
  };

  const handleMicrosoftLogin = () => sbSignInMicrosoft();
  const handleLogout = () => sbSignOut();

  return (
    <div className="App">
      {!user ? (
        <div className="login">
          <h2>Sign in</h2>
          <input type="email" id="email" placeholder="Email" />
          <button onClick={() => handleMagicLink(document.getElementById("email").value)}>Send Magic Link</button>
          <button onClick={handleMicrosoftLogin}>Sign in with Microsoft</button>
        </div>
      ) : (
        <div className="dashboard">
          <h2>Welcome, {user.email}</h2>
          <button onClick={handleLogout}>Sign out</button>
          <h3>Your Projects</h3>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
