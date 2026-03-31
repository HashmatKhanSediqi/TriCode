import ReactMarkdown from "react-markdown";
import { useState } from "react";

const MODEL_LABEL = {
  "meta-llama/llama-3-8b-instruct:free": "Llama 3 8B",
  "meta-llama/llama-3.1-8b-instruct:free": "Llama 3.1 8B",
  "meta-llama/llama-3-70b-instruct": "Llama 3 70B",
  "google/gemma-2-9b-it:free": "Gemma 2 9B",
  "google/gemma-3-12b-it:free": "Gemma 3 12B",
  "mistralai/mistral-7b-instruct:free": "Mistral 7B",
  "deepseek/deepseek-r1:free": "DeepSeek R1",
  "deepseek/deepseek-chat-v3.1": "DeepSeek V3.1",
  "microsoft/phi-3-mini-128k-instruct:free": "Phi-3 Mini",
  "qwen/qwen-2.5-coder-32b-instruct:free": "Qwen 2.5 Coder",
  "openai/gpt-4o": "GPT-4o",
  "openai/gpt-4.1": "GPT-4.1",
  "openai/gpt-5": "GPT-5",
  "openai/gpt-4o-mini": "GPT-4o Mini",
  "google/gemini-flash-1.5": "Gemini Flash",
  "anthropic/claude-3-haiku": "Claude 3 Haiku",
  pollinations: "Image Generator",
  "media/image/flux-schnell": "FLUX Image HQ",
  "media/image/pollinations": "Pollinations Image",
  "media/video/minimax-video": "MiniMax Video",
  "media/image/gpt-image": "GPT Image",
};

const MESSAGE_TEXT = {
  fa: {
    copy: "کپی",
    copied: "✓ کپی شد",
    code: "کد",
    files: "فایل",
    download: "دانلود",
  },
  ps: {
    copy: "کاپي",
    copied: "✓ کاپي شو",
    code: "کوډ",
    files: "فایلونه",
    download: "ډاونلوډ",
  },
  en: { copy: "Copy", copied: "Copied", code: "code", files: "files", download: "Download" },
};

function CodeBlock({ language, children, labels }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div
      style={{
        margin: "10px 0",
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="code-hdr">
        <span>{language || labels.code}</span>
        <button className="copy-btn" onClick={copy}>
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "14px",
          background: "var(--bg-base)",
          fontSize: "13px",
          lineHeight: "1.6",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function isRTL(t) {
  return /[\u0600-\u06FF]/.test(t?.slice(0, 100));
}

export default function Message({
  role,
  content,
  model,
  attachments = [],
  isStreaming,
  theme,
  language = "en",
  compact = false,
}) {
  const isUser = role === "user";
  const rtl = isRTL(content);
  const t = MESSAGE_TEXT[language] || MESSAGE_TEXT.en;
  const label =
    MODEL_LABEL[model] ||
    (typeof model === "string" && model.startsWith("media/")
      ? model.replace("media/", "").replaceAll("/", " · ")
      : model) ||
    null;
  const normalizedContent =
    !isUser && typeof content === "string"
      ? content
          // Some older deployments returned Pollinations URLs on `gen.pollinations.ai`,
          // which now often require an API key and fail with 401. Rewrite to the free
          // `image.pollinations.ai` endpoint so images render in production.
          .replace(
            /https?:\/\/gen\.pollinations\.ai\/image\//gi,
            "https://image.pollinations.ai/prompt/",
          )
          .replace(
            /https?:\/\/gen\.pollinations\.ai\/prompt\//gi,
            "https://image.pollinations.ai/prompt/",
          )
          .split("\n")
          .map((line) => {
            const url = line.trim();
            if (/^https?:\/\/image\.pollinations\.ai\/prompt\//i.test(url)) {
              return `![Generated image](${url})`;
            }
            return line;
          })
          .join("\n")
      : content;

  const triggerDownload = (url, name) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "download.zip";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadMedia = async (url, name) => {
    if (!url) return;
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, name || "image.jpg");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  const groupedUserAttachments = (() => {
    const folders = new Map();
    const files = [];
    attachments.forEach((a, idx) => {
      const name = String(a?.name || "");
      if (name.includes("/")) {
        const [root, ...rest] = name.split("/");
        if (!folders.has(root)) {
          folders.set(root, { name: root, items: [] });
        }
        folders.get(root).items.push({
          ...a,
          displayName: rest.join("/") || name,
          idx,
        });
      } else {
        files.push({ ...a, idx });
      }
    });
    return { folders: Array.from(folders.values()), files };
  })();

  return (
    <div
      className={isUser ? "slide-r" : "slide-l"}
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        gap: "9px",
        alignItems: "flex-start",
      }}
    >
      {!isUser && (
        <img
          src="/tricode-mark.svg"
          alt="TriCode AI"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "10px",
            flexShrink: 0,
            marginTop: "2px",
            background: "#fff",
            padding: "2px",
            boxShadow: "0 2px 8px var(--accent-glow)",
          }}
        />
      )}

      <div
        style={{
          maxWidth: compact ? "92%" : "78%",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {!isUser && label && (
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-3)",
              fontWeight: 500,
              paddingLeft: "2px",
            }}
          >
            {label}
          </div>
        )}

        {/* Attachments */}
        {isUser && attachments?.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              justifyContent: "flex-end",
              marginBottom: "4px",
            }}
          >
            {groupedUserAttachments.folders.map((folder) => (
              <div
                key={folder.name}
                style={{
                  background: "var(--user-bg)",
                  border: "1px solid var(--user-br)",
                  borderRadius: "8px",
                  padding: "7px 12px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  maxWidth: "240px",
                }}
              >
                <span>📁</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {folder.name} · {folder.items.length} {t.files}
                </span>
              </div>
            ))}

            {groupedUserAttachments.files.map((a) =>
              a.type === "image" ? (
                <img
                  key={a.idx}
                  src={a.url}
                  alt={a.name}
                  style={{
                    maxWidth: "200px",
                    maxHeight: "150px",
                    borderRadius: "10px",
                    objectFit: "cover",
                    border: "1px solid var(--user-br)",
                  }}
                />
              ) : (
                <div
                  key={a.idx}
                  style={{
                    background: "var(--user-bg)",
                    border: "1px solid var(--user-br)",
                    borderRadius: "8px",
                    padding: "7px 12px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>📄</span>
                  <span>{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}

        {!isUser && attachments?.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            {attachments.map((a, i) => {
              if (a.type === "download") {
                return (
                  <div
                    key={i}
                    style={{
                      background: "var(--ai-bg)",
                      border: "1px solid var(--ai-br)",
                      borderRadius: "12px",
                      padding: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>📦</span>
                      <div style={{ fontSize: "12px", color: "var(--text-1)" }}>
                        {a.name || "project.zip"}
                      </div>
                    </div>
                    <button
                      onClick={() => triggerDownload(a.url, a.name)}
                      style={{
                        border: "1px solid var(--accent)",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {t.download}
                    </button>
                  </div>
                );
              }
              if (
                a.type === "generated-image" ||
                a.mimeType?.startsWith("image/")
              ) {
                return (
                  <div
                    key={i}
                    style={{
                      background: "var(--ai-bg)",
                      border: "1px solid var(--ai-br)",
                      borderRadius: "12px",
                      padding: "10px",
                    }}
                  >
                    <img
                      src={a.url}
                      alt={a.name || `generated-image-${i + 1}`}
                      style={{
                        width: "100%",
                        maxHeight: compact ? "300px" : "420px",
                        objectFit: "contain",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                      }}
                    />
                    <div style={{ marginTop: "8px" }}>
                      <button
                        onClick={() =>
                          downloadMedia(
                            a.downloadUrl || a.url,
                            a.name || `image-${i + 1}.jpg`,
                          )
                        }
                        style={{
                          border: "1px solid var(--accent)",
                          background: "var(--accent-muted)",
                          color: "var(--accent)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {t.download}
                      </button>
                    </div>
                  </div>
                );
              }
              if (
                a.type === "generated-video" ||
                a.mimeType?.startsWith("video/")
              ) {
                return (
                  <div
                    key={i}
                    style={{
                      background: "var(--ai-bg)",
                      border: "1px solid var(--ai-br)",
                      borderRadius: "12px",
                      padding: "10px",
                    }}
                  >
                    <video
                      controls
                      preload="metadata"
                      style={{
                        width: "100%",
                        maxHeight: compact ? "300px" : "420px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                        background: "#000",
                      }}
                    >
                      <source src={a.url} type={a.mimeType || "video/mp4"} />
                    </video>
                    <div style={{ marginTop: "8px" }}>
                      <a
                        href={a.downloadUrl || a.url}
                        target="_blank"
                        rel="noopener"
                        style={{
                          color: "var(--accent)",
                          fontSize: "12px",
                          textDecoration: "underline",
                        }}
                      >
                        Download video
                      </a>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        <div
          style={{
            padding: isUser
              ? compact
                ? "9px 12px"
                : "10px 14px"
              : compact
                ? "10px 12px"
                : "12px 16px",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            background: isUser ? "var(--user-bg)" : "var(--ai-bg)",
            border: `1px solid ${isUser ? "var(--user-br)" : "var(--ai-br)"}`,
            color: "var(--text-1)",
            fontSize: compact ? "13px" : "14px",
            lineHeight: "1.75",
            direction: rtl ? "rtl" : "ltr",
            textAlign: rtl ? "right" : "left",
            wordBreak: "break-word",
          }}
        >
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>
          ) : (
            <div className="md">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...p }) {
                    const m = /language-(\w+)/.exec(className || "");
                    return !inline ? (
                      <CodeBlock language={m?.[1]} labels={t}>
                        {children}
                      </CodeBlock>
                    ) : (
                      <code {...p}>{children}</code>
                    );
                  },
                  p({ children }) {
                    return <p style={{ margin: ".4em 0" }}>{children}</p>;
                  },
                  h1({ children }) {
                    return (
                      <h1
                        style={{
                          fontSize: "1.2em",
                          fontWeight: 700,
                          margin: ".8em 0 .3em",
                          color: "var(--text-1)",
                        }}
                      >
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2
                        style={{
                          fontSize: "1.05em",
                          fontWeight: 600,
                          margin: ".7em 0 .3em",
                        }}
                      >
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3
                        style={{
                          fontSize: ".95em",
                          fontWeight: 600,
                          margin: ".6em 0 .25em",
                          color: "var(--green)",
                        }}
                      >
                        {children}
                      </h3>
                    );
                  },
                  ul({ children }) {
                    return (
                      <ul style={{ paddingLeft: "1.3em", margin: ".35em 0" }}>
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol style={{ paddingLeft: "1.3em", margin: ".35em 0" }}>
                        {children}
                      </ol>
                    );
                  },
                  li({ children }) {
                    return <li style={{ margin: ".2em 0" }}>{children}</li>;
                  },
                  strong({ children }) {
                    return (
                      <strong
                        style={{ fontWeight: 600, color: "var(--text-1)" }}
                      >
                        {children}
                      </strong>
                    );
                  },
                  em({ children }) {
                    return (
                      <em
                        style={{ color: "var(--green)", fontStyle: "italic" }}
                      >
                        {children}
                      </em>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener"
                        style={{
                          color: "var(--accent)",
                          textDecoration: "underline",
                          textUnderlineOffset: "3px",
                        }}
                      >
                        {children}
                      </a>
                    );
                  },
                  img({ src, alt }) {
                    return (
                      <img
                        src={src}
                        alt={alt || "generated"}
                        style={{
                          maxWidth: "100%",
                          borderRadius: "10px",
                          display: "block",
                          margin: "8px 0",
                          border: "1px solid var(--border-default)",
                        }}
                      />
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote
                        style={{
                          borderLeft: "3px solid var(--accent)",
                          paddingLeft: "12px",
                          margin: "8px 0",
                          color: "var(--text-2)",
                          fontStyle: "italic",
                        }}
                      >
                        {children}
                      </blockquote>
                    );
                  },
                  table({ children }) {
                    return (
                      <div style={{ overflowX: "auto", margin: "10px 0" }}>
                        <table
                          style={{
                            borderCollapse: "collapse",
                            width: "100%",
                            fontSize: "13px",
                          }}
                        >
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th
                        style={{
                          border: "1px solid var(--border-default)",
                          padding: "6px 10px",
                          background: "var(--bg-overlay)",
                          fontWeight: 600,
                        }}
                      >
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td
                        style={{
                          border: "1px solid var(--border-default)",
                          padding: "6px 10px",
                        }}
                      >
                        {children}
                      </td>
                    );
                  },
                }}
              >
                {normalizedContent}
              </ReactMarkdown>
              {isStreaming && <span className="cursor" />}
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "10px",
            flexShrink: 0,
            marginTop: "2px",
            background: "var(--user-br)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 700,
            color: "var(--accent)",
          }}
        >
          U
        </div>
      )}
    </div>
  );
}
