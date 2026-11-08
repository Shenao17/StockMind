/** NavIcon — Íconos de línea del menú, las pestañas y la barra inferior (un solo estilo para toda la app). */
const PATHS = {
  security: <><path d="M12 3 5 6v5c0 4.5 2.9 8.2 7 10 4.1-1.8 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  products: <><path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
  inventory: <><path d="M4 7h16M4 12h16M4 17h16M7 4v16" /></>,
  sales: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-6" /></>,
  predictions: <><path d="M4 17 9 12l3 3 8-9" /><path d="M16 6h4v4M4 20h16" /></>,
  reports: <><path d="M6 3h9l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  billing: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  users: <><circle cx="12" cy="8" r="4" /><path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  chevron: <path d="m15 6-6 6 6 6" />,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h3l2.5 11h10l2-8H7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  building: <><path d="M4 21V6l8-3 8 3v15" /><path d="M9 21v-5h6v5M8 10h2M14 10h2M8 13h2M14 13h2" /></>,
  money: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.8-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.7 2.5-1.7" /></>,
  inbox: <><path d="M4 13 6 5h12l2 8v6H4v-6Z" /><path d="M4 13h5l1 2h4l1-2h5" /></>,
  audit: <><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="8" cy="8" r="1.3" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.3 2.3 3.5 5.5" /></>,
};

export default function NavIcon({ type, className = 'nav-icon-svg' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[type]}
    </svg>
  );
}
