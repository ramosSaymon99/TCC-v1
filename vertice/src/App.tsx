import { useEffect, useState } from 'react';
import { CalendarCheck, Home as HomeIcon, Scissors } from 'lucide-react';
import { SHOP, isPast } from './data';
import { useBookings } from './store';
import Home from './components/Home';
import BookingFlow from './components/BookingFlow';
import MyBookings from './components/MyBookings';

type Route = { page: 'home' | 'agendar' | 'meus'; params: URLSearchParams };

function parseHash(): Route {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const page = path === 'agendar' || path === 'meus' ? path : 'home';
  return { page, params: new URLSearchParams(query) };
}

export function go(path: string) {
  window.location.hash = `/${path}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const store = useBookings();

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const upcoming = store.bookings.filter((b) => b.status === 'confirmado' && !isPast(b)).length;

  const nav = [
    { page: 'home', label: 'Início', icon: HomeIcon, href: '' },
    { page: 'agendar', label: 'Agendar', icon: Scissors, href: 'agendar' },
    { page: 'meus', label: 'Meus horários', icon: CalendarCheck, href: 'meus', badge: upcoming },
  ] as const;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden>
            V
          </span>
          <span>{SHOP.name}</span>
        </a>
        <nav className="topnav" aria-label="Principal">
          {nav.map((n) => (
            <a key={n.page} href={`#/${n.href}`} className={route.page === n.page ? 'active' : ''}>
              {n.label}
              {'badge' in n && n.badge > 0 && <span className="badge">{n.badge}</span>}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {route.page === 'home' && <Home />}
        {route.page === 'agendar' && (
          <BookingFlow
            key={route.params.toString()}
            store={store}
            initialService={route.params.get('s')}
            initialPro={route.params.get('p')}
            rescheduleId={route.params.get('r')}
          />
        )}
        {route.page === 'meus' && <MyBookings store={store} />}
      </main>

      <nav className="bottomnav" aria-label="Principal">
        {nav.map((n) => (
          <a key={n.page} href={`#/${n.href}`} className={route.page === n.page ? 'active' : ''}>
            <span className="icon-wrap">
              <n.icon size={20} />
              {'badge' in n && n.badge > 0 && <span className="dot">{n.badge}</span>}
            </span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
