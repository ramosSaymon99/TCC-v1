import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { prepararFoto } from '../lib/image';

/** Foto de perfil com fallback em emoji. */
export function Avatar({ photo, emoji, color, size = 40, ring }: { photo?: string | null; emoji: string; color?: string | null; size?: number; ring?: boolean }) {
  const [erro, setErro] = useState(false);
  const comFoto = photo && !erro;
  return (
    <span
      className="av"
      style={{
        width: size, height: size, fontSize: size * 0.5,
        background: comFoto ? 'var(--surface-2)' : color || 'var(--surface-2)',
        borderColor: color && !comFoto ? 'transparent' : undefined,
        boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 4px ${color || 'var(--brand)'}` : undefined,
        overflow: 'hidden',
      }}
    >
      {comFoto ? <img src={photo!} alt="" onError={() => setErro(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : emoji}
    </span>
  );
}

/** Seletor de foto: galeria ou câmera do celular, com prévia e remoção. */
export function PhotoPicker({ photo, emoji, color, onPick, onRemove, disabled }: {
  photo?: string | null; emoji: string; color?: string | null; disabled?: boolean;
  onPick: (dataUrl: string) => Promise<unknown> | void; onRemove?: () => Promise<unknown> | void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  async function escolher(f?: File) {
    if (!f) return;
    setErro('');
    setBusy(true);
    try { await onPick(await prepararFoto(f)); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar a foto.'); }
    setBusy(false);
    if (ref.current) ref.current.value = '';
  }
  return (
    <div className="row" style={{ gap: 14 }}>
      <button type="button" className="photo-pick" disabled={disabled || busy} onClick={() => ref.current?.click()} aria-label="Escolher foto">
        <Avatar photo={photo} emoji={emoji} color={color} size={76} />
        <span className="photo-cam"><Camera size={15} /></span>
      </button>
      <div className="stack" style={{ gap: 6 }}>
        <button type="button" className="btn sm" disabled={disabled || busy} onClick={() => ref.current?.click()}>{busy ? 'Enviando…' : photo ? 'Trocar foto' : 'Adicionar foto'}</button>
        {photo && onRemove && <button type="button" className="btn sm ghost danger" disabled={disabled || busy} onClick={async () => { setBusy(true); await onRemove(); setBusy(false); }}><Trash2 size={14} /> Remover</button>}
        {erro && <span className="faint" style={{ color: 'var(--bad)' }}>{erro}</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => escolher(e.target.files?.[0])} />
    </div>
  );
}
