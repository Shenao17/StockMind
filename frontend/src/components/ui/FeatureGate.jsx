import { Link } from 'react-router-dom';
import { useSubscription } from '../../context/subscriptionState';

const NAMES = {
  REPORTS: 'Los reportes',
  PREDICTIONS: 'Las predicciones de demanda',
  AI_ASSISTANT: 'El asistente con IA',
};

/** Muestra su contenido solo si el plan incluye la función; si no, invita a mejorar el plan. */
export default function FeatureGate({ feature, children }) {
  const { hasFeature, subscription } = useSubscription();
  if (hasFeature(feature)) return children;

  return (
    <div className="upgrade-prompt">
      <div className="upgrade-icon" aria-hidden="true">🔒</div>
      <h2>{NAMES[feature] || 'Esta función'} no está incluida en tu plan {subscription?.planName}</h2>
      <p>Mejora tu plan para desbloquearla. Tus datos y el resto de StockMind siguen funcionando igual.</p>
      <Link to="/billing" className="btn btn-primary">Ver planes</Link>
    </div>
  );
}
