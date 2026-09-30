import { useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Modulo, Perfil, Usuario } from '../types';
import { Avatar, Badge, Confirm, Modal, PageHeader } from '../components/ui';
import { Field, Options } from '../components/fields';
import { dateTime, uid } from '../utils/format';
import { MODULOS } from '../store/seed';

const PERFIS: Perfil[] = ['Proprietário', 'Operador', 'Financeiro', 'Técnico'];

export default function Usuarios() {
  const { db, user, upsert, remove, setPermissoes, toast } = useStore();
  const [perfil, setPerfil] = useState<Perfil>('Operador');
  const [perms, setPerms] = useState<Modulo[]>(db.permissoes['Operador']);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState<Usuario | null>(null);

  const trocarPerfil = (p: Perfil) => { setPerfil(p); setPerms(db.permissoes[p]); };
  const toggle = (m: Modulo) => setPerms((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m]));
  const donos = db.usuarios.filter((u) => u.perfil === 'Proprietário' && u.status === 'Ativo');

  return (
    <>
      <PageHeader title="Usuários e Permissões" subtitle="Controle quem pode acessar o sistema e o que cada um pode fazer.">
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), nome: '', email: '', perfil: 'Operador', status: 'Ativo', ultimoAcesso: '' })}><Plus size={16} /> Novo usuário</button>
      </PageHeader>

      <div className="grid g-3-2">
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th className="hide-sm">Último acesso</th><th className="right">Ações</th></tr></thead>
              <tbody>
                {db.usuarios.map((u) => (
                  <tr key={u.id}>
                    <td><div className="person"><Avatar nome={u.nome} /><div><div className="name">{u.nome}{u.id === user?.id && <span className="small muted"> (você)</span>}</div><div className="meta">{u.email}</div></div></div></td>
                    <td><Badge>{u.perfil}</Badge></td>
                    <td><Badge>{u.status}</Badge></td>
                    <td className="hide-sm nowrap">{u.ultimoAcesso ? dateTime(u.ultimoAcesso) : 'Nunca acessou'}</td>
                    <td className="right nowrap">
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => setEditing(u)}><Pencil size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" disabled={u.id === user?.id} onClick={() => setDeleting(u)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="row"><ShieldCheck size={16} color="var(--primary)" /> Permissões por perfil</h3></div>
          <div style={{ padding: '14px 20px 20px' }}>
            <Field label="Perfil">
              <select className="select" value={perfil} onChange={(e) => trocarPerfil(e.target.value as Perfil)}><Options items={PERFIS} /></select>
            </Field>
            <p className="small muted">
              {perfil === 'Proprietário' ? 'O proprietário sempre tem acesso completo.' : `Módulos que o perfil ${perfil} pode acessar. ${db.usuarios.filter((u) => u.perfil === perfil).length} usuário(s) com este perfil.`}
            </p>
            <div className="perm-grid">
              {MODULOS.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" disabled={perfil === 'Proprietário' || m.id === 'inicio'} checked={perfil === 'Proprietário' || perms.includes(m.id)} onChange={() => toggle(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} disabled={perfil === 'Proprietário'}
              onClick={() => { setPermissoes(perfil, perms.includes('inicio') ? perms : ['inicio', ...perms]); toast(`Permissões do perfil ${perfil} salvas.`); }}>
              Salvar permissões
            </button>
          </div>
        </div>
      </div>

      {editing && <UserForm u={editing} onClose={() => setEditing(null)} onSave={(u) => {
        if (!u.nome || !u.email) return toast('Preencha nome e e-mail.', 'error');
        if (db.usuarios.some((x) => x.id !== u.id && x.email.toLowerCase() === u.email.toLowerCase())) return toast('Já existe um usuário com este e-mail.', 'error');
        const eraDono = db.usuarios.find((x) => x.id === u.id)?.perfil === 'Proprietário';
        if (eraDono && (u.perfil !== 'Proprietário' || u.status !== 'Ativo') && donos.length <= 1) return toast('É preciso manter ao menos um proprietário ativo.', 'error');
        upsert('usuarios', u); toast('Usuário salvo. Senha inicial de demonstração: 123456.'); setEditing(null);
      }} />}
      {deleting && <Confirm text={<>Excluir o usuário <strong>{deleting.nome}</strong>?</>} onClose={() => setDeleting(null)} onConfirm={() => {
        if (deleting.perfil === 'Proprietário' && donos.length <= 1) return toast('É preciso manter ao menos um proprietário.', 'error');
        remove('usuarios', deleting.id); toast('Usuário excluído.');
      }} />}
    </>
  );
}

function UserForm({ u, onClose, onSave }: { u: Usuario; onClose: () => void; onSave: (u: Usuario) => void }) {
  const [f, setF] = useState(u);
  const set = <K extends keyof Usuario>(k: K, v: Usuario[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={u.nome ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="user-form">Salvar</button>
    </>}>
      <form id="user-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Nome" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Field>
        <Field label="E-mail" full><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></Field>
        <Field label="Perfil"><select className="select" value={f.perfil} onChange={(e) => set('perfil', e.target.value as Perfil)}><Options items={PERFIS} /></select></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Usuario['status'])}><Options items={['Ativo', 'Inativo'] as const} /></select></Field>
      </form>
    </Modal>
  );
}
