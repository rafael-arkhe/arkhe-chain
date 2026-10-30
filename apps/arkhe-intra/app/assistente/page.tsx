'use client';
import { useState, useRef } from 'react';
import { Sparkles, Send, Cpu, Trash2, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/client';
import { PageTitle, Notice } from '@/components/ui';
const suggestions = ['Ajude a estruturar uma política de uso de IA.', 'Explique a diferença entre integridade e autenticidade.', 'Crie um checklist para revisar uma minuta.', 'Como escrever uma diretriz mais clara?'];
export default function Assistant() {
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [prompt, setPrompt] = useState('');
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = prompt.trim();
    if (busy || !question) return;
    setBusy(true); setError(''); setPrompt('');
    setMessages(old => [...old, { role: 'user', text: question }]);
    try {
      const result = await api<{ answer: string }>('assistant', { prompt: question });
      setMessages(old => [...old, { role: 'assistant', text: result.answer }]);
    } catch (error) { setError((error as Error).message); setPrompt(question); }
    finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="INTELIGÊNCIA / OLLAMA LOCAL" title="Um apoio para pensar melhor"><span className="tag"><Cpu size={15} />Inferência local</span>{messages.length ? <button className="button secondary" disabled={busy} onClick={() => { setMessages([]); setError(''); }}><Trash2 size={15} />Limpar conversa</button> : null}</PageTitle>
    <div className="assistant-layout"><section className="panel chat" aria-label="Conversa com o assistente">
      {!messages.length ? <><div className="chat-intro"><Sparkles size={32} /><h2>Por onde vamos começar?</h2><p>Uma ideia, um texto ou uma dúvida. Explore possibilidades com o modelo local e revise cada resposta antes de usá-la.</p></div><div className="prompt-suggestions">{suggestions.map(text => <button key={text} type="button" onClick={() => { setPrompt(text); promptInput.current?.focus(); }}>{text} <ArrowUpRight size={14} aria-hidden="true" /></button>)}</div></> : null}
      <div aria-live="polite" aria-busy={busy}>{messages.map((message, index) => <article key={index} className={'message ' + message.role}><strong>{message.role === 'user' ? 'Você' : 'Ollama · proposta para revisão'}</strong><p>{message.text}</p></article>)}{busy ? <div className="thinking" role="status"><span className="spinner" aria-hidden="true" />O modelo está elaborando a resposta…</div> : null}</div>
      {error ? <Notice error>{error} Sua pergunta foi preservada para uma nova tentativa.</Notice> : null}
      <form onSubmit={send}><label className="sr-only" htmlFor="prompt">Sua pergunta</label><textarea ref={promptInput} id="prompt" name="prompt" rows={3} maxLength={8000} value={prompt} onChange={event => setPrompt(event.target.value)} required disabled={busy} placeholder="Descreva sua ideia ou escreva uma pergunta…" /><div className="composer-actions"><small>Cada pergunta é independente · {prompt.length.toLocaleString('pt-BR')} / 8.000 caracteres</small><button className="button" disabled={busy || !prompt.trim()}><Send size={16} />{busy ? 'Elaborando…' : 'Enviar pergunta'}</button></div></form>
    </section><aside><section className="panel"><Cpu size={28} className="text-primary" /><h2>Seu modelo. Seu ambiente.</h2><p>As perguntas são processadas pelo Ollama local. O histórico fica apenas nesta página e não é enviado como contexto nas próximas perguntas.</p><Notice>As respostas são propostas. O assistente não assina, aprova, publica nem executa ferramentas.</Notice><p>O primeiro carregamento pode demorar. Se o modelo não estiver disponível, sua pergunta será preservada para tentar novamente.</p></section><section className="trust-note" style={{ marginTop: 20 }}><Sparkles size={23} /><h3>Peça algo concreto.</h3><p>Informe o objetivo, o público e o formato esperado. Depois, confira os fatos e adapte o texto ao seu contexto.</p></section></aside></div>
  </>;
}
