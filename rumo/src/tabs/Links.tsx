import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Copy, Download, QrCode } from 'lucide-react';
import { CHANNELS, ChannelId, brl, slugify } from '../model';
import { AppState } from '../state';
import type { Update } from '../App';
import { Card, Dot, copyText, csv, downloadFile } from '../ui';

interface Props {
  state: AppState;
  update: Update;
}

export function buildUrl(base: string, params: Record<string, string>) {
  try {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return '';
  }
}

export function useLinks(state: AppState) {
  const c = state.campaign;
  const slug = slugify(c.name) || 'campanha';
  return useMemo(
    () =>
      CHANNELS.filter((ch) => c.alloc[ch.id] >= 0.02).map((ch) => {
        const content = state.utmContent[ch.id] ?? '';
        return {
          channel: ch,
          content,
          url: buildUrl(c.url, {
            utm_source: ch.utmSource,
            utm_medium: ch.utmMedium,
            utm_campaign: slug,
            utm_content: slugify(content),
          }),
        };
      }),
    [c.alloc, c.url, slug, state.utmContent],
  );
}

export default function Links({ state, update }: Props) {
  const c = state.campaign;
  const links = useLinks(state);
  const [selected, setSelected] = useState<ChannelId | null>(links[0]?.channel.id ?? null);
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const urlValid = buildUrl(c.url, {}) !== '';
  const current = links.find((l) => l.channel.id === selected) ?? links[0];

  useEffect(() => {
    if (!current?.url) return setQr('');
    QRCode.toDataURL(current.url, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [current?.url]);

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  };

  const exportCsv = () =>
    downloadFile(
      `links-${slugify(c.name)}.csv`,
      csv([
        ['Canal', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Verba', 'URL'],
        ...links.map((l) => [
          l.channel.name,
          l.channel.utmSource,
          l.channel.utmMedium,
          slugify(c.name),
          slugify(l.content),
          brl(c.budget * c.alloc[l.channel.id]),
          l.url,
        ]),
      ]),
      'text/csv',
    );

  return (
    <div className="links">
      <div className="links-main">
        <Card title="Destino">
          <label className="field">
            <span className="field-label">URL da página da campanha</span>
            <input
              value={c.url}
              onChange={(e) => update((s) => ({ ...s, campaign: { ...s.campaign, url: e.target.value.trim() } }))}
              placeholder="https://seusite.com.br/oferta"
              className={urlValid ? '' : 'invalid'}
            />
            {!urlValid && (
              <span className="field-error">
                <AlertTriangle size={13} /> Informe a URL completa, começando com https://
              </span>
            )}
          </label>
          <p className="muted small">
            utm_campaign: <code>{slugify(c.name) || 'campanha'}</code> (gerado do nome da campanha, sem acentos). Use o mesmo padrão em
            todas as peças para o relatório do Google Analytics agrupar certo.
          </p>
        </Card>

        <Card
          title="Links por canal"
          action={
            <div className="btn-row">
              <button
                className="btn btn-ghost sm"
                disabled={!urlValid}
                onClick={() => copyText(links.map((l) => `${l.channel.short}: ${l.url}`).join('\n')).then(() => flash('all'))}
              >
                {copied === 'all' ? <Check size={15} /> : <Copy size={15} />} Copiar todos
              </button>
              <button className="btn btn-ghost sm" onClick={exportCsv} disabled={!urlValid}>
                <Download size={15} /> CSV
              </button>
            </div>
          }
        >
          {links.length === 0 && <p className="muted">Nenhum canal com verba. Distribua o orçamento no Simulador.</p>}
          <ul className="link-list">
            {links.map((l) => (
              <li key={l.channel.id} className={current?.channel.id === l.channel.id ? 'on' : ''}>
                <div className="link-head">
                  <span className="link-name">
                    <Dot color={l.channel.color} /> {l.channel.name}
                  </span>
                  <span className="muted small mono">
                    {l.channel.utmSource} / {l.channel.utmMedium}
                  </span>
                </div>
                <label className="field compact">
                  <span className="field-label">Variação do anúncio (utm_content)</span>
                  <input
                    value={l.content}
                    placeholder="ex.: video-depoimento, carrossel-oferta"
                    onChange={(e) => update((s) => ({ ...s, utmContent: { ...s.utmContent, [l.channel.id]: e.target.value } }))}
                  />
                </label>
                <div className="url-row">
                  <code className="url" title={l.url}>
                    {l.url || '—'}
                  </code>
                  <button
                    className="icon-btn"
                    disabled={!l.url}
                    aria-label={`Copiar link de ${l.channel.short}`}
                    onClick={() => copyText(l.url).then(() => flash(l.channel.id))}
                  >
                    {copied === l.channel.id ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  <button
                    className={`icon-btn ${current?.channel.id === l.channel.id ? 'active' : ''}`}
                    disabled={!l.url}
                    aria-label={`Ver QR code de ${l.channel.short}`}
                    onClick={() => setSelected(l.channel.id)}
                  >
                    <QrCode size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="links-side">
        <Card title="QR code">
          {current && qr ? (
            <div className="qr">
              <img src={qr} alt={`QR code do link de ${current.channel.short}`} />
              <span className="qr-channel">
                <Dot color={current.channel.color} /> {current.channel.name}
              </span>
              <button
                className="btn btn-primary"
                onClick={() => fetch(qr).then((r) => r.blob()).then((b) => downloadFile(`qr-${slugify(c.name)}-${current.channel.utmSource}.png`, b))}
              >
                <Download size={16} /> Baixar PNG
              </button>
              <p className="muted small">
                Use em material impresso, vitrine ou stories. Cada QR leva a UTM do canal, então dá para medir quantos acessos vieram dele.
              </p>
            </div>
          ) : (
            <p className="muted">Informe uma URL válida para gerar o QR code.</p>
          )}
        </Card>
      </aside>
    </div>
  );
}
