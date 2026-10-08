import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Check, CheckCircle2, Clock, MessageCircle, Sparkles, Star, Users } from 'lucide-react';
import {
  Booking,
  COUPONS,
  PROS,
  SERVICES,
  WEEKDAYS_SHORT,
  anyProSlots,
  brl,
  duration as fmtDuration,
  formatPhone,
  freeSlots,
  longDate,
  proById,
  serviceById,
  toISODate,
  toMinutes,
  upcomingDays,
} from '../data';
import { downloadIcs, newCode, useBookings, whatsappLink } from '../store';

type Store = ReturnType<typeof useBookings>;
const STEPS = ['Serviço', 'Profissional', 'Horário', 'Seus dados'];
const ANY = 'any';

interface Props {
  store: Store;
  initialService: string | null;
  initialPro: string | null;
  rescheduleId: string | null;
}

export default function BookingFlow({ store, initialService, initialPro, rescheduleId }: Props) {
  const rescheduling = store.bookings.find((b) => b.id === rescheduleId && b.status === 'confirmado');
  // ao remarcar, o horário antigo conta como livre para a nova escolha
  const own = useMemo(() => store.bookings.filter((b) => b.id !== rescheduling?.id), [store.bookings, rescheduling?.id]);
  const presetServices = (initialService ?? '').split(',').filter((id) => SERVICES.some((s) => s.id === id));
  const validPro = initialPro && PROS.some((p) => p.id === initialPro) ? initialPro : null;

  const [step, setStep] = useState(presetServices.length ? (validPro ? 2 : 1) : 0);
  const [serviceIds, setServiceIds] = useState<string[]>(presetServices);
  const [proId, setProId] = useState<string>(validPro ?? ANY);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [name, setName] = useState(store.profile.name);
  const [phone, setPhone] = useState(store.profile.phone);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  const [done, setDone] = useState<Booking | null>(null);

  const services = serviceIds.map(serviceById);
  const totalDuration = services.reduce((s, x) => s + x.duration, 0);
  const subtotal = services.reduce((s, x) => s + x.price, 0);
  const discount = coupon ? Math.round(subtotal * COUPONS[coupon].percent) / 100 : 0;
  const total = subtotal - discount;

  // horários disponíveis por dia para a combinação atual de serviço + profissional
  const days = useMemo(() => {
    return upcomingDays().map((d) => {
      const iso = toISODate(d);
      const slots: Map<string, string> =
        totalDuration === 0
          ? new Map()
          : proId === ANY
            ? anyProSlots(iso, totalDuration, own)
            : new Map(freeSlots(proById(proId), iso, totalDuration, own).map((s) => [s, proId]));
      return { d, iso, slots };
    });
  }, [proId, totalDuration, own]);

  // mantém a data e o horário coerentes quando o serviço ou o profissional muda
  useEffect(() => {
    const current = days.find((x) => x.iso === date);
    if (!current || current.slots.size === 0) {
      const first = days.find((x) => x.slots.size > 0);
      setDate(first?.iso ?? '');
      setTime('');
    } else if (time && !current.slots.has(time)) {
      setTime('');
    }
  }, [days]);

  const selectedDay = days.find((x) => x.iso === date);
  const assignedPro = time && selectedDay ? selectedDay.slots.get(time) : undefined;
  const phoneDigits = phone.replace(/\D/g, '');
  const hasHistory = store.bookings.some((b) => b.status === 'confirmado' || b.coupon);

  function toggleService(id: string) {
    setServiceIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      // o combo substitui corte e barba avulsos (e vice-versa)
      if (id === 'combo') return [...cur.filter((x) => x !== 'corte' && x !== 'barba'), id];
      if (id === 'corte' || id === 'barba') return [...cur.filter((x) => x !== 'combo'), id];
      return [...cur, id];
    });
  }

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    const c = COUPONS[code];
    if (!c) return setCouponError('Cupom não encontrado.');
    if (c.firstVisitOnly && hasHistory) return setCouponError('Este cupom vale só para a primeira visita.');
    setCoupon(code);
    setCouponError('');
  }

  const canNext = [
    serviceIds.length > 0,
    true,
    Boolean(date && time && assignedPro),
    name.trim().length >= 2 && (phoneDigits.length === 10 || phoneDigits.length === 11),
  ][step];

  function confirm() {
    if (!assignedPro) return;
    const booking: Booking = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      code: newCode(),
      serviceIds,
      proId: assignedPro,
      date,
      time,
      duration: totalDuration,
      subtotal,
      discount,
      total,
      coupon: coupon ?? undefined,
      name: name.trim(),
      phone: formatPhone(phone),
      createdAt: new Date().toISOString(),
      status: 'confirmado',
    };
    if (rescheduling) store.cancel(rescheduling.id);
    store.add(booking);
    store.setProfile({ name: booking.name, phone: booking.phone });
    setDone(booking);
    window.scrollTo({ top: 0 });
  }

  function next() {
    if (!canNext) return;
    if (step === 3) return confirm();
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  if (done) return <Success booking={done} />;

  const comboHint = serviceIds.includes('corte') && serviceIds.includes('barba');
  const groups = selectedDay ? groupSlots([...selectedDay.slots.keys()]) : [];

  return (
    <div className="flow">
      <div className="flow-head">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <a className="icon-btn" href="#/" aria-label="Voltar ao início">
            <ArrowLeft size={20} />
          </a>
        )}
        <ol className="stepper" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
              <button disabled={i > step} onClick={() => setStep(i)}>
                <span className="num">{i < step ? <Check size={12} /> : i + 1}</span>
                <span className="label">{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {rescheduling && (
        <div className="notice">
          Remarcando o horário de <strong className="cap">{longDate(rescheduling.date)}</strong> às {rescheduling.time}. Ele só é
          liberado quando você confirmar o novo.
        </div>
      )}

      {step === 0 && (
        <section>
          <h1 className="flow-title">O que vamos fazer hoje?</h1>
          <p className="muted">Pode escolher mais de um serviço.</p>
          <div className="choice-list">
            {SERVICES.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button key={s.id} className={`choice ${on ? 'on' : ''}`} onClick={() => toggleService(s.id)} aria-pressed={on}>
                  <span className="check">{on && <Check size={14} />}</span>
                  <span className="choice-body">
                    <span className="choice-title">
                      {s.name} {s.popular && <span className="tag">Mais pedido</span>}
                    </span>
                    <span className="muted small">{s.description}</span>
                  </span>
                  <span className="choice-side">
                    <strong>{brl(s.price)}</strong>
                    <span className="muted small">{fmtDuration(s.duration)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {comboHint && (
            <button className="hint" onClick={() => setServiceIds((cur) => ['combo', ...cur.filter((x) => x !== 'corte' && x !== 'barba')])}>
              <Sparkles size={16} />
              <span>
                Troque por <strong>Corte + Barba</strong> e economize{' '}
                {brl(serviceById('corte').price + serviceById('barba').price - serviceById('combo').price)}.
              </span>
              <span className="hint-cta">Trocar</span>
            </button>
          )}
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="flow-title">Com quem?</h1>
          <div className="choice-list">
            <button className={`choice ${proId === ANY ? 'on' : ''}`} onClick={() => setProId(ANY)} aria-pressed={proId === ANY}>
              <span className="avatar sm any">
                <Users size={18} />
              </span>
              <span className="choice-body">
                <span className="choice-title">Qualquer profissional</span>
                <span className="muted small">Mostra todos os horários livres da casa</span>
              </span>
            </button>
            {PROS.map((p) => {
              const nextFree = upcomingDays().find((d) => freeSlots(p, toISODate(d), totalDuration, own).length > 0);
              return (
                <button key={p.id} className={`choice ${proId === p.id ? 'on' : ''}`} onClick={() => setProId(p.id)} aria-pressed={proId === p.id}>
                  <span className="avatar sm" style={{ background: p.tone }}>
                    {p.initials}
                  </span>
                  <span className="choice-body">
                    <span className="choice-title">{p.name}</span>
                    <span className="muted small">
                      {p.role} · <Star size={11} fill="currentColor" className="star" /> {p.rating}
                    </span>
                  </span>
                  <span className="choice-side small muted">
                    {nextFree ? `livre ${shortDay(nextFree)}` : 'sem horários'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="flow-title">Quando?</h1>
          <p className="muted">
            {fmtDuration(totalDuration)} de atendimento{proId !== ANY && ` com ${proById(proId).name.split(' ')[0]}`}.
          </p>
          <div className="day-strip" role="listbox" aria-label="Dia">
            {days.map(({ d, iso, slots }) => (
              <button
                key={iso}
                role="option"
                aria-selected={iso === date}
                disabled={slots.size === 0}
                className={`day ${iso === date ? 'on' : ''}`}
                onClick={() => {
                  setDate(iso);
                  setTime('');
                }}
              >
                <span className="wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
                <span className="dn">{d.getDate()}</span>
                <span className="avail">{slots.size === 0 ? '—' : slots.size <= 4 ? 'poucos' : `${slots.size} livres`}</span>
              </button>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="empty">Nenhum horário livre nesse período. Tente outro profissional.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="slot-group">
                <h3>{g.label}</h3>
                <div className="slots">
                  {g.slots.map((s) => (
                    <button key={s} className={`slot ${s === time ? 'on' : ''}`} onClick={() => setTime(s)} aria-pressed={s === time}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {assignedPro && proId === ANY && (
            <p className="muted small assigned">
              Você será atendido por <strong>{proById(assignedPro).name}</strong>.
            </p>
          )}
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="flow-title">Quase lá</h1>
          <div className="summary-card">
            <div className="row">
              <Calendar size={16} />
              <span>
                <strong className="cap">{longDate(date)}</strong> às <strong>{time}</strong>
              </span>
            </div>
            <div className="row">
              <Clock size={16} />
              <span>
                {services.map((s) => s.name).join(' + ')} · {fmtDuration(totalDuration)}
              </span>
            </div>
            {assignedPro && (
              <div className="row">
                <span className="avatar xs" style={{ background: proById(assignedPro).tone }}>
                  {proById(assignedPro).initials}
                </span>
                <span>{proById(assignedPro).name}</span>
              </div>
            )}
          </div>

          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como podemos te chamar?" autoComplete="name" />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              inputMode="tel"
              autoComplete="tel"
            />
            <small className="muted">Usamos só para lembrar você do horário.</small>
          </label>

          <div className="field">
            <span>Cupom</span>
            {coupon ? (
              <div className="coupon-ok">
                <CheckCircle2 size={16} /> {coupon}: {COUPONS[coupon].label}
                <button className="link" onClick={() => setCoupon(null)}>
                  remover
                </button>
              </div>
            ) : (
              <div className="coupon">
                <input
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value);
                    setCouponError('');
                  }}
                  placeholder={hasHistory ? 'Código do cupom' : 'Primeira vez? Use PRIMEIRA10'}
                />
                <button className="btn btn-ghost" onClick={applyCoupon} disabled={!couponInput.trim()}>
                  Aplicar
                </button>
              </div>
            )}
            {couponError && <small className="error">{couponError}</small>}
          </div>

          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="disc">
                <span>Desconto</span>
                <span>− {brl(discount)}</span>
              </div>
            )}
            <div className="grand">
              <span>Total (pago na barbearia)</span>
              <span>{brl(total)}</span>
            </div>
          </div>
        </section>
      )}

      <div className="actionbar">
        <div className="actionbar-info">
          {serviceIds.length === 0 ? (
            <span className="muted">Escolha ao menos um serviço</span>
          ) : (
            <>
              <strong>{brl(total)}</strong>
              <span className="muted small">
                {serviceIds.length} {serviceIds.length === 1 ? 'serviço' : 'serviços'} · {fmtDuration(totalDuration)}
                {time && ` · ${time}`}
              </span>
            </>
          )}
        </div>
        <button className="btn btn-primary" disabled={!canNext} onClick={next}>
          {step === 3 ? 'Confirmar agendamento' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

function shortDay(d: Date) {
  const iso = toISODate(d);
  if (iso === toISODate(new Date())) return 'hoje';
  if (iso === toISODate(new Date(Date.now() + 864e5))) return 'amanhã';
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
}

function groupSlots(slots: string[]) {
  const groups = [
    { label: 'Manhã', slots: slots.filter((s) => toMinutes(s) < 12 * 60) },
    { label: 'Tarde', slots: slots.filter((s) => toMinutes(s) >= 12 * 60 && toMinutes(s) < 18 * 60) },
    { label: 'Noite', slots: slots.filter((s) => toMinutes(s) >= 18 * 60) },
  ];
  return groups.filter((g) => g.slots.length > 0);
}

function Success({ booking }: { booking: Booking }) {
  const pro = proById(booking.proId);
  return (
    <div className="success">
      <div className="success-icon">
        <CheckCircle2 size={44} />
      </div>
      <h1>Horário confirmado!</h1>
      <p className="muted">
        Te esperamos, {booking.name.split(' ')[0]}. Chegue 5 minutos antes, o café é por nossa conta.
      </p>

      <div className="ticket">
        <div className="ticket-row">
          <span className="muted small">Código</span>
          <strong className="code">{booking.code}</strong>
        </div>
        <div className="ticket-row">
          <span className="muted small">Quando</span>
          <strong className="cap">
            {longDate(booking.date)}, {booking.time}
          </strong>
        </div>
        <div className="ticket-row">
          <span className="muted small">Serviço</span>
          <strong>{booking.serviceIds.map((id) => serviceById(id).name).join(' + ')}</strong>
        </div>
        <div className="ticket-row">
          <span className="muted small">Profissional</span>
          <strong>{pro.name}</strong>
        </div>
        <div className="ticket-row">
          <span className="muted small">Total</span>
          <strong>
            {brl(booking.total)}
            {booking.discount > 0 && <span className="saved"> (economizou {brl(booking.discount)})</span>}
          </strong>
        </div>
      </div>

      <div className="success-actions">
        <a className="btn btn-whats" href={whatsappLink(booking)} target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> Enviar confirmação no WhatsApp
        </a>
        <button className="btn btn-ghost" onClick={() => downloadIcs(booking)}>
          <Calendar size={18} /> Adicionar à minha agenda
        </button>
        <a className="btn btn-link" href="#/meus">
          Ver meus horários
        </a>
      </div>
    </div>
  );
}
