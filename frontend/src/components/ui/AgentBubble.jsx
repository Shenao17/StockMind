import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';


// ─── Estilos ────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=Inter:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  /* ── Burbuja flotante ── */
  .agent-fab {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    font-family: 'Inter', sans-serif;
  }

  /* ── Panel de chat ── */
  .agent-panel {
    width: 360px;
    height: 520px;
    background: #0e0e0e;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow:
      0 32px 64px rgba(0,0,0,0.6),
      0 0 0 1px rgba(139,26,46,0.15),
      inset 0 1px 0 rgba(255,255,255,0.04);
    transform-origin: bottom right;
    animation: panelOpen 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }

  @keyframes panelOpen {
    from {
      opacity: 0;
      transform: scale(0.85) translateY(12px);
    }

    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .agent-panel.closing {
    animation: panelClose 0.18s ease-in forwards;
  }

  @keyframes panelClose {
    from {
      opacity: 1;
      transform: scale(1) translateY(0);
    }

    to {
      opacity: 0;
      transform: scale(0.88) translateY(8px);
    }
  }

  /* ── Header ── */
  .agent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    background: linear-gradient(
      135deg,
      #1a0a0e 0%,
      #110608 100%
    );
    border-bottom: 1px solid rgba(139,26,46,0.2);
    flex-shrink: 0;
  }

  .agent-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .agent-avatar {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: linear-gradient(
      135deg,
      #8B1A2E,
      #5c0f1e
    );
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    box-shadow: 0 0 12px rgba(139,26,46,0.4);
    flex-shrink: 0;
  }

  .agent-header-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .agent-header-name {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #f0f0f0;
    letter-spacing: 0.02em;
  }

  .agent-header-status {
    font-size: 10px;
    color: #8B1A2E;
    font-family: 'DM Mono', monospace;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .agent-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #8B1A2E;
    box-shadow: 0 0 6px rgba(139,26,46,0.8);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }

    50% {
      opacity: 0.4;
    }
  }

  .agent-close-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: #666;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .agent-close-btn:hover {
    background: rgba(139,26,46,0.2);
    border-color: rgba(139,26,46,0.3);
    color: #f0f0f0;
  }

  /* ── Contexto de página ── */
  .agent-context-badge {
    margin: 10px 14px 0;
    padding: 5px 10px;
    background: rgba(139,26,46,0.08);
    border: 1px solid rgba(139,26,46,0.15);
    border-radius: 6px;
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    color: rgba(139,26,46,0.8);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  /* ── Mensajes ── */
  .agent-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(139,26,46,0.2) transparent;
  }

  .agent-messages::-webkit-scrollbar {
    width: 3px;
  }

  .agent-messages::-webkit-scrollbar-track {
    background: transparent;
  }

  .agent-messages::-webkit-scrollbar-thumb {
    background: rgba(139,26,46,0.25);
    border-radius: 2px;
  }

  .agent-msg {
    display: flex;
    flex-direction: column;
    max-width: 88%;
    animation: msgIn 0.2s ease-out forwards;
  }

  @keyframes msgIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .agent-msg.user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .agent-msg.agent {
    align-self: flex-start;
    align-items: flex-start;
  }

  .agent-msg-bubble {
    padding: 9px 13px;
    border-radius: 14px;
    font-size: 12.5px;
    line-height: 1.55;
    word-break: break-word;
  }

  .agent-msg.user .agent-msg-bubble {
    background: linear-gradient(
      135deg,
      #8B1A2E,
      #6b1322
    );
    color: #f5f5f5;
    border-bottom-right-radius: 4px;
  }

  .agent-msg.agent .agent-msg-bubble {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    color: #d4d4d4;
    border-bottom-left-radius: 4px;
  }

  .agent-msg-time {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    color: #444;
    margin-top: 3px;
    padding: 0 3px;
  }

  /* ── Typing indicator ── */
  .agent-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 13px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    border-bottom-left-radius: 4px;
    width: fit-content;
    align-self: flex-start;
  }

  .agent-typing span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #8B1A2E;
    animation: typingDot 1.2s ease-in-out infinite;
  }

  .agent-typing span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .agent-typing span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typingDot {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }

    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  /* ── Chips de sugerencias ── */
  .agent-suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 14px 8px;
    flex-shrink: 0;
  }

  .agent-chip {
    background: rgba(139,26,46,0.08);
    border: 1px solid rgba(139,26,46,0.2);
    color: rgba(139,26,46,0.9);
    font-size: 10.5px;
    font-family: 'Inter', sans-serif;
    padding: 4px 10px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .agent-chip:hover {
    background: rgba(139,26,46,0.18);
    border-color: rgba(139,26,46,0.4);
    color: #f0f0f0;
    transform: translateY(-1px);
  }

  /* ── Input area ── */
  .agent-input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 14px 14px;
    background: rgba(0,0,0,0.3);
    border-top: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }

  .agent-input {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 9px 12px;
    color: #e0e0e0;
    font-size: 12.5px;
    font-family: 'Inter', sans-serif;
    resize: none;
    outline: none;
    line-height: 1.4;
    min-height: 38px;
    max-height: 90px;
    transition: border-color 0.15s;
    scrollbar-width: none;
  }

  .agent-input::-webkit-scrollbar {
    display: none;
  }

  .agent-input::placeholder {
    color: #444;
  }

  .agent-input:focus {
    border-color: rgba(139,26,46,0.4);
    background: rgba(255,255,255,0.06);
  }

  .agent-send-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(
      135deg,
      #8B1A2E,
      #6b1322
    );
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(139,26,46,0.35);
  }

  .agent-send-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(139,26,46,0.5);
  }

  .agent-send-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .agent-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .agent-send-btn svg {
    width: 15px;
    height: 15px;
    fill: #fff;
  }

  /* ── Wrapper Liquid Glass ── */
  .agent-glass-toggle {
    display: block;
    width: 52px;
    height: 52px;

    /*
     * v1.0.3
     * Micro-interacción del cristal.
     *
     * El escalado ocurre sobre el Web Component
     * completo, manteniendo la refracción y el
     * contenido juntos.
     */
    transform-origin: center center;

    transition:
      transform 0.4s cubic-bezier(
        0.175,
        0.885,
        0.32,
        2.2
      );
  }

  .agent-glass-toggle:hover {
    transform:
      scale(1.07);
  }

  /* ── Botón dentro del cristal ── */
  .agent-toggle-btn {
    width: 100%;
    height: 100%;
    border-radius: 16px;

    /*
     * El fondo y el efecto de cristal los proporciona
     * GlassElement.
     */
    background: transparent;

    border: none;

    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    position: relative;

    overflow: hidden;

    padding: 0;

    box-shadow: none;

    transition:
      transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }

  .agent-toggle-btn::before {
    content: '';

    position: absolute;
    inset: 0;

    /*
     * Reflejo temporal.
     *
     * Se mantiene muy sutil en v1.0.3.
     * El shine/reflection definitivo llegará
     * en la siguiente etapa del Liquid Glass.
     */
    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,0.16) 0%,
        rgba(255,255,255,0.035) 35%,
        transparent 62%
      );

    pointer-events: none;
    z-index: 1;

    opacity: 0.7;
  }

  /*
   * El crecimiento principal ahora pertenece
   * al Web Component, no al botón interno.
   *
   * Así evitamos que ambos elementos se escalen
   * simultáneamente.
   */
  .agent-toggle-btn:hover {
    transform:
      translateY(-1px);
  }

  .agent-toggle-btn:active {
    transform:
      translateY(0) scale(0.97);
  }

  .agent-toggle-btn svg {
    width: 22px;
    height: 22px;

    fill: #fff;

    position: relative;
    z-index: 2;

    transition:
      transform 0.2s ease,
      filter 0.2s ease;

    filter:
      drop-shadow(
        0 1px 4px rgba(0,0,0,0.35)
      );
  }

  .agent-toggle-btn.open svg {
    transform: rotate(90deg);
  }

  /* ── Badge de notificación ── */
  .agent-notif-badge {
    position: absolute;
    top: 4px;
    right: 4px;

    width: 8px;
    height: 8px;

    border-radius: 50%;

    background: #e84444;

    border: 2px solid #0e0e0e;

    animation:
      notifPulse 2s ease-in-out infinite;

    z-index: 5;
  }

  @keyframes notifPulse {
    0%, 100% {
      box-shadow:
        0 0 0 0 rgba(232,68,68,0.4);
    }

    50% {
      box-shadow:
        0 0 0 5px rgba(232,68,68,0);
    }
  }

  /* ── Disclaimer ── */
  .agent-disclaimer {
    padding: 5px 14px 8px;
    font-size: 9.5px;
    font-family: 'DM Mono', monospace;
    color: #333;
    text-align: center;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .agent-disclaimer a {
    color: rgba(139,26,46,0.5);
    text-decoration: none;
  }

  /* ── Mensaje de error ── */
  .agent-msg.agent.error .agent-msg-bubble {
    background: rgba(232,68,68,0.08);
    border-color: rgba(232,68,68,0.2);
    color: #e84444;
  }

  /* ── Status dot variantes ── */
  .agent-status-dot.online {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34,197,94,0.8);
  }

  .agent-status-dot.offline {
    background: #e84444;
    box-shadow: 0 0 6px rgba(232,68,68,0.6);
    animation: none;
  }

  .agent-status-dot.checking {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245,158,11,0.6);
  }

  .agent-header-status.offline {
    color: #e84444;
  }

  .agent-header-status.online {
    color: #22c55e;
  }

  .agent-header-status.checking {
    color: #f59e0b;
  }

  /* ── Banner offline ── */
  .agent-offline-banner {
    margin: 8px 14px 0;
    padding: 7px 12px;
    background: rgba(232,68,68,0.08);
    border: 1px solid rgba(232,68,68,0.2);
    border-radius: 8px;
    font-size: 11px;
    color: #e84444;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }

  .agent-retry-btn {
    background: rgba(232,68,46,0.15);
    border: 1px solid rgba(232,68,46,0.3);
    color: #e84444;
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    padding: 3px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .agent-retry-btn:hover {
    background: rgba(232,68,46,0.25);
    color: #fff;
  }

  .agent-input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;


// ─── Constantes ─────────────────────────────────────────────────────────────
const PAGE_CONTEXT = {
  '/dashboard': {
    label: 'Dashboard',
    hint: 'Pregúntame sobre métricas o resumen general'
  },

  '/products': {
    label: 'Productos',
    hint: 'Pregúntame sobre productos o categorías'
  },

  '/inventory': {
    label: 'Inventario',
    hint: 'Pregúntame sobre movimientos o stock'
  },

  '/sales': {
    label: 'Ventas',
    hint: 'Pregúntame sobre ventas o clientes'
  },

  '/reports': {
    label: 'Reportes',
    hint: 'Pregúntame sobre reportes o tendencias'
  },

  '/predictions': {
    label: 'Predicciones',
    hint: 'Pregúntame sobre demanda futura'
  },

  '/users': {
    label: 'Usuarios',
    hint: 'Pregúntame sobre roles o accesos'
  },
};


const SUGGESTIONS_BY_PAGE = {
  '/dashboard': [
    '¿Cómo van las ventas?',
    'Resumen del día',
    '¿Stock crítico?'
  ],

  '/products': [
    'Productos sin stock',
    '¿Cuál vende más?',
    'Precio promedio'
  ],

  '/inventory': [
    'Movimientos recientes',
    '¿Qué reabastecer?',
    'Stock mínimo'
  ],

  '/sales': [
    'Ventas de hoy',
    'Mejor producto',
    'Total del mes'
  ],

  '/reports': [
    'Reporte semanal',
    'Tendencia de ventas',
    'Comparar meses'
  ],

  '/predictions': [
    'Predicción próxima semana',
    '¿Qué pedir?',
    'Demanda alta'
  ],

  '/users': [
    'Usuarios activos',
    'Roles asignados',
    'Último acceso'
  ],
};


const WELCOME_MSG = {
  role: 'agent',
  text: '¡Hola! Soy el agente de StockMind ⚡\nPuedo consultarte datos de inventario, ventas, predicciones y más. ¿En qué te ayudo?',
  time: now(),
};


function now() {
  return new Date().toLocaleTimeString(
    'es-CO',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  );
}


// ─── Gateway ────────────────────────────────────────────────────────────────
const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL ||
  'http://localhost:3000';


async function callGemini(messages, currentPage) {
  const token = localStorage.getItem('sm_token');

  const res = await fetch(
    `${GATEWAY_URL}/api/agent/query`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },

      body: JSON.stringify({
        messages,
        currentPage,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));

    throw new Error(
      err?.error ||
      `HTTP ${res.status}`
    );
  }

  const data = await res.json();

  return data.reply ||
    'Sin respuesta del agente.';
}


// ─── Componente principal ───────────────────────────────────────────────────
export default function AgentBubble() {

  const location = useLocation();
  const { user } = useAuth();

  const [open, setOpen] =
    useState(false);

  const [closing, setClosing] =
    useState(false);

  const [messages, setMessages] =
    useState([WELCOME_MSG]);

  const [input, setInput] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [showBadge, setShowBadge] =
    useState(true);

  const [agentStatus, setAgentStatus] =
    useState('unknown');


  const messagesEndRef =
    useRef(null);

  const inputRef =
    useRef(null);

  const textareaRef =
    useRef(null);


  const currentPage =
    location.pathname;

  const suggestions =
    SUGGESTIONS_BY_PAGE[currentPage] || [];

  const pageCtx =
    PAGE_CONTEXT[currentPage];


  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {

    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });

  }, [messages, loading]);


  // ── Focus + status ─────────────────────────────────────────────────────
  useEffect(() => {

    if (open) {

      setShowBadge(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);

      checkStatus();
    }

  }, [open]);


  // ── Auto resize textarea ───────────────────────────────────────────────
  useEffect(() => {

    if (textareaRef.current) {

      textareaRef.current.style.height =
        'auto';

      textareaRef.current.style.height =
        `${Math.min(
          textareaRef.current.scrollHeight,
          90
        )}px`;
    }

  }, [input]);


  function handleClose() {

    setClosing(true);

    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  }


  function handleToggle() {

    if (open) {
      handleClose();
    } else {
      setOpen(true);
    }
  }


  async function checkStatus() {

    setAgentStatus('unknown');

    try {

      const token =
        localStorage.getItem('sm_token');

      const res =
        await fetch(
          `${GATEWAY_URL}/api/agent/status`,
          {
            headers: {
              'Authorization':
                `Bearer ${token}`,
            },
          }
        );


      if (res.ok) {

        const data =
          await res.json();

        setAgentStatus(
          data.available
            ? 'online'
            : 'offline'
        );

      } else {

        setAgentStatus('offline');
      }

    } catch {

      setAgentStatus('offline');
    }
  }


  async function sendMessage(text) {

    if (
      !text.trim() ||
      loading ||
      agentStatus === 'offline'
    ) {
      return;
    }


    const userMsg = {
      role: 'user',
      text: text.trim(),
      time: now()
    };


    const newMessages = [
      ...messages,
      userMsg
    ];


    setMessages(newMessages);
    setInput('');
    setLoading(true);


    try {

      const contextMessages =
        newMessages.slice(-10);

      const reply =
        await callGemini(
          contextMessages,
          currentPage
        );


      setAgentStatus('online');


      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: reply,
          time: now()
        }
      ]);

    } catch (err) {

      const msg =
        err.message || '';

      const isQuota =
        msg.includes('quota') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED');

      const isAuth =
        msg.includes('API_KEY') ||
        msg.includes('403') ||
        msg.includes('401');


      setAgentStatus('offline');


      let friendlyMsg =
        '⚠️ El agente no está disponible en este momento. Intenta más tarde.';


      if (isQuota) {
        friendlyMsg =
          '⚠️ Se agotó la cuota de la API. Verifica tu plan en Google AI Studio.';
      }


      if (isAuth) {
        friendlyMsg =
          '⚠️ API key inválida o sin permisos. Revisa la configuración.';
      }


      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: friendlyMsg,
          time: now(),
          error: true,
        }
      ]);

    } finally {

      setLoading(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }


  function handleKeyDown(e) {

    if (
      e.key === 'Enter' &&
      !e.shiftKey
    ) {

      e.preventDefault();

      sendMessage(input);
    }
  }


  return (
    <>
      <style>
        {styles}
      </style>

      <div className="agent-fab">

        {/* ── Panel de chat ─────────────────────────────────────────── */}
        {open && (
          <div
            className={`agent-panel ${
              closing ? 'closing' : ''
            }`}
          >

            {/* Header */}
            <div className="agent-header">

              <div className="agent-header-left">

                <div className="agent-avatar">
                  🧠
                </div>

                <div className="agent-header-info">

                  <span className="agent-header-name">
                    StockMind AI
                  </span>

                  <span
                    className={`agent-header-status ${
                      agentStatus === 'online'
                        ? 'online'
                        : agentStatus === 'offline'
                          ? 'offline'
                          : 'checking'
                    }`}
                  >

                    <span
                      className={`agent-status-dot ${
                        agentStatus === 'online'
                          ? 'online'
                          : agentStatus === 'offline'
                            ? 'offline'
                            : 'checking'
                      }`}
                    />

                    {agentStatus === 'online' &&
                      'en línea · Llama 3.3 · Groq'}

                    {agentStatus === 'offline' &&
                      'sin conexión · API no disponible'}

                    {agentStatus === 'unknown' &&
                      'verificando...'}

                  </span>

                </div>

              </div>


              <button
                className="agent-close-btn"
                onClick={handleClose}
                title="Cerrar"
              >
                ✕
              </button>

            </div>


            {/* Banner offline */}
            {agentStatus === 'offline' && (
              <div className="agent-offline-banner">

                <span>
                  El agente no está disponible ahora
                </span>

                <button
                  className="agent-retry-btn"
                  onClick={checkStatus}
                >
                  ↺ Reintentar
                </button>

              </div>
            )}


            {/* Contexto */}
            {pageCtx &&
              agentStatus !== 'offline' && (
                <div className="agent-context-badge">

                  <span>📍</span>

                  <span>
                    {pageCtx.label} — {pageCtx.hint}
                  </span>

                </div>
              )}


            {/* Mensajes */}
            <div className="agent-messages">

              {messages.map((msg, i) => (

                <div
                  key={i}
                  className={`agent-msg ${
                    msg.role
                  } ${
                    msg.error ? 'error' : ''
                  }`}
                >

                  <div className="agent-msg-bubble">
                    {msg.text}
                  </div>

                  <span className="agent-msg-time">
                    {msg.time}
                  </span>

                </div>

              ))}


              {loading && (
                <div className="agent-typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}


              <div ref={messagesEndRef} />

            </div>


            {/* Sugerencias */}
            {suggestions.length > 0 &&
              !loading && (

                <div className="agent-suggestions">

                  {suggestions.map((s, i) => (

                    <button
                      key={i}
                      className="agent-chip"
                      onClick={() =>
                        sendMessage(s)
                      }
                    >
                      {s}
                    </button>

                  ))}

                </div>
              )}


            {/* Disclaimer */}
            <div className="agent-disclaimer">
              ⚠️ Experimental · Puede cometer errores · No compartas datos sensibles
            </div>


            {/* Input */}
            <div className="agent-input-area">

              <textarea
                ref={el => {
                  inputRef.current = el;
                  textareaRef.current = el;
                }}
                className="agent-input"
                placeholder="Escribe tu pregunta..."
                value={input}
                onChange={e =>
                  setInput(e.target.value)
                }
                onKeyDown={handleKeyDown}
                disabled={
                  loading ||
                  agentStatus === 'offline'
                }
                rows={1}
              />


              <button
                className="agent-send-btn"
                onClick={() =>
                  sendMessage(input)
                }
                disabled={
                  !input.trim() ||
                  loading ||
                  agentStatus === 'offline'
                }
                title="Enviar"
              >

                <svg
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>

              </button>

            </div>

          </div>
        )}


        {/* ── FAB / LIQUID GLASS ───────────────────────────────────── */}
        <glass-element
          className="agent-glass-toggle"
          width="52"
          height="52"
          radius="16"
          depth="8"
          blur="3"
          strength="28"
          chromatic-aberration="0"
          background-color="rgba(255,255,255,0.025)"
        >

          <button
            className={`agent-toggle-btn ${
              open ? 'open' : ''
            }`}
            onClick={handleToggle}
            title="Agente StockMind AI"
            aria-label={
              open
                ? 'Cerrar agente StockMind AI'
                : 'Abrir agente StockMind AI'
            }
          >

            {showBadge && !open && (
              <span className="agent-notif-badge" />
            )}


            {open ? (

              <svg
                viewBox="0 0 24 24"
              >
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>

            ) : (

              <svg
                viewBox="0 0 24 24"
              >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-1.9-2zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>

            )}

          </button>

        </glass-element>

      </div>
    </>
  );
}