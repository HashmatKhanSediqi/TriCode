import { useEffect, useState } from "react";
import { MODELS } from "../lib/chatModels";

const UI_TEXT = {
  fa: {
    groups: {
      today: "امروز",
      yesterday: "دیروز",
      week: "این هفته",
      older: "قدیمی‌تر",
    },
    newChat: "گفتگوی جدید",
    aiModel: "مدل AI",
    free: "رایگان",
    limited: "محدود",
    autoOptimize: "بهینه‌سازی خودکار",
    on: "روشن",
    off: "خاموش",
    langLabels: { fa: "دری", ps: "پښتو", en: "EN" },
    emptyTitle: "هنوز گفتگویی نیست",
    emptySubtitle: "یک گفتگوی جدید شروع کنید!",
    messageLabel: "پیام",
    roleAdmin: "مدیر",
    roleUser: "کاربر",
    adminPanel: "پنل مدیریت",
    logout: "خروج",
  },
  ps: {
    groups: {
      today: "نن",
      yesterday: "پرون",
      week: "دغه اوونۍ",
      older: "پخوا",
    },
    newChat: "نوې خبرې اترې",
    aiModel: "AI ماډل",
    free: "وړیا",
    limited: "محدود",
    autoOptimize: "اتومات ښه‌کول",
    on: "چالان",
    off: "بند",
    langLabels: { fa: "دری", ps: "پښتو", en: "EN" },
    emptyTitle: "لا تر اوسه خبرې اترې نشته",
    emptySubtitle: "نوې خبرې اترې پیل کړئ!",
    messageLabel: "پیغام",
    roleAdmin: "ادمین",
    roleUser: "کارن",
    adminPanel: "د مدیریت پینل",
    logout: "وتل",
  },
  en: {
    groups: {
      today: "Today",
      yesterday: "Yesterday",
      week: "This week",
      older: "Older",
    },
    newChat: "New chat",
    aiModel: "AI model",
    free: "Free",
    limited: "Limited",
    autoOptimize: "Auto Optimize",
    on: "ON",
    off: "OFF",
    langLabels: { fa: "Dari", ps: "Pashto", en: "EN" },
    emptyTitle: "No conversations yet",
    emptySubtitle: "Start a new chat!",
    messageLabel: "messages",
    roleAdmin: "Admin",
    roleUser: "User",
    adminPanel: "Admin panel",
    logout: "Logout",
  },
};

function groupConvs(convs, labels) {
  const l = labels || {
    today: "Today",
    yesterday: "Yesterday",
    week: "This week",
    older: "Older",
  };
  const now = new Date(),
    today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  week.setDate(today.getDate() - 7);
  const g = {
    [l.today]: [],
    [l.yesterday]: [],
    [l.week]: [],
    [l.older]: [],
  };
  convs.forEach((c) => {
    const d = new Date(c.updatedAt);
    if (d >= today) g[l.today].push(c);
    else if (d >= yesterday) g[l.yesterday].push(c);
    else if (d >= week) g[l.week].push(c);
    else g[l.older].push(c);
  });
  return g;
}

export default function Sidebar({
  conversations = [],
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  model,
  onModelChange,
  availableModels = {},
  autoOptimize = true,
  onToggleAutoOptimize,
  theme,
  onThemeToggle,
  language,
  user,
  onLogout,
  onAdmin,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
}) {
  const [col, setCol] = useState(false);
  const [mOpen, setMOpen] = useState(false);
  const [delId, setDelId] = useState(null);
  const t = UI_TEXT[language] || UI_TEXT.en;
  const rtl = language !== "en";

  useEffect(() => {
    if (isMobile) setCol(false);
  }, [isMobile]);

  const del = async (e, id) => {
    e.stopPropagation();
    setDelId(id);
    await onDelete(id);
    setDelId(null);
  };
  const groups = groupConvs(conversations, t.groups);
  const isEnabled = (k) => availableModels?.[k] !== false;
  const freeMods = Object.entries(MODELS).filter(
    ([k, v]) => v.tier === "free" && isEnabled(k),
  );
  const limitMods = Object.entries(MODELS).filter(
    ([k, v]) => v.tier === "limited" && isEnabled(k),
  );

  const sidebarWidth = isMobile ? "84vw" : col ? "58px" : "264px";
  const resolvedMinWidth = isMobile ? "84vw" : col ? "58px" : "264px";

  return (
    <div
      style={{
        width: sidebarWidth,
        minWidth: resolvedMinWidth,
        height: "100%",
        background: "var(--bg-surface)",
        borderRight: rtl ? "none" : "1px solid var(--border-subtle)",
        borderLeft: rtl ? "1px solid var(--border-subtle)" : "none",
        display: "flex",
        flexDirection: "column",
        direction: rtl ? "rtl" : "ltr",
        transition:
          "transform .25s cubic-bezier(.4,0,.2,1), width .25s cubic-bezier(.4,0,.2,1), min-width .25s",
        overflow: "hidden",
        flexShrink: 0,
        zIndex: isMobile ? 20 : 10,
        position: isMobile ? "fixed" : "relative",
        left: rtl ? "auto" : 0,
        right: rtl ? 0 : "auto",
        top: 0,
        transform: isMobile
          ? mobileOpen
            ? "translateX(0)"
            : rtl
              ? "translateX(100%)"
              : "translateX(-100%)"
          : "none",
        boxShadow: isMobile ? "0 18px 40px rgba(0,0,0,.45)" : "none",
      }}
    >
      {/* Top */}
      <div
        style={{
          padding: "12px 10px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => (isMobile ? onCloseMobile?.() : setCol((v) => !v))}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            border: "none",
            background: "var(--bg-elevated)",
            color: "var(--text-2)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-elevated)";
            e.currentTarget.style.color = "var(--text-2)";
          }}
        >
          {isMobile ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          )}
        </button>
        {!col && (
          <>
            <button
              onClick={onNewChat}
              style={{
                flex: 1,
                height: "36px",
                borderRadius: "8px",
                border: "1px solid var(--border-default)",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent-muted)";
                e.currentTarget.style.color = "var(--accent)";
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t.newChat}
            </button>
            <button
              onClick={onThemeToggle}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                border: "none",
                background: "var(--bg-elevated)",
                color: "var(--text-2)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-elevated)";
                e.currentTarget.style.color = "var(--text-2)";
              }}
            >
              {theme === "dark" ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
          </>
        )}
        {col && (
          <button
            onClick={onNewChat}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent-muted)",
              color: "var(--accent)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {/* Model selector */}
      {!col && (
        <div
          style={{
            padding: "10px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-3)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".6px",
              marginBottom: "6px",
              paddingLeft: rtl ? "0" : "2px",
              paddingRight: rtl ? "2px" : "0",
              textAlign: rtl ? "right" : "left",
            }}
          >
            {t.aiModel}
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMOpen((v) => !v)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-1)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "all .15s",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "7px" }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: MODELS[model]?.color || "var(--accent)",
                    flexShrink: 0,
                  }}
                />
                <span>{MODELS[model]?.name || model}</span>
                <span
                  className={
                    MODELS[model]?.tier === "free"
                      ? "badge-free"
                      : "badge-limited"
                  }
                >
                  {MODELS[model]?.tier === "free" ? t.free : t.limited}
                </span>
              </div>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: mOpen ? "rotate(180deg)" : "none",
                  transition: ".2s",
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {mOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  zIndex: 200,
                  boxShadow: "var(--sh3)",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px 3px",
                    fontSize: "10px",
                    color: "var(--text-3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".5px",
                  }}
                >
                  {t.free}
                </div>
                {freeMods.map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => {
                      onModelChange(key);
                      setMOpen(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "none",
                      background:
                        model === key ? "var(--accent-muted)" : "transparent",
                      color: model === key ? "var(--accent)" : "var(--text-2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      transition: "background .1s",
                    }}
                    onMouseEnter={(e) => {
                      if (model !== key)
                        e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (model !== key)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: info.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, textAlign: rtl ? "right" : "left" }}>
                      {info.name}
                    </span>
                    <span className="badge-free">{t.free}</span>
                  </button>
                ))}
                <div
                  style={{
                    padding: "6px 10px 3px",
                    fontSize: "10px",
                    color: "var(--text-3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".5px",
                    borderTop: "1px solid var(--border-subtle)",
                    marginTop: "4px",
                  }}
                >
                  {t.limited}
                </div>
                {limitMods.map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => {
                      onModelChange(key);
                      setMOpen(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "none",
                      background:
                        model === key ? "var(--accent-muted)" : "transparent",
                      color: model === key ? "var(--accent)" : "var(--text-2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      transition: "background .1s",
                    }}
                    onMouseEnter={(e) => {
                      if (model !== key)
                        e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (model !== key)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: info.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, textAlign: rtl ? "right" : "left" }}>
                      {info.name}
                    </span>
                    <span className="badge-limited">{t.limited}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!col && (
        <div
          style={{
            padding: "6px 10px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--text-3)",
            flexShrink: 0,
          }}
        >
          <span>{t.autoOptimize}</span>
          <button
            onClick={onToggleAutoOptimize}
            style={{
              border: "1px solid var(--border-default)",
              background: autoOptimize ? "var(--accent-muted)" : "transparent",
              color: autoOptimize ? "var(--accent)" : "var(--text-3)",
              borderRadius: "999px",
              padding: "2px 10px",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {autoOptimize ? t.on : t.off}
          </button>
        </div>
      )}

      {/* Conversations */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {Object.entries(groups).map(([g, items]) => {
          if (!items.length) return null;
          return (
            <div key={g}>
              {!col && (
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".5px",
                    padding: "8px 4px 3px",
                    textAlign: rtl ? "right" : "left",
                  }}
                >
                  {g}
                </div>
              )}
              {items.map((c) => (
                <div
                  key={c._id}
                  className={`s-item${activeId === c._id ? " active" : ""}`}
                  onClick={() => onSelect(c._id)}
                  style={{ position: "relative", marginBottom: "2px" }}
                  title={col ? c.preview : undefined}
                >
                  {col ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-3)"
                        strokeWidth="1.5"
                      >
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "7px",
                        flexDirection: rtl ? "row-reverse" : "row",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-3)"
                        strokeWidth="1.5"
                        style={{ marginTop: "2px", flexShrink: 0 }}
                      >
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-1)",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: rtl ? "right" : "left",
                          }}
                        >
                          {c.preview || t.newChat}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "var(--text-3)",
                            marginTop: "2px",
                            textAlign: rtl ? "right" : "left",
                          }}
                        >
                          {c.shamsiDate || ""} · {c.messageCount}{" "}
                          {t.messageLabel}
                        </div>
                      </div>
                      {delId === c._id ? (
                        <div
                          style={{
                            width: "12px",
                            height: "12px",
                            border: "2px solid var(--text-3)",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "spin .6s linear infinite",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <button
                          onClick={(e) => del(e, c._id)}
                          className="del-btn"
                          style={{
                            opacity: 0,
                            width: "22px",
                            height: "22px",
                            borderRadius: "5px",
                            border: "none",
                            background: "transparent",
                            color: "var(--danger)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "all .15s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(248,113,113,.1)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {conversations.length === 0 && !col && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: "12px",
              marginTop: "40px",
              lineHeight: 1.9,
            }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              style={{ margin: "0 auto 8px", display: "block", opacity: 0.35 }}
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {t.emptyTitle}
            <br />
            {t.emptySubtitle}
          </div>
        )}
      </div>

      {/* User footer */}
      {!col && user && (
        <div
          style={{
            padding: "10px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px",
              borderRadius: "8px",
              background: "var(--bg-elevated)",
              cursor: "default",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background:
                  "linear-gradient(135deg,var(--accent),var(--green))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-1)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.name}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-3)" }}>
                {user.role === "admin" ? t.roleAdmin : t.roleUser}
              </div>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {user.role === "admin" && (
                <button
                  onClick={onAdmin}
                  title={t.adminPanel}
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: "var(--warn)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M6 20v-2a6 6 0 0112 0v2" />
                  </svg>
                </button>
              )}
              <button
                onClick={onLogout}
                title={t.logout}
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-3)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--danger)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-3)")
                }
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`.s-item:hover .del-btn{opacity:1!important}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
