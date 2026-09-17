# StockMind Frontend

Frontend de StockMind, desarrollado con React y Vite.

Esta aplicación proporciona la interfaz web para la gestión de inventario, productos, ventas, usuarios, reportes y predicciones del sistema.

## Tecnologías

- React 19
- Vite
- React Router
- JavaScript
- CSS
- Vitest
- ESLint

## Estructura

frontend/
├── src/
│   ├── api/              # Comunicación con el backend/gateway
│   ├── components/       # Componentes reutilizables
│   ├── context/          # Contextos globales de React
│   ├── pages/            # Vistas principales
│   ├── App.jsx           # Configuración principal de rutas
│   └── index.css         # Sistema visual global
├── public/
├── Dockerfile
├── package.json
└── vite.config.js

## Módulos

Actualmente el frontend cuenta con los siguientes módulos:

- Dashboard
- Productos
- Inventario
- Ventas
- Predicciones
- Reportes
- Usuarios
- Agente de IA conversacional

## Diseño

StockMind utiliza una identidad visual Dark Glass / Glassmorphism, basada en:

- Interfaces oscuras.
- Superficies translúcidas.
- Efectos de desenfoque.
- Bordes y sombras suaves.
- Gradientes sutiles.
- Componentes flotantes.
- Interfaz orientada a una experiencia SaaS moderna.

## Variables de entorno

El frontend utiliza:

VITE_GATEWAY_URL=http://localhost:3000

Esta variable define la URL del Gateway utilizado para las comunicaciones con los servicios del sistema.

## Desarrollo local

Instalar dependencias:

npm install

Iniciar el servidor de desarrollo:

npm run dev

El frontend estará disponible normalmente en:

http://localhost:5173

## Docker

El frontend también puede ejecutarse mediante Docker Compose desde la raíz del proyecto:

docker compose build frontend
docker compose up -d frontend

Para reconstruir la imagen después de realizar cambios en el código:

docker compose build frontend
docker compose up -d frontend

## Comandos disponibles

npm run dev
npm run build
npm run preview
npm run lint
npm test
npm run test:coverage

## Estado

Frontend en desarrollo activo.

La interfaz continúa evolucionando junto con la arquitectura general de StockMind.