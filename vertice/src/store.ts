import { useCallback, useEffect, useState } from 'react';
import { Booking, SHOP, fromISODate, proById, serviceById, toMinutes, pad, brl, longDate } from './data';

const KEY_BOOKINGS = 'vertice.bookings';
const KEY_PROFILE = 'vertice.profile';

export interface Profile {
  name: string;
  phone: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado ou armazenamento cheio: o app segue funcionando na sessão */
  }
}

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>(() => read<Booking[]>(KEY_BOOKINGS, []));
  const [profile, setProfileState] = useState<Profile>(() => read<Profile>(KEY_PROFILE, { name: '', phone: '' }));

  useEffect(() => write(KEY_BOOKINGS, bookings), [bookings]);

  const add = useCallback((b: Booking) => setBookings((list) => [...list, b]), []);
  const cancel = useCallback(
    (id: string) => setBookings((list) => list.map((b) => (b.id === id ? { ...b, status: 'cancelado' as const } : b))),
    [],
  );
  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    write(KEY_PROFILE, p);
  }, []);

  return { bookings, add, cancel, profile, setProfile };
}

export function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function whatsappLink(b: Booking) {
  const services = b.serviceIds.map((id) => serviceById(id).name).join(' + ');
  const msg =
    `Olá! Acabei de agendar pelo app:\n` +
    `• ${services} com ${proById(b.proId).name}\n` +
    `• ${longDate(b.date)} às ${b.time}\n` +
    `• Total: ${brl(b.total)}\n` +
    `Código: ${b.code} · ${b.name}`;
  return `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(msg)}`;
}

/** Arquivo .ics para o cliente salvar o horário na agenda do celular (Google, Apple, Outlook). */
export function downloadIcs(b: Booking) {
  const start = fromISODate(b.date);
  start.setMinutes(toMinutes(b.time));
  const end = new Date(start.getTime() + b.duration * 60000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const services = b.serviceIds.map((id) => serviceById(id).name).join(' + ');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vertice Barbearia//Agendamento//PT',
    'BEGIN:VEVENT',
    `UID:${b.id}@vertice`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${services} · ${SHOP.name}`,
    `DESCRIPTION:Com ${proById(b.proId).name}. Código ${b.code}.`,
    `LOCATION:${SHOP.address.replace(/,/g, '\\,')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Seu horário na Vértice é daqui a 2 horas',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `vertice-${b.date}-${b.time.replace(':', '')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
