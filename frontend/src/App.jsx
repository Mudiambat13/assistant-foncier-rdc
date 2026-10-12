import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = import.meta.env.VITE_API_URL || "";
const STORE = "foncier-rdc:v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const SUGGESTIONS = [
  "Comment obtenir un certificat d'enregistrement pour une parcelle ?",
  "Quelle différence entre concession perpétuelle et concession ordinaire ?",
  "Comment vérifier un titre foncier avant d'acheter un terrain ?",
  "Que faire en cas de double vente d'une parcelle ?",
];

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const I = {
  plus: ["M12 5v14", "M5 12h14"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  send: ["M12 19V5", "M5 12l7-7 7 7"],
  stop: ["M7 7h10v10H7z"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  copy: ["M9 9h11v11H9z", "M5 15V5a1 1 0 0 1 1-1h10"],
  check: ["M5 12l5 5 9-10"],
};

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || { convs: [], activeId: null };
  } catch {
    return { convs: [], activeId: null };
  }
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn"
      title="Copier"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon d={done ? I.check : I.copy} size={16} />
    </button>
  );
}

export default function App() {
  const [{ convs, activeId }, setStore] = useState(loadStore);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [providers, setProviders] = useState([]);
  const [kb, setKb] = useState(null);
  const [provider, setProvider] = useState(localStorage.getItem("foncier-rdc:provider") || "");
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const taRef = useRef(null);

  const active = convs.find((c) => c.id === activeId) || null;

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ convs, activeId }));
  }, [convs, activeId]);

  useEffect(() => {
    fetch(`${API}/api/providers`)
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers || []);
        setProvider((p) => (d.providers?.some((x) => x.id === p) ? p : d.providers?.[0]?.id || ""));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/api/knowledge`)
      .then((r) => r.json())
      .then(setKb)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (provider) localStorage.setItem("foncier-rdc:provider", provider);
  }, [provider]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const patchConv = useCallback((id, fn) => {
    setStore((s) => ({ ...s, convs: s.convs.map((c) => (c.id === id ? fn(c) : c)) }));
  }, []);

  const newChat = () => {
    abortRef.current?.abort();
    setStore((s) => ({ ...s, activeId: null }));
    setSidebar(false);
    taRef.current?.focus();
  };

  const removeConv = (id) => {
    setStore((s) => ({
      convs: s.convs.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  };

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;

    let id = activeId;
    const history = active ? active.messages : [];
    const userMsg = { role: "user", content };
    const nextMessages = [...history, userMsg];

    if (!id) {
      id = uid();
      const conv = {
        id,
        title: content.slice(0, 48),
        messages: [...nextMessages, { role: "assistant", content: "" }],
      };
      setStore((s) => ({ convs: [conv, ...s.convs], activeId: id }));
    } else {
      patchConv(id, (c) => ({
        ...c,
        messages: [...nextMessages, { role: "assistant", content: "" }],
      }));
    }

    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let sources = [];
    const setAnswer = (answer, error = false) =>
      patchConv(id, (c) => {
        const msgs = c.messages.slice();
        msgs[msgs.length - 1] = { role: "assistant", content: answer, error, sources };
        return { ...c, messages: msgs };
      });

    let acc = "";
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          provider,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const data = part.slice(6);
          if (data === "[DONE]") break outer;
          const j = JSON.parse(data);
          if (j.error) throw new Error(j.error);
          if (j.sources) {
            sources = j.sources;
            continue;
          }
          acc += j.text;
          setAnswer(acc);
        }
      }
      if (!acc) setAnswer("Aucune réponse reçue. Réessayez.", true);
    } catch (e) {
      if (e.name === "AbortError") {
        if (!acc) setAnswer("Réponse interrompue.", true);
      } else {
        setAnswer(acc ? acc + "\n\n*(réponse interrompue : " + e.message + ")*" : e.message, !acc);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="app">
      <aside className={"sidebar" + (sidebar ? " open" : "")}>
        <button className="new-chat" onClick={newChat}>
          <Icon d={I.plus} /> Nouvelle discussion
        </button>
        <nav className="history" aria-label="Discussions">
          {convs.length === 0 && <p className="muted small pad">Vos discussions apparaîtront ici.</p>}
          {convs.map((c) => (
            <div key={c.id} className={"conv" + (c.id === activeId ? " active" : "")}>
              <button
                className="conv-title"
                onClick={() => {
                  abortRef.current?.abort();
                  setStore((s) => ({ ...s, activeId: c.id }));
                  setSidebar(false);
                }}
              >
                {c.title}
              </button>
              <button className="icon-btn" title="Supprimer" onClick={() => removeConv(c.id)}>
                <Icon d={I.trash} size={16} />
              </button>
            </div>
          ))}
        </nav>
        {kb && (
          <p className={"kb small " + (kb.documents.length ? "muted" : "warn")}>
            {kb.documents.length
              ? `Base juridique : ${kb.documents.length} texte${kb.documents.length > 1 ? "s" : ""} chargé${kb.documents.length > 1 ? "s" : ""}`
              : "Aucun texte officiel chargé : réponses sans citation d'articles."}
          </p>
        )}
        {providers.length > 1 && (
          <label className="provider">
            <span className="muted small">Modèle</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        )}
      </aside>
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setSidebar(true)} aria-label="Ouvrir le menu">
            <Icon d={I.menu} size={20} />
          </button>
          <span className="brand">Assistant foncier RDC</span>
          <button className="icon-btn menu" onClick={newChat} aria-label="Nouvelle discussion">
            <Icon d={I.plus} size={20} />
          </button>
        </header>

        <section className="thread">
          {!active ? (
            <div className="welcome">
              <div className="logo">F</div>
              <h1>Une question sur le foncier congolais ?</h1>
              <p className="muted">
                Titres, concessions, achat de terrain, litiges : posez votre question.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {active.messages.map((m, i) => (
                <article key={i} className={"msg " + m.role}>
                  {m.role === "assistant" && <div className="avatar">F</div>}
                  <div className={"bubble" + (m.error ? " error" : "")}>
                    {m.role === "assistant" ? (
                      m.content ? (
                        <>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          {m.sources?.length > 0 && !(busy && i === active.messages.length - 1) && (
                            <div className="sources">
                              <span className="muted small">Textes consultés</span>
                              {m.sources.map((src, k) => (
                                <span key={k} className="chip">
                                  {src.title}{src.article ? ` · Art. ${src.article}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {!(busy && i === active.messages.length - 1) && !m.error && (
                            <div className="actions"><CopyButton text={m.content} /></div>
                          )}
                        </>
                      ) : (
                        <span className="typing"><i /><i /><i /></span>
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </section>

        <footer className="composer-wrap">
          <div className="composer">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              placeholder="Posez votre question sur le droit foncier"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={8000}
            />
            {busy ? (
              <button className="send stop" onClick={() => abortRef.current?.abort()} aria-label="Arrêter">
                <Icon d={I.stop} size={16} />
              </button>
            ) : (
              <button className="send" disabled={!input.trim()} onClick={() => send(input)} aria-label="Envoyer">
                <Icon d={I.send} size={18} />
              </button>
            )}
          </div>
          <p className="disclaimer">
            Information juridique générale, pas un avis personnalisé. Faites vérifier tout titre auprès
            du conservateur des titres immobiliers.
          </p>
        </footer>
      </main>
    </div>
  );
}
