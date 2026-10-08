import { useMemo } from 'react';
import { ArrowRight, Clock, MapPin, Star, Ticket, Zap } from 'lucide-react';
import {
  PROS,
  REVIEWS,
  SERVICES,
  SHOP,
  WEEKDAYS_SHORT,
  anyProSlots,
  brl,
  duration,
  openingHours,
  proById,
  toISODate,
  upcomingDays,
} from '../data';

/** Primeiro horário livre de um corte simples nos próximos dias, para mostrar disponibilidade real logo na capa. */
function useNextSlot() {
  return useMemo(() => {
    for (const d of upcomingDays(7)) {
      const iso = toISODate(d);
      const first = anyProSlots(iso, 30, []).entries().next();
      if (!first.done) return { date: d, time: first.value[0], pro: proById(first.value[1]) };
    }
    return null;
  }, []);
}

function dayLabel(d: Date) {
  const today = toISODate(new Date());
  const tomorrow = toISODate(new Date(Date.now() + 864e5));
  const iso = toISODate(d);
  if (iso === today) return 'hoje';
  if (iso === tomorrow) return 'amanhã';
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}

export default function Home() {
  const next = useNextSlot();
  const todayHours = openingHours(new Date().getDay());

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-inner">
          <span className="eyebrow">
            <Star size={14} fill="currentColor" /> {SHOP.rating.toFixed(1)} · {SHOP.reviews} avaliações no Google
          </span>
          <h1>
            Seu horário, <em>sem fila</em> e sem mandar mensagem.
          </h1>
          <p className="lead">{SHOP.tagline} Escolha o serviço, o barbeiro e o horário em menos de um minuto.</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#/agendar">
              Agendar agora <ArrowRight size={18} />
            </a>
            {next && (
              <a className="next-slot" href={`#/agendar?s=corte&p=${next.pro.id}`}>
                <Zap size={16} />
                <span>
                  Próximo horário livre: <strong>{dayLabel(next.date)} às {next.time}</strong> com {next.pro.name.split(' ')[0]}
                </span>
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="promo">
        <Ticket size={22} />
        <div>
          <strong>Primeira vez na Vértice?</strong> Use o cupom <code>PRIMEIRA10</code> e ganhe 10% de desconto. A cada 10
          atendimentos, o próximo corte é por nossa conta.
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Serviços</h2>
          <span className="muted">Preço fechado, sem surpresa no caixa</span>
        </div>
        <div className="service-grid">
          {SERVICES.map((s) => (
            <a key={s.id} className="service-card" href={`#/agendar?s=${s.id}`}>
              <div className="service-top">
                <h3>{s.name}</h3>
                {s.popular && <span className="tag">Mais pedido</span>}
              </div>
              <p>{s.description}</p>
              <div className="service-foot">
                <span className="price">{brl(s.price)}</span>
                <span className="muted">
                  <Clock size={14} /> {duration(s.duration)}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Quem vai te atender</h2>
        </div>
        <div className="pro-grid">
          {PROS.map((p) => (
            <a key={p.id} className="pro-card" href={`#/agendar?p=${p.id}`}>
              <span className="avatar" style={{ background: p.tone }}>
                {p.initials}
              </span>
              <div>
                <h3>{p.name}</h3>
                <p className="muted">{p.role}</p>
                <p className="small">
                  <Star size={13} fill="currentColor" className="star" /> {p.rating} ({p.reviews}) · desde {p.since}
                </p>
              </div>
              <ArrowRight size={18} className="chev" />
            </a>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>O que dizem</h2>
        </div>
        <div className="review-grid">
          {REVIEWS.map((r) => (
            <figure key={r.name} className="review">
              <div className="stars" aria-label={`${r.stars} estrelas`}>
                {'★'.repeat(r.stars)}
              </div>
              <blockquote>{r.text}</blockquote>
              <figcaption>{r.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section info">
        <div className="info-card">
          <h3>
            <Clock size={18} /> Horários
          </h3>
          <ul className="hours">
            <li className={todayHours && [2, 3, 4, 5].includes(new Date().getDay()) ? 'today' : ''}>
              <span>Terça a sexta</span>
              <span>09:00 – 20:00</span>
            </li>
            <li className={new Date().getDay() === 6 ? 'today' : ''}>
              <span>Sábado</span>
              <span>09:00 – 18:00</span>
            </li>
            <li className={!todayHours ? 'today' : ''}>
              <span>Domingo e segunda</span>
              <span>Fechado</span>
            </li>
          </ul>
        </div>
        <div className="info-card">
          <h3>
            <MapPin size={18} /> Onde estamos
          </h3>
          <p>{SHOP.address}</p>
          <a
            className="btn btn-ghost"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SHOP.address)}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no mapa
          </a>
        </div>
      </section>

      <footer className="footer">
        {SHOP.name} · {SHOP.instagram}
      </footer>
    </div>
  );
}
