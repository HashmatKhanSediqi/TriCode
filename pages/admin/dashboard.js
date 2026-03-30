import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { MODELS } from "../../lib/chatModels";
import { csrfFetch } from "../../lib/csrf-client";
import { verifyToken } from "../../lib/auth";

const DEFAULT_FORM = {
  name: "",
  email: "",
  password: "",
  role: "user",
  dailyLimit: 50,
  monthlyLimit: 500,
  creditBalance: 100,
  unlimitedCredits: false,
};

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function getErrorMessage(data, fallback) {
  return data?.message || fallback;
}

function toFiniteNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const FEATURE_LABELS = {
  userLogin: "User Login",
  userSignup: "User Signup",
  chat: "Chat",
  imageGeneration: "Image Generation",
  videoGeneration: "Video Generation",
  packaging: "Packaging",
  webSearch: "Web Search",
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {user}
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [systemCfg, setSystemCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("users");
  const [sysSaving, setSysSaving] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadUsers = useCallback(async (searchQuery = "") => {
    setLoading(true);
    setDashboardError("");

    try {
      const trimmed = searchQuery.trim();
      const url = trimmed
        ? `/api/admin/users?q=${encodeURIComponent(trimmed)}`
        : "/api/admin/users";
      const res = await fetch(url);
      const data = await readJsonSafe(res);

      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Failed to load users"));
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setUsers([]);
      setDashboardError(error?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    const res = await fetch("/api/admin/system");
    const data = await readJsonSafe(res);

    if (!res.ok) {
      throw new Error(getErrorMessage(data, "Failed to load system config"));
    }

    setSystemCfg(data?.config || null);
    setStats(data?.stats || null);
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await fetch("/api/admin/logs?limit=100");
    const data = await readJsonSafe(res);

    if (!res.ok) {
      throw new Error(getErrorMessage(data, "Failed to load logs"));
    }

    setLogs(Array.isArray(data) ? data : []);
  }, []);

  const loadAll = useCallback(
    async (searchQuery = "") => {
      setDashboardError("");
      try {
        await Promise.all([loadUsers(searchQuery), loadSystem(), loadLogs()]);
      } catch (error) {
        console.error("Failed to load admin dashboard data:", error);
        setDashboardError(
          error?.message || "Some dashboard data failed to load.",
        );
      }
    },
    [loadUsers, loadSystem, loadLogs],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const res = await fetch("/api/admin/session");
        if (!res.ok) {
          if (!cancelled) router.push("/admin");
          return;
        }

        const session = await res.json();
        if (!session?.authenticated) {
          if (!cancelled) router.push("/admin");
          return;
        }

        await loadAll();
      } catch {
        if (!cancelled) router.push("/admin");
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, loadAll]);

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM });
    setErr("");
    setModal("create");
  };

  const openEdit = (u) => {
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      dailyLimit: u.dailyLimit,
      monthlyLimit: u.monthlyLimit,
      creditBalance: u.creditBalance ?? 100,
      unlimitedCredits: Boolean(u.unlimitedCredits),
    });
    setErr("");
    setModal(u);
  };

  const save = async () => {
    setErr("");
    setSaving(true);

    try {
      const isEdit = modal !== "create";
      const body = isEdit ? { ...form, id: modal?._id } : form;

      const res = await csrfFetch("/api/admin/users", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await readJsonSafe(res);
      if (!res.ok) {
        setErr(getErrorMessage(data, "Save failed"));
        return;
      }

      setModal(null);
      await loadAll(query);
    } catch {
      setErr("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (id, name) => {
    if (!confirm(`Delete user "${name}"?`)) return;

    setDashboardError("");

    try {
      const res = await csrfFetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await readJsonSafe(res);

      if (!res.ok) {
        setDashboardError(getErrorMessage(data, "Failed to delete user"));
        return;
      }

      await Promise.all([loadUsers(query), loadLogs()]);
    } catch {
      setDashboardError("Failed to delete user");
    }
  };

  const updateSystem = async (patch) => {
    if (!systemCfg) return;

    setSysSaving(true);
    setDashboardError("");

    try {
      const safePatch = {
        ...patch,
        ...(patch.features && {
          features: { ...(systemCfg.features || {}), ...patch.features },
        }),
        ...(patch.media && {
          media: { ...(systemCfg.media || {}), ...patch.media },
        }),
        ...(patch.availableModels && {
          availableModels: {
            ...(systemCfg.availableModels || {}),
            ...patch.availableModels,
          },
        }),
      };

      const res = await csrfFetch("/api/admin/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safePatch),
      });

      const data = await readJsonSafe(res);
      if (!res.ok) {
        setDashboardError(getErrorMessage(data, "Failed to update system"));
        return;
      }

      setSystemCfg((prev) => data?.config || prev);
      await loadLogs();
    } catch {
      setDashboardError("Failed to update system");
    } finally {
      setSysSaving(false);
    }
  };

  const F = ({ label, k, type = "text", opts = null }) => (
    <div>
      <label
        style={{
          fontSize: "12px",
          color: "var(--text-2)",
          fontWeight: 500,
          display: "block",
          marginBottom: "5px",
        }}
      >
        {label}
      </label>
      {opts ? (
        <select
          className="field"
          value={form[k]}
          onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
        >
          {opts.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className="field"
          value={type === "checkbox" ? undefined : (form[k] ?? "")}
          checked={type === "checkbox" ? Boolean(form[k]) : undefined}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              [k]:
                type === "number"
                  ? (e.target.value === "" ? "" : Number(e.target.value))
                  : type === "checkbox"
                    ? e.target.checked
                    : e.target.value,
            }))
          }
          style={{ direction: "ltr", textAlign: "left" }}
        />
      )}
    </div>
  );

  const totalCredits = users.reduce(
    (sum, u) => sum + toFiniteNumber(u?.creditBalance),
    0,
  );

  return (
    <div
      style={{
        minHeight: "var(--app-height)",
        background: "var(--bg-base)",
        padding: "0",
        overflowY: "auto",
      }}
      dir="rtl"
    >
      <div
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: isMobile ? "12px var(--page-pad)" : "0 var(--page-pad)",
          height: isMobile ? "auto" : "60px",
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? "10px" : "12px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src="/tricode-mark.svg"
            alt="TriCode AI"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "9px",
              background: "#fff",
              padding: "2px",
            }}
          />
          <span style={{ fontWeight: 700, fontSize: "15px" }}>
            TriCode AI Admin Dashboard
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "flex-start" : "flex-end",
          }}
        >
          <button
            className="btn-ghost"
            onClick={() => router.push("/chat")}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            Back to Chat
          </button>
          <button
            className="btn-primary"
            onClick={openCreate}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            + New User
          </button>
        </div>
      </div>

      <div
        style={{
          padding: `${isMobile ? "14px" : "18px"} var(--page-pad) 0`,
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        {["users", "system", "logs"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              border: "1px solid",
              borderColor:
                activeTab === tab ? "var(--accent)" : "var(--border-default)",
              background:
                activeTab === tab ? "var(--accent-muted)" : "var(--bg-surface)",
              color: activeTab === tab ? "var(--accent)" : "var(--text-2)",
              borderRadius: "999px",
              padding: "5px 12px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: `${isMobile ? "10px" : "12px"} var(--page-pad) 0`,
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        {[
          {
            label: "Users",
            val: stats?.totalUsers ?? users.length,
            color: "var(--accent)",
          },
          {
            label: "Admins",
            val: users.filter((u) => u.role === "admin").length,
            color: "var(--warn)",
          },
          {
            label: "Conversations",
            val: stats?.totalConversations ?? "-",
            color: "var(--text-1)",
          },
          { label: "Credits", val: totalCredits, color: "var(--green)" },
          {
            label: "Calls Today",
            val: stats?.todayCalls ?? "-",
            color: "var(--text-1)",
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              padding: "14px 18px",
              minWidth: "130px",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 700, color: s.color }}>
              {s.val}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-2)",
                marginTop: "3px",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {dashboardError && (
        <div
          style={{
            padding: "10px var(--page-pad) 0",
            color: "var(--danger)",
            fontSize: "13px",
          }}
        >
          {dashboardError}
        </div>
      )}

      {activeTab === "users" && (
        <div style={{ padding: `${isMobile ? "14px" : "20px"} var(--page-pad)` }}>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: isMobile ? "14px" : "16px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px" }}>Users</span>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                <input
                  className="field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadUsers(query);
                  }}
                  placeholder="Search name/email"
                  style={{
                    width: isMobile ? "100%" : "220px",
                    flex: isMobile ? "1 1 100%" : "0 0 auto",
                    direction: "ltr",
                    textAlign: "left",
                  }}
                />
                <button
                  className="btn-ghost"
                  onClick={() => loadUsers(query)}
                  style={{ fontSize: "12px", padding: "6px 12px" }}
                >
                  Search
                </button>
              </div>
            </div>

            {loading ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--text-3)",
                }}
              >
                Loading...
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}
                >
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      {[
                        "Name",
                        "Email",
                        "Role",
                        "Verified",
                        "Daily",
                        "Monthly",
                        "Credits",
                        "Used Today",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            fontWeight: 600,
                            color: "var(--text-2)",
                            borderBottom: "1px solid var(--border-subtle)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u._id}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <td style={{ padding: "11px 14px", fontWeight: 500 }}>
                          {u.name}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            color: "var(--text-2)",
                            direction: "ltr",
                            textAlign: "left",
                          }}
                        >
                          {u.email}
                        </td>
                        <td style={{ padding: "11px 14px" }}>{u.role}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {u.isVerified ? "yes" : "no"}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          {u.unlimitedCredits ? "Unlimited" : u.dailyLimit}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          {u.unlimitedCredits ? "Unlimited" : u.monthlyLimit}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          {u.unlimitedCredits
                            ? "Unlimited"
                            : (u.creditBalance ?? 0)}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          {u.unlimitedCredits
                            ? "Unlimited"
                            : `${u.usageToday}/${u.dailyLimit}`}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => openEdit(u)}
                              style={{
                                background: "var(--accent-muted)",
                                border: "none",
                                borderRadius: "6px",
                                padding: "4px 10px",
                                fontSize: "11px",
                                color: "var(--accent)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteUser(u._id, u.name)}
                              style={{
                                background: "rgba(248,113,113,.1)",
                                border: "none",
                                borderRadius: "6px",
                                padding: "4px 10px",
                                fontSize: "11px",
                                color: "var(--danger)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "system" && systemCfg && (
        <div
          style={{
            padding: `${isMobile ? "14px" : "20px"} var(--page-pad)`,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
            gap: "14px",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "16px",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "12px" }}>
              Feature Access
            </div>
            {Object.entries(systemCfg.features || {}).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: "13px" }}>
                  {FEATURE_LABELS[k] || k}
                </span>
                <button
                  disabled={sysSaving}
                  onClick={() =>
                    updateSystem({
                      features: { ...systemCfg.features, [k]: !v },
                    })
                  }
                  style={{
                    border: "1px solid var(--border-default)",
                    background: v ? "var(--green-muted)" : "transparent",
                    color: v ? "var(--green)" : "var(--text-3)",
                    borderRadius: "999px",
                    padding: "2px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  {v ? "ON" : "OFF"}
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "16px",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "12px" }}>
              Model Availability
            </div>
            <div style={{ maxHeight: "420px", overflowY: "auto" }}>
              {Object.entries(MODELS).map(([k, info]) => {
                const enabled = systemCfg.availableModels?.[k] !== false;
                return (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 0",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span style={{ fontSize: "12px" }}>{info.name}</span>
                    <button
                      disabled={sysSaving}
                      onClick={() =>
                        updateSystem({
                          availableModels: {
                            ...systemCfg.availableModels,
                            [k]: !enabled,
                          },
                        })
                      }
                      style={{
                        border: "1px solid var(--border-default)",
                        background: enabled ? "var(--green-muted)" : "transparent",
                        color: enabled ? "var(--green)" : "var(--text-3)",
                        borderRadius: "999px",
                        padding: "1px 9px",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div style={{ padding: `${isMobile ? "14px" : "20px"} var(--page-pad)` }}>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span style={{ fontWeight: 600 }}>System Logs</span>
              <button
                className="btn-ghost"
                onClick={loadLogs}
                style={{ fontSize: "12px", padding: "4px 10px" }}
              >
                Refresh
              </button>
            </div>
            <div style={{ maxHeight: "520px", overflowY: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr style={{ background: "var(--bg-elevated)" }}>
                    {["Time", "Type", "Model", "Status", "Preview"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr
                      key={l._id}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td
                        style={{
                          padding: "8px 10px",
                          direction: "ltr",
                          textAlign: "left",
                        }}
                      >
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 10px" }}>{l.type}</td>
                      <td
                        style={{
                          padding: "8px 10px",
                          direction: "ltr",
                          textAlign: "left",
                        }}
                      >
                        {l.modelKey || l.modelId || "-"}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          color:
                            l.status === "ok"
                              ? "var(--green)"
                              : "var(--danger)",
                        }}
                      >
                        {l.status}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {l.promptPreview || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.7)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "var(--page-pad)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="scale-in"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "18px",
              padding: isMobile ? "20px" : "28px",
              width: "100%",
              maxWidth: isMobile ? "100%" : "460px",
              boxShadow: "var(--sh3)",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "18px",
              }}
            >
              {modal === "create" ? "New User" : "Edit User"}
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "11px" }}
            >
              <F label="Name" k="name" />
              <F label="Email" k="email" type="email" />
              <F
                label={
                  modal === "create" ? "Password" : "New Password (optional)"
                }
                k="password"
                type="password"
              />
              <F
                label="Role"
                k="role"
                opts={[
                  { v: "user", l: "user" },
                  { v: "admin", l: "admin" },
                ]}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "12px",
                }}
              >
                <F label="Daily Limit" k="dailyLimit" type="number" />
                <F label="Monthly Limit" k="monthlyLimit" type="number" />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "12px",
                }}
              >
                <F label="Credits" k="creditBalance" type="number" />
                <F
                  label="Unlimited Credits"
                  k="unlimitedCredits"
                  type="checkbox"
                />
              </div>
              {err && (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: "13px",
                    textAlign: "center",
                  }}
                >
                  {err}
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  className="btn-primary"
                  onClick={save}
                  disabled={saving}
                  style={{ flex: 1, padding: "11px", borderRadius: "10px" }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setModal(null)}
                  style={{ flex: 1, padding: "11px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps({ req }) {
  const token = req.cookies?.admin_token || "";
  const payload = verifyToken(token);
  if (
    !payload ||
    payload.scope !== "admin" ||
    payload.role !== "admin" ||
    payload.stage ||
    !payload.jti
  ) {
    return {
      redirect: {
        destination: "/admin",
        permanent: false,
      },
    };
  }
  return { props: {} };
}
