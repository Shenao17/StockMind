import { useLocation } from 'react-router-dom';

/** RouteProgress — Línea fina de degradado que recorre el borde superior al cambiar de pantalla. */
export default function RouteProgress() {
  const { pathname } = useLocation();
  return <div className="route-progress" key={pathname} aria-hidden="true"><i /></div>;
}
