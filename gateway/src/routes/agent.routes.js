/**
 * StockMind Gateway — Rutas del Agente IA (experimental)
 * =======================================================
 * Proxy seguro hacia Groq API con acceso a datos reales del sistema.
 * La API key nunca se expone al cliente — vive en el .env del gateway.
 *
 * Rutas:
 *   GET  /api/agent/status  → Verifica disponibilidad del agente
 *   POST /api/agent/query   → Envía mensaje y retorna respuesta del agente
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

// ─── Helpers internos para consultar datos reales ────────────────────────────

async function getLowStock(authToken) {
  try {
    const r = await axios.get(`${JAVA}/products/low-stock`, {
      headers: { Authorization: authToken }
    });
    return r.data;
  } catch { return null; }
}

async function getSales(authToken, params = {}) {
  try {
    const r = await axios.get(`${JAVA}/sales`, {
      headers: { Authorization: authToken },
      params
    });
    return r.data;
  } catch { return null; }
}

async function getTopProducts(authToken, limit = 5) {
  try {
    const r = await axios.get(`${JAVA}/reports/top-products`, {
      headers: { Authorization: authToken },
      params: { limit }
    });
    return r.data;
  } catch { return null; }
}

async function getAllProducts(authToken) {
  try {
    const r = await axios.get(`${JAVA}/products`, {
      headers: { Authorization: authToken }
    });
    return r.data;
  } catch { return null; }
}

// ─── Detectar qué datos necesita la pregunta ─────────────────────────────────
function detectIntent(messages) {
  const lastMsg = messages[messages.length - 1]?.text?.toLowerCase() || '';

  const intents = {
    lowStock:    /stock.?cr[ií]tico|stock bajo|sin stock|agotad|m[ií]nimo|reabastecer|reponer|cr[ií]tico/i.test(lastMsg),
    sales:       /venta|vendido|ingreso|total|factura|transacci|resumen|d[ií]a|hoy|mes/i.test(lastMsg),
    topProducts: /m[áa]s vendido|top|mejor producto|popular|mayor demanda|cu[áa]l vende|vende m[áa]s/i.test(lastMsg),
    products:    /producto|cat[áa]logo|inventario|stock actual|cu[áa]ntos|precio promedio|precio/i.test(lastMsg),
  };

  return intents;
}

// ─── Construir contexto de datos para el prompt ───────────────────────────────
async function buildDataContext(intents, authToken) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  if (intents.lowStock) {
    const data = await getLowStock(authToken);
    if (data && data.length > 0) {
      lines.push(`\n📦 PRODUCTOS EN STOCK CRÍTICO (${data.length} productos):`);
      data.slice(0, 8).forEach(p => {
        lines.push(`  - ${p.name}: stock actual ${p.stockCurrent}, mínimo ${p.stockMinimum}`);
      });
      if (data.length > 8) lines.push(`  ... y ${data.length - 8} productos más.`);
    } else if (data !== null) {
      lines.push(`\n📦 STOCK CRÍTICO: No hay productos en stock crítico en este momento.`);
    }
  }

  if (intents.sales) {
    const salesHoy   = await getSales(authToken, { from: today, to: today });
    const salesMes   = await getSales(authToken, { from: monthStart, to: today });

    if (salesHoy !== null) {
      const totalHoy = salesHoy.reduce((acc, s) => acc + (s.total || 0), 0);
      lines.push(`\n💰 VENTAS DE HOY: ${salesHoy.length} transacciones — Total: $${totalHoy.toLocaleString('es-CO')} COP`);
    }
    if (salesMes !== null) {
      const totalMes = salesMes.reduce((acc, s) => acc + (s.total || 0), 0);
      lines.push(`📅 VENTAS DEL MES: ${salesMes.length} transacciones — Total: $${totalMes.toLocaleString('es-CO')} COP`);
    }
  }

  if (intents.topProducts) {
    const data = await getTopProducts(authToken, 5);
    if (data && data.length > 0) {
      lines.push(`\n🏆 TOP PRODUCTOS MÁS VENDIDOS (últimos 30 días):`);
      data.forEach((p, i) => {
        lines.push(`  ${i + 1}. ${p.productName || p.name}: ${p.totalQuantity || p.quantity} unidades`);
      });
    }
  }

  if (intents.products && !intents.lowStock) {
    const data = await getAllProducts(authToken);
    if (data) {
      const activos  = Array.isArray(data) ? data.filter(p => p.active !== false) : [];
      const criticos = activos.filter(p => p.stockCurrent <= p.stockMinimum);
      const sinStock = activos.filter(p => p.stockCurrent === 0);
      const precios  = activos.map(p => p.price || 0).filter(p => p > 0);
      const promedio = precios.length > 0
        ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length)
        : 0;
      lines.push(`\n🗂️ CATÁLOGO: ${activos.length} productos activos, ${criticos.length} en stock crítico, ${sinStock.length} sin stock.`);
      if (promedio > 0) lines.push(`💲 Precio promedio del catálogo: $${promedio.toLocaleString('es-CO')} COP`);
      if (sinStock.length > 0) {
        lines.push(`🚫 PRODUCTOS SIN STOCK (${sinStock.length}):`);
        sinStock.slice(0, 5).forEach(p => lines.push(`  - ${p.name}`));
        if (sinStock.length > 5) lines.push(`  ... y ${sinStock.length - 5} más.`);
      }
    }
  }

  return lines.length > 0
    ? `\nDAtos reales del sistema (consultados en tiempo real):\n${lines.join('\n')}`
    : '';
}

// ─── Contexto por módulo ─────────────────────────────────────────────────────
const PAGE_CONTEXT = {
  '/dashboard':   'Dashboard — resumen general de ventas, métricas del día y alertas de stock',
  '/products':    'Productos — catálogo, SKUs, precios, categorías y estado de stock',
  '/inventory':   'Inventario — movimientos de entrada/salida, ajustes y trazabilidad de stock',
  '/sales':       'Ventas — registro de ventas, historial y detalle por transacción',
  '/reports':     'Reportes — ventas por período, top productos y análisis de rendimiento',
  '/predictions': 'Predicciones — demanda futura estimada y recomendaciones de reabastecimiento',
  '/users':       'Usuarios — gestión de cuentas, roles y permisos',
};

function buildSystemPrompt(currentPage, dataContext) {
  const pageCtx = PAGE_CONTEXT[currentPage] || 'Módulo general de StockMind';
  const hasData = dataContext.trim().length > 0;
  return `Eres el asistente de inteligencia artificial de StockMind, una plataforma de gestión de inventario y ventas para pequeñas y medianas empresas.

Tu rol: responder preguntas del usuario ÚNICAMENTE usando los datos reales del sistema que se te proporcionan. Si no tienes datos, indícalo honestamente.

Contexto actual: el usuario está en el módulo de ${pageCtx}.
${hasData ? dataContext : '(No hay datos del sistema disponibles para esta consulta.)'}

REGLAS CRÍTICAS — nunca las incumplas:
- NUNCA inventes productos, nombres, SKUs, cantidades, precios ni ningún dato que no esté en el contexto de arriba
- NUNCA menciones marcas, modelos o productos que no aparezcan en los datos proporcionados
- Si no tienes datos sobre lo que pregunta el usuario, responde exactamente: "No tengo datos suficientes para esto. Te recomiendo revisar el módulo correspondiente en el sistema."
- Si los datos están vacíos, dilo claramente en lugar de inventar

Reglas generales:
- Responde siempre en español
- Respuestas cortas y directas (máx 4 oraciones salvo que se pida más detalle)
- Tono profesional pero cercano
- No solicites ni proceses información personal, financiera o confidencial

⚠️ Eres un agente experimental. Puedes cometer errores. Verifica siempre la información crítica directamente en el sistema.`;
}

// ─── GET /api/agent/status ───────────────────────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  if (!config.agentEnabled) {
    return res.json({ available: false, maintenance: true });
  }
  const configured = !!config.groqApiKey && config.groqApiKey.length > 10;
  res.json({
    available: configured,
    model:     'llama-3.3-70b-versatile',
    provider:  'Groq',
  });
});

// ─── POST /api/agent/query ───────────────────────────────────────────────────
router.post('/query', authenticate, async (req, res, next) => {
  if (!config.agentEnabled) {
    return res.status(503).json({
      error: 'El asistente está en mejora y volverá pronto.',
      code: 'AGENT_MAINTENANCE'
    });
  }

  try {
    const { messages, currentPage } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'El campo messages es requerido y debe ser un array no vacío.'
      });
    }

    // 1. Detectar intención y consultar datos reales si aplica
    const intents     = detectIntent(messages);
    const dataContext = await buildDataContext(intents, authHeader(req).Authorization);

    // 2. Construir mensajes para Groq
    const groqMessages = [
      { role: 'system', content: buildSystemPrompt(currentPage || '/dashboard', dataContext) },
      ...messages.slice(-10).map(m => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
    ];

    // 3. Llamar a Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.groqApiKey}`,
      },
      signal: AbortSignal.timeout(20000), // un proveedor lento no debe colgar la petición
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    groqMessages,
        temperature: 0.7,
        max_tokens:  500,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      if (groqRes.status === 429) return res.status(429).json({ error: 'Cuota de la API agotada. Intenta más tarde.', code: 'QUOTA_EXCEEDED' });
      if (groqRes.status === 401) return res.status(503).json({ error: 'Error de configuración del agente.', code: 'INVALID_KEY' });
      return res.status(502).json({ error: err?.error?.message || `Groq HTTP ${groqRes.status}`, code: 'GROQ_ERROR' });
    }

    const data  = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Sin respuesta del agente.';
    res.json({ reply });

  } catch (e) { next(e); }
});

module.exports = exports = router;