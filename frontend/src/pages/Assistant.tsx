import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Database, FileText, Send, ShieldCheck, User } from "lucide-react";
import { chatApi, type ChatMessage, type ChatSource } from "@/lib/chatApi";

function sourceTypeLabel(type: string) {
    const labels: Record<string, string> = {
        structured_query: "Consulta estruturada",
        vulnerability_prioritization: "Priorização",
        policy: "Politica",
        asset: "Ativo",
        vulnerability: "Vulnerabilidade",
        control: "Controlo",
        mechanism: "Mecanismo",
        technical_regulation: "Regulamento técnico",
        procedure: "Procedimento",
        evidence: "Evidencia",
        compliance_gap: "Gap de conformidade",
        general: "Conhecimento",
        internal: "Fonte interna"
    };
    return labels[type] || type;
}

function taskTypeLabel(type?: string) {
    const labels: Record<string, string> = {
        structured_query: "Consulta estruturada",
        vulnerability_prioritization: "Priorização",
        control_mapping: "Mapeamento de controlos",
        evidence_drafting: "Evidencia",
        executive_advisory: "Aconselhamento executivo",
        risk_analysis: "Analise de risco",
        technical_implementation: "Implementação técnica",
        general_qa: "Pergunta geral"
    };
    return type ? labels[type] || type : "Sem classificacao";
}

function confidenceLabel(confidence?: number) {
    if (confidence === undefined || confidence === null || Number.isNaN(Number(confidence))) return null;
    return `${Math.round(Number(confidence) * 100)}%`;
}

function sourceIcon(type: string) {
    if (type === "structured_query") return <Database className="h-3.5 w-3.5" />;
    if (type === "vulnerability_prioritization") return <ShieldCheck className="h-3.5 w-3.5" />;
    return <FileText className="h-3.5 w-3.5" />;
}

function formatScore(score?: number | null) {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
    const value = Number(score);
    if (value <= 1) return value.toFixed(2);
    return Math.round(value).toString();
}

function SourceCard({ source }: { source: ChatSource }) {
    const score = formatScore(source.score);

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                        {sourceIcon(source.source_type)}
                        {sourceTypeLabel(source.source_type)}
                    </div>
                    <h4 className="truncate text-xs font-bold text-slate-900" title={source.title}>
                        {source.title}
                    </h4>
                </div>
                {score && (
                    <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
                        {score}
                    </span>
                )}
            </div>
            {source.source_ref && (
                <p className="mt-1 truncate font-mono text-[10px] font-bold text-slate-400" title={source.source_ref}>
                    {source.source_ref}
                </p>
            )}
            {source.content_excerpt && (
                <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-slate-600">
                    {source.content_excerpt}
                </p>
            )}
            {(source.framework || source.control_code) && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {source.framework && <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{source.framework}</span>}
                    {source.control_code && <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{source.control_code}</span>}
                </div>
            )}
        </div>
    );
}

export default function Assistant() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [messages, setMessages] = useState<ChatMessage[]>([{
        role: "assistant",
        content: "Ola. Sou o seu Virtual CISO. Posso ajudar a analisar ativos, riscos, vulnerabilidades, controlos e conformidade com base nos dados da plataforma.",
        timestamp: new Date().toISOString()
    }]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const lastAiState = [...messages].reverse().find((message) => message.role === "assistant" && message.model_used);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        const suggestedQuestion = searchParams.get("q");
        if (!suggestedQuestion) return;

        setInput(suggestedQuestion);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("q");
        setSearchParams(nextParams, { replace: true });
    }, []);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            role: "user",
            content: input.trim(),
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
            const response = await chatApi.ask(userMsg.content, history);
            const assistantMsg: ChatMessage = {
                role: "assistant",
                content: response.response || "Sem resposta.",
                timestamp: new Date().toISOString(),
                sources: response.sources || [],
                used_context: response.used_rag ? "RAG ativo" : response.model_used,
                task_type: response.task_type,
                model_used: response.model_used,
                used_rag: response.used_rag,
                confidence: response.confidence
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error("Failed to fetch response:", error);
            setMessages(prev => [...prev, {
                role: "assistant",
                content: "Ocorreu um erro ao contactar o servidor do Virtual CISO. Verifique a ligacao ao backend/Ollama e tente novamente.",
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative flex h-[calc(100vh-4rem)] flex-col bg-slate-50/50">
            <div className="z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-800 bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-inner">
                        <Bot className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Virtual CISO</h1>
                        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            H-RAG Engine | Fontes rastreaveis
                        </p>
                    </div>
                </div>
                {lastAiState && (
                    <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 lg:flex">
                        <span className="text-slate-400">Estado da IA</span>
                        <span className="rounded-full bg-white px-2 py-1 text-indigo-700">{taskTypeLabel(lastAiState.task_type)}</span>
                        <span className="rounded-full bg-white px-2 py-1 text-slate-600">{lastAiState.model_used}</span>
                        <span className={lastAiState.used_rag ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-slate-500"}>
                            {lastAiState.used_rag ? `${lastAiState.sources?.length || 0} fontes` : "Sem RAG"}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`flex max-w-[82%] gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                            <div className="mt-1 shrink-0">
                                {msg.role === "user" ? (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                                        <User className="h-4 w-4" />
                                    </div>
                                ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-700 bg-indigo-900 text-white">
                                        <Bot className="h-4 w-4" />
                                    </div>
                                )}
                            </div>
                            <div className={`rounded-2xl p-5 shadow-sm ${msg.role === "user" ? "rounded-tr-none bg-indigo-600 text-white" : "rounded-tl-none border border-slate-200 bg-white text-slate-800"}`}>
                                <div className="prose prose-sm max-w-none prose-p:leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, "<br/>") }} />

                                {msg.role === "assistant" && msg.model_used && (
                                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                            {taskTypeLabel(msg.task_type)}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                            {msg.model_used}
                                        </span>
                                        <span className={msg.used_rag ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"}>
                                            {msg.used_rag ? `RAG: ${msg.sources?.length || 0} fontes` : "RAG: nao usado"}
                                        </span>
                                        {confidenceLabel(msg.confidence) && (
                                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                                                Confianca: {confidenceLabel(msg.confidence)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {msg.role === "assistant" && msg.used_rag && (!msg.sources || msg.sources.length === 0) && (
                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                        RAG ativo, mas sem fontes encontradas para esta pergunta.
                                    </div>
                                )}

                                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fontes utilizadas</p>
                                            {msg.used_context && (
                                                <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                                                    {msg.used_context}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                            {msg.sources.map((source, i) => (
                                                <SourceCard key={`${source.source_ref}-${i}`} source={source} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="flex max-w-[80%] gap-4">
                            <div className="mt-1 shrink-0">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-700 bg-indigo-900 text-white">
                                    <Bot className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-slate-200 bg-white p-5 shadow-sm">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" style={{ animationDelay: "0.2s" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: "0.4s" }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white p-6">
                <div className="relative mx-auto max-w-4xl">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Pergunte sobre ativos, riscos, vulnerabilidades, controlos ou conformidade..."
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-6 pr-16 text-slate-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        rows={1}
                        style={{ minHeight: "60px", maxHeight: "200px" }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Enviar"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>
                <p className="mt-3 text-center text-[10px] font-medium text-slate-400">
                    As respostas devem ser validadas por um responsavel humano antes de suportarem uma decisao formal.
                </p>
            </div>
        </div>
    );
}
