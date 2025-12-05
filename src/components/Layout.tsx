import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Header />
      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}


