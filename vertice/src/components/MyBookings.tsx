import { useState } from 'react';
import { Calendar, CalendarX, Gift, MessageCircle, RotateCcw, Scissors } from 'lucide-react';
import { Booking, LOYALTY_GOAL, brl, duration, isPast, longDate, proById, serviceById, toMinutes } from '../data';
import { downloadIcs, useBookings, whatsappLink } from '../store';

type Store = ReturnType<typeof useBookings>;

const byDate = (a: Booking, b: Booking) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time);

export default function MyBookings({ store }: { store: Store }) {
  const active = store.bookings.filter((b) => b.status === 'confirmado');
  const upcoming = active.filter((b) => !isPast(b)).sort(byDate);
  const history = store.bookings.filter((b) => b.status === 'cancelado' || isPast(b)).sort((a, b) => byDate(b, a));

  // cada atendimento concluído vale um selo; os agendados aparecem como "a caminho"
  const attended = active.filter((b) => isPast(b)).length;
  const stamps = attended % LOYALTY_GOAL;
  const rewards = Math.floor(attended / LOYALTY_GOAL);
  const pending = Math.min(upcoming.length, LOYALTY_GOAL - stamps);

  if (store.bookings.length === 0) {
    return (
      <div className="empty-state">
        <Scissors size={36} />
        <h1>Nenhum horário ainda</h1>
        <p className="muted">Seu primeiro agendamento leva menos de um minuto, e tem 10% de desconto com o cupom PRIMEIRA10.</p>
        <a className="btn btn-primary btn-lg" href="#/agendar">
          Agendar meu horário
        </a>
      </div>
    );
  }

  return (
    <div className="mine">
      <h1 className="page-title">Meus horários</h1>

      <section className="loyalty">
        <div className="loyalty-head">
          <div>
            <h2>
              <Gift size={18} /> Cartão fidelidade
            </h2>
            <p className="small">
              {rewards > 0
                ? `Você tem ${rewards} corte${rewards > 1 ? 's' : ''} grátis para usar!`
                : `Faltam ${LOYALTY_GOAL - stamps} atendimentos para o corte grátis.`}
            </p>
          </div>
          <span className="loyalty-count">
            {stamps}/{LOYALTY_GOAL}
          </span>
        </div>
        <div className="stamps" aria-label={`${stamps} de ${LOYALTY_GOAL} selos`}>
          {Array.from({ length: LOYALTY_GOAL }, (_, i) => (
            <span key={i} className={`stamp ${i < stamps ? 'on' : i < stamps + pending ? 'pending' : ''}`}>
              {i === LOYALTY_GOAL - 1 ? <Gift size={14} /> : <Scissors size={14} />}
            </span>
          ))}
        </div>
        {pending > 0 && <p className="small soft">Os selos tracejados entram assim que você for atendido.</p>}
      </section>

      <section>
        <h2 className="sub">Próximos</h2>
        {upcoming.length === 0 ? (
          <div className="card empty-inline">
            <span className="muted">Nada agendado.</span>
            <a className="btn btn-primary" href="#/agendar">
              Agendar
            </a>
          </div>
        ) : (
          upcoming.map((b) => <UpcomingCard key={b.id} booking={b} onCancel={() => store.cancel(b.id)} />)
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="sub">Histórico</h2>
          <ul className="history">
            {history.map((b) => (
              <li key={b.id} className={b.status === 'cancelado' ? 'cancelled' : ''}>
                <div>
                  <strong>{b.serviceIds.map((id) => serviceById(id).name).join(' + ')}</strong>
                  <span className="muted small cap">
                    {longDate(b.date)} · {b.time} · {proById(b.proId).name.split(' ')[0]}
                  </span>
                </div>
                <div className="history-side">
                  <span className={`pill ${b.status === 'cancelado' ? 'pill-off' : 'pill-ok'}`}>
                    {b.status === 'cancelado' ? 'Cancelado' : 'Atendido'}
                  </span>
                  <a className="link small" href={`#/agendar?s=${b.serviceIds.join(',')}&p=${b.proId}`}>
                    <RotateCcw size={12} /> Repetir
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function UpcomingCard({ booking: b, onCancel }: { booking: Booking; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const pro = proById(b.proId);
  const hoursLeft = (new Date(`${b.date}T${b.time}:00`).getTime() - Date.now()) / 36e5;

  return (
    <article className="card booking-card">
      <div className="booking-when">
        <span className="cap">{longDate(b.date)}</span>
        <strong>{b.time}</strong>
        {hoursLeft < 24 && <span className="tag">Em {Math.max(1, Math.round(hoursLeft))}h</span>}
      </div>
      <div className="booking-what">
        <span className="avatar xs" style={{ background: pro.tone }}>
          {pro.initials}
        </span>
        <span>
          {b.serviceIds.map((id) => serviceById(id).name).join(' + ')} com {pro.name.split(' ')[0]}
        </span>
      </div>
      <div className="muted small">
        {duration(b.duration)} · {brl(b.total)} · código <strong>{b.code}</strong>
      </div>

      {confirming ? (
        <div className="cancel-confirm">
          <span>Cancelar este horário? Ele fica livre para outro cliente.</span>
          <div>
            <button className="btn btn-danger" onClick={onCancel}>
              Sim, cancelar
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Manter
            </button>
          </div>
        </div>
      ) : (
        <div className="booking-actions">
          <a className="btn btn-ghost sm" href={whatsappLink(b)} target="_blank" rel="noreferrer">
            <MessageCircle size={16} /> WhatsApp
          </a>
          <button className="btn btn-ghost sm" onClick={() => downloadIcs(b)}>
            <Calendar size={16} /> Agenda
          </button>
          <a
            className="btn btn-ghost sm"
            href={`#/agendar?s=${b.serviceIds.join(',')}&p=${b.proId}&r=${b.id}`}
            title="Escolha um novo horário; este só é liberado quando você confirmar o novo"
          >
            <RotateCcw size={16} /> Remarcar
          </a>
          <button className="btn btn-ghost sm danger" onClick={() => setConfirming(true)}>
            <CalendarX size={16} /> Cancelar
          </button>
        </div>
      )}
    </article>
  );
}
