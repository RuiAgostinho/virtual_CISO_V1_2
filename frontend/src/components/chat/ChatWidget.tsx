import { useMemo, useRef, useState } from "react";
import { chatApi, type ChatMessage } from "@/lib/chatApi";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá. Sou o Assistente Virtual CISO. Em que posso ajudar?",
      timestamp: new Date().toISOString(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo(
    () => [
      "Como implementar um controlo de gestão de acessos?",
      "Que evidências devo recolher para auditoria ISO 27001?",
      "Ajuda-me a priorizar estes riscos.",
    ],
    []
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content, timestamp: new Date().toISOString() },
    ];

    setMessages(next);
    setInput("");
    setBusy(true);
    scrollToBottom();

    try {
      const history = next.slice(-12).map((msg) => ({ role: msg.role, content: msg.content }));
      const res = await chatApi.ask(content, history);
      const reply = res.response ?? "Não consegui obter resposta.";
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: reply,
          timestamp: new Date().toISOString(),
          sources: res.sources || [],
          used_context: res.used_rag ? "RAG ativo" : res.model_used,
          task_type: res.task_type,
          model_used: res.model_used,
          used_rag: res.used_rag,
          confidence: res.confidence,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "Erro ao contactar o assistente. Tenta novamente.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-slate-900 px-4 py-3 text-sm text-white shadow-lg hover:bg-slate-800"
        aria-label="Abrir chat"
      >
        Chat
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[92vw] max-w-md rounded-2xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Assistente Virtual CISO</div>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>

          <div ref={listRef} className="max-h-[55vh] space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800"
                  }
                >
                  {message.content}
                  {message.role === "assistant" && message.model_used && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-200 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      <span>{message.task_type}</span>
                      <span>{message.model_used}</span>
                      <span>{message.used_rag ? `${message.sources?.length || 0} fonte(s)` : "sem RAG"}</span>
                    </div>
                  )}
                  {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                    <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {message.sources.length} fonte(s)
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!busy && messages.length <= 2 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Sugestões:</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      className="rounded-full border px-3 py-1.5 text-xs hover:bg-slate-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {busy && <div className="text-xs text-slate-500">A gerar resposta...</div>}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="border-t p-3"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Escreve uma mensagem..."
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
