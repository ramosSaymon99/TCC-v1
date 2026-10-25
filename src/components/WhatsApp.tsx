import { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Send } from 'lucide-react';
import { call, useStore } from '../store/Store';
import type { Mensagem, WhatsAppConfig } from '../types';
import { conversaDe, linkWhatsApp, normalizarTelefone, telefoneValido } from '../utils/whatsapp';
import { dateTime, uid } from '../utils/format';
import { Field } from './fields';
import { Badge, Modal } from './ui';

/** Configuração pública do WhatsApp Business da empresa (sem token); null no modo local ou enquanto carrega. */
export function useWhatsAppConfig() {
  const { modo } = useStore();
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (modo !== 'remote') return;
    call<WhatsAppConfig>('/whatsapp/config').then(setCfg).catch(() => setCfg(null));
  }, [modo, versao]);
  return { cfg, setCfg, recarregar: () => setVersao((v) => v + 1) };
}

export interface EnvioWhatsApp {
  telefone?: string;
  clienteId?: string;
  nome?: string;
  texto: string;
  referencia?: string;
}

/**
 * Janela de envio: pela Cloud API da Meta (quando a empresa conectou o WhatsApp Business)
 * ou pelo link do WhatsApp, que abre a conversa com a mensagem pronta.
 */
export function EnviarWhatsApp({ envio, onClose, onEnviado }: { envio: EnvioWhatsApp; onClose: () => void; onEnviado?: () => void }) {
  const { db, user, can, upsert, toast, registrarMensagem } = useStore();
  const { cfg } = useWhatsAppConfig();
  const [telefone, setTelefone] = useState(envio.telefone ?? '');
  const [texto, setTexto] = useState(envio.texto);
  const [usarModelo, setUsarModelo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState('');
  const api = !!cfg?.configurado;
  const valido = telefoneValido(telefone);
  const historico = conversaDe(db.mensagens, envio.clienteId ? { id: envio.clienteId, telefone } : undefined, telefone).slice(-3);

  const registrarLink = () => {
    if (!can('clientes')) return;
    upsert('mensagens', {
      id: `lk_${uid()}`, direcao: 'Enviada', canal: 'Link', status: 'Aberta no WhatsApp', telefone: normalizarTelefone(telefone),
      clienteId: envio.clienteId, nome: envio.nome, texto, referencia: envio.referencia, usuario: user?.nome, data: new Date().toISOString(),
    });
  };
  const abrirLink = () => {
    window.open(linkWhatsApp(telefone, texto), '_blank', 'noopener');
    registrarLink();
    toast('Conversa aberta no WhatsApp com a mensagem pronta.', 'info');
    onEnviado?.();
    onClose();
  };
  const enviarApi = async () => {
    setEnviando(true); setFalha('');
    try {
      const r = await call<{ mensagem: Mensagem }>('/whatsapp/enviar', {
        method: 'POST', body: JSON.stringify({ telefone, texto, clienteId: envio.clienteId, nome: envio.nome, referencia: envio.referencia, usarModelo }),
      });
      registrarMensagem(r.mensagem);
      toast(r.mensagem.modelo ? 'Mensagem enviada como modelo aprovado.' : 'Mensagem enviada pelo WhatsApp Business.');
      onEnviado?.();
      onClose();
    } catch (e) {
      setFalha((e as Error).message);
    } finally { setEnviando(false); }
  };

  return (
    <Modal title={<span className="row"><MessageCircle size={18} className="text-whatsapp" /> Enviar pelo WhatsApp</span>} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn" disabled={!valido || !texto.trim()} onClick={abrirLink}><ExternalLink size={15} /> Abrir no WhatsApp</button>
      {api && <button className="btn btn-whatsapp" disabled={!valido || !texto.trim() || enviando} onClick={enviarApi}><Send size={15} /> {enviando ? 'Enviando…' : 'Enviar agora'}</button>}
    </>}>
      <div className="form-grid">
        <Field label="Para" hint={envio.nome ? `${envio.nome}${valido ? '' : ' · informe DDD e número'}` : valido ? undefined : 'Informe DDD e número'}>
          <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(27) 99999-9999" inputMode="tel" autoFocus={!envio.telefone} />
        </Field>
        <Field label="Envio">
          <div style={{ paddingTop: 8 }} className="small">
            {api ? <Badge tone="green">WhatsApp Business conectado · {cfg?.numero || 'API'}</Badge> : <span className="muted">Pelo link do WhatsApp (conecte o WhatsApp Business em Configurações para enviar direto do sistema)</span>}
          </div>
        </Field>
        <Field label="Mensagem" full hint={`${texto.length} caracteres`}>
          <textarea className="textarea" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Field>
        {api && cfg?.modelo?.nome && (
          <label className="check full">
            <input type="checkbox" checked={usarModelo} onChange={(e) => setUsarModelo(e.target.checked)} />
            Enviar como modelo aprovado "{cfg.modelo.nome}" (necessário quando o cliente não conversa com a empresa há mais de 24 horas)
          </label>
        )}
        {falha && <div className="full alert-erro">{falha}</div>}
        {historico.length > 0 && (
          <div className="full">
            <div className="small muted" style={{ marginBottom: 6 }}>Últimas mensagens com este contato</div>
            <Conversa mensagens={historico} compacta />
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Histórico em balões, como no aplicativo. */
export function Conversa({ mensagens, compacta }: { mensagens: Mensagem[]; compacta?: boolean }) {
  if (!mensagens.length) return <div className="small muted">Nenhuma mensagem registrada.</div>;
  return (
    <div className={`wa-conversa ${compacta ? 'compacta' : ''}`}>
      {mensagens.map((m) => (
        <div key={m.id} className={`wa-msg ${m.direcao === 'Enviada' ? 'out' : 'in'}`}>
          <div className="wa-texto">{m.texto}</div>
          <div className="wa-meta">
            {dateTime(m.data)}
            {m.direcao === 'Enviada' && <> · {m.canal === 'Link' ? 'pelo link' : m.status.toLowerCase()}{m.modelo ? ' · modelo' : ''}</>}
            {m.referencia && <> · {m.referencia}</>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Botão compacto usado nos painéis. */
export function BotaoWhatsApp({ onClick, label = 'WhatsApp' }: { onClick: () => void; label?: string }) {
  return <button className="btn btn-sm btn-whatsapp-outline" onClick={onClick}><MessageCircle size={14} /> {label}</button>;
}


/* ---------------- Configurações: conexão com o WhatsApp Business ---------------- */
function Copiavel({ valor }: { valor: string }) {
  const { toast } = useStore();
  return (
    <div className="copiavel">
      <code title={valor}>{valor || '—'}</code>
      <button type="button" className="btn btn-sm" disabled={!valor} onClick={() => navigator.clipboard?.writeText(valor).then(() => toast('Copiado.')).catch(() => toast('Copie manualmente.', 'error'))}>Copiar</button>
    </div>
  );
}

export function WhatsAppCard() {
  const { modo, toast, db } = useStore();
  const { cfg, setCfg } = useWhatsAppConfig();
  const [f, setF] = useState({ phoneNumberId: '', wabaId: '', token: '', appSecret: '', modeloNome: '', modeloIdioma: 'pt_BR' });
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState('');
  useEffect(() => {
    if (cfg) setF((x) => ({ ...x, phoneNumberId: cfg.phoneNumberId, wabaId: cfg.wabaId, modeloNome: cfg.modelo?.nome ?? '', modeloIdioma: cfg.modelo?.idioma || 'pt_BR' }));
  }, [cfg]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const recebidas = db.mensagens.filter((m) => m.direcao === 'Recebida').length;
  const enviadas = db.mensagens.filter((m) => m.direcao === 'Enviada').length;

  const salvar = async () => {
    setSalvando(true); setFalha('');
    try {
      const novo = await call<WhatsAppConfig>('/whatsapp/config', {
        method: 'PUT',
        body: JSON.stringify({ phoneNumberId: f.phoneNumberId, wabaId: f.wabaId, token: f.token, appSecret: f.appSecret, modelo: { nome: f.modeloNome, idioma: f.modeloIdioma } }),
      });
      setCfg(novo); setEditando(false); setF((x) => ({ ...x, token: '', appSecret: '' }));
      toast(`WhatsApp Business conectado: ${novo.numero || novo.phoneNumberId}.`);
    } catch (e) { setFalha((e as Error).message); } finally { setSalvando(false); }
  };
  const testar = async () => {
    try {
      const r = await call<{ numero: string; nome: string; qualidade: string }>('/whatsapp/testar', { method: 'POST' });
      toast(`Conexão OK: ${r.nome} · ${r.numero} · qualidade ${r.qualidade}.`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const desconectar = async () => {
    try { await call('/whatsapp/config', { method: 'DELETE' }); setCfg(null); setEditando(false); toast('WhatsApp Business desconectado. Os envios voltam a usar o link do WhatsApp.', 'info'); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const conectado = !!cfg?.configurado;
  const temCfg = !!cfg?.phoneNumberId;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3 className="row"><MessageCircle size={16} className="text-whatsapp" /> WhatsApp Business</h3>
        {modo === 'remote' && <Badge tone={conectado ? 'green' : 'gray'}>{conectado ? 'Conectado' : 'Modo link'}</Badge>}
      </div>
      <div className="card-pad" style={{ display: 'grid', gap: 14 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Envie orçamentos, avisos de serviço e cobranças pelo WhatsApp. <strong>Sem conexão</strong>, o sistema abre o WhatsApp com a mensagem pronta (modo link).
          <strong> Conectado à API oficial da Meta</strong>, as mensagens saem direto do sistema, as respostas dos clientes ficam no histórico e contatos novos viram oportunidades no Funil.
        </p>
        {modo !== 'remote' ? (
          <div className="small muted">A conexão com a API está disponível na versão publicada (com servidor). Neste modo, os envios usam o link do WhatsApp.</div>
        ) : !temCfg && !editando ? (
          <div className="row"><button className="btn btn-whatsapp" onClick={() => setEditando(true)}>Conectar WhatsApp Business</button></div>
        ) : (
          <>
            {conectado && !editando && (
              <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
                <div><div className="small muted">Número</div><div className="strong">{cfg?.numero || cfg?.phoneNumberId}</div></div>
                <div><div className="small muted">Nome verificado</div><div className="strong">{cfg?.nomeVerificado || '—'}</div></div>
                <div><div className="small muted">Mensagens</div><div className="strong">{enviadas} enviadas · {recebidas} recebidas</div></div>
                <div><div className="small muted">Último evento recebido</div><div className="strong">{cfg?.ultimoEvento ? dateTime(cfg.ultimoEvento) : 'nenhum ainda'}</div></div>
              </div>
            )}
            {(editando || !conectado) && (
              <div className="form-grid">
                <Field label="Identificação do número (Phone number ID)" hint="Meta for Developers → seu app → WhatsApp → Configuração da API">
                  <input className="input" value={f.phoneNumberId} onChange={(e) => set('phoneNumberId', e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                </Field>
                <Field label="Conta do WhatsApp Business (WABA ID)" hint="Opcional; ajuda a localizar a conta na Meta">
                  <input className="input" value={f.wabaId} onChange={(e) => set('wabaId', e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                </Field>
                <Field label="Token de acesso permanente" hint={cfg?.token ? `Salvo (${cfg.token}). Deixe em branco para manter.` : 'Gerado para um usuário do sistema no Gerenciador de Negócios'}>
                  <input className="input" type="password" autoComplete="off" value={f.token} onChange={(e) => set('token', e.target.value)} />
                </Field>
                <Field label="Chave secreta do app (App secret)" hint={cfg?.appSecret ? `Salva (${cfg.appSecret}). Deixe em branco para manter.` : 'Configurações do app → Básico; autentica as mensagens recebidas'}>
                  <input className="input" type="password" autoComplete="off" value={f.appSecret} onChange={(e) => set('appSecret', e.target.value)} />
                </Field>
                <Field label="Modelo aprovado (opcional)" hint="Usado fora da janela de 24 h. Corpo com {{1}} = nome do cliente e {{2}} = mensagem">
                  <input className="input" value={f.modeloNome} onChange={(e) => set('modeloNome', e.target.value)} placeholder="ex.: aviso_cliente" />
                </Field>
                <Field label="Idioma do modelo">
                  <input className="input" value={f.modeloIdioma} onChange={(e) => set('modeloIdioma', e.target.value)} />
                </Field>
                {falha && <div className="full alert-erro">{falha}</div>}
              </div>
            )}
            {temCfg && cfg && (
              <div className="form-grid">
                <Field label="URL de retorno (webhook)" full hint="Cole no app da Meta: WhatsApp → Configuração → Webhook; assine o campo messages">
                  <Copiavel valor={cfg.webhookUrl} />
                </Field>
                <Field label="Token de verificação" full>
                  <Copiavel valor={cfg.verifyToken} />
                </Field>
              </div>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {(editando || !conectado) ? (
                <>
                  <button className="btn btn-whatsapp" disabled={salvando || !f.phoneNumberId} onClick={salvar}>{salvando ? 'Validando na Meta…' : 'Salvar e validar'}</button>
                  {conectado && <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>}
                </>
              ) : (
                <>
                  <button className="btn" onClick={testar}>Testar conexão</button>
                  <button className="btn" onClick={() => setEditando(true)}>Alterar credenciais</button>
                  <button className="btn" style={{ color: 'var(--danger)' }} onClick={desconectar}>Desconectar</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
