# StockMind — Manual de Usuario

**Versión:** 1.0.0  
**Audiencia:** Administradores y vendedores del sistema

---

## 1. Acceso al sistema

### Iniciar sesión

1. Abra el navegador y navegue a la URL del sistema (por defecto: `http://localhost:5500`)
2. Ingrese su **nombre de usuario** y **contraseña**
3. Haga clic en **Iniciar sesión**

**Credenciales de prueba:**
| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| vendedor1 | admin123 | Vendedor |

> ⚠ Cambie las contraseñas predeterminadas inmediatamente después del primer acceso.

### Cerrar sesión

Haga clic en el ícono ⎋ en la esquina inferior del menú lateral, o cierre el navegador.

---

## 2. Dashboard

El dashboard es la pantalla principal del sistema. Muestra:

- **Ventas del día:** Total de ingresos en la jornada actual
- **Productos activos:** Cantidad de productos en el catálogo
- **Stock crítico:** Productos que han llegado o superado su nivel mínimo
- **Ventas del mes:** Total acumulado del mes en curso
- **Alerta de stock bajo:** Banner naranja que aparece cuando hay productos críticos
- **Productos con stock crítico:** Tabla con productos que requieren reabastecimiento
- **Ventas recientes:** Las últimas 8 ventas registradas

---

## 3. Módulo de Productos

### Ver el catálogo

El módulo de productos lista todos los artículos activos del sistema. Puede buscar por nombre o SKU usando el campo de búsqueda en la parte superior.

**Columnas:**
- **Nombre:** Nombre descriptivo del producto
- **SKU:** Código único de identificación
- **Categoría:** Clasificación del producto
- **Precio:** Precio de venta unitario
- **Stock:** Stock actual y stock mínimo configurado
- **Estado:** OK (verde) o CRÍTICO (rojo) según el nivel de stock

### Crear un producto *(solo Administrador)*

1. Haga clic en **+ Nuevo producto**
2. Complete el formulario:
   - **Nombre:** Nombre descriptivo (obligatorio)
   - **SKU:** Código único (obligatorio, no puede repetirse)
   - **Precio:** Valor de venta en pesos colombianos
   - **Stock inicial:** Unidades disponibles al crear el producto
   - **Stock mínimo:** Nivel de alerta de reabastecimiento
   - **Unidad:** Unidad de medida (Unidad, Kilogramo, Litro, Caja)
   - **Categoría:** Clasificación del producto
3. Haga clic en **Guardar**

### Editar un producto *(solo Administrador)*

1. Haga clic en **Editar** en la fila del producto
2. Modifique los campos deseados
3. Haga clic en **Guardar**

> El SKU no puede modificarse una vez creado el producto.

### Eliminar un producto *(solo Administrador)*

Al eliminar un producto, este se **desactiva** (no se elimina físicamente). No aparecerá en el catálogo pero se preserva el historial de ventas asociado.

---

## 4. Módulo de Inventario

El módulo de inventario registra todos los movimientos de stock: entradas manuales, salidas, ajustes por conteo físico y devoluciones.

### Ver historial de movimientos

La tabla muestra todos los movimientos ordenados por fecha. Cada fila incluye:
- **Tipo:** Entrada, Salida, Venta, Ajuste o Devolución
- **Cantidad:** Positivo para entradas, negativo para salidas
- **Stock antes / Stock después:** Trazabilidad completa
- **Motivo:** Descripción del movimiento

### Registrar movimiento manual *(solo Administrador)*

1. Haga clic en **+ Registrar movimiento**
2. Seleccione el **Producto**
3. Seleccione el **Tipo:**
   - **Entrada:** Recepción de mercancía (compra, reposición)
   - **Salida:** Merma, pérdida, muestra
   - **Ajuste:** Corrección por conteo físico
   - **Devolución:** Mercancía devuelta por cliente
4. Ingrese la **Cantidad** (número positivo)
5. Ingrese un **Motivo** (opcional pero recomendado)
6. Haga clic en **Registrar**

> Las ventas registradas en el módulo de Ventas generan movimientos de tipo **Venta** automáticamente.

---

## 5. Módulo de Ventas

### Registrar una venta

1. En la pantalla de Ventas, asegúrese de estar en la vista **Nueva venta**
2. Busque los productos usando el campo de búsqueda
3. Haga clic en **+ Agregar** para incluir un producto en el carrito
4. En el carrito, use los botones **+** y **−** para ajustar cantidades
5. Agregue **Notas** opcionales (ej: "Venta mostrador", "Cliente preferencial")
6. Haga clic en **Registrar venta**

El sistema descuenta automáticamente el stock de cada producto vendido.

**Validaciones:**
- No se puede vender más unidades de las disponibles en stock
- El carrito debe tener al menos un producto

### Ver historial de ventas

1. Haga clic en **Ver historial** en la parte superior derecha
2. La tabla muestra todas las ventas con vendedor, total, estado y fecha
3. Haga clic en **+ Nueva venta** para volver al formulario

---

## 6. Módulo de Predicciones

El módulo de predicciones es el componente diferenciador de StockMind. Utiliza el microservicio de analítica Python para estimar la demanda futura de cada producto.

### Predicción por producto

1. En la lista de la izquierda, haga clic en el producto que desea analizar
2. El sistema consulta automáticamente el microservicio de analítica
3. Se muestra:
   - **Demanda semanal estimada:** Unidades proyectadas para la próxima semana
   - **Demanda mensual estimada:** Unidades proyectadas para el próximo mes
   - **Promedio diario histórico:** Ventas promedio por día
   - **Semanas de historial:** Cuántas semanas de datos históricos se analizaron
   - **Confianza del modelo (R²):** Qué tan precisa es la predicción (0–100%)
   - **Recomendación de reabastecimiento:** Cantidad exacta sugerida a reabastecer

**Modelos utilizados:**
- **Regresión Lineal:** Se usa cuando hay tendencia clara (R² > 30%)
- **Media Móvil Ponderada:** Se usa con pocos datos o tendencias irregulares
- **Estimación base:** Se usa cuando no hay historial de ventas

### Recomendaciones globales

1. Haga clic en **Ver recomendaciones globales**
2. Se muestra una tabla con todos los productos que requieren reabastecimiento
3. Los productos **críticos** (stock ≤ mínimo) aparecen primero en rojo
4. Para cada producto se muestra la cantidad exacta sugerida a reabastecer

> El sistema incluye un margen de seguridad del 20% sobre la demanda proyectada.

---

## 7. Módulo de Reportes *(solo Administrador)*

### Generar reporte de ventas

1. Seleccione la **fecha de inicio** y la **fecha de fin**
2. Haga clic en **Generar reporte**
3. Se muestra el resumen:
   - Total vendido en el período
   - Número de transacciones
   - Promedio por venta
4. Se listan todas las ventas del período

### Top productos más vendidos

La tabla de top productos muestra automáticamente los 10 productos con mayor volumen de ventas en los últimos 30 días, con la cantidad de unidades vendidas, los ingresos generados y una barra de participación relativa.

---

## 8. Módulo de Usuarios *(solo Administrador)*

### Ver usuarios

La tabla muestra todos los usuarios del sistema con su rol, estado de activación y fecha de creación.

### Crear usuario

1. Haga clic en **+ Nuevo usuario**
2. Complete el formulario:
   - **Usuario:** Nombre de acceso (sin espacios)
   - **Email:** Correo electrónico único
   - **Contraseña:** Mínimo 6 caracteres
   - **Rol:** Vendedor o Administrador
3. Haga clic en **Guardar**

**Diferencia entre roles:**

| Función | Vendedor | Administrador |
|---------|----------|---------------|
| Ver productos | ✓ | ✓ |
| Crear/editar productos | ✗ | ✓ |
| Registrar ventas | ✓ | ✓ |
| Ver historial de ventas | ✓ | ✓ |
| Registrar movimientos de inventario | ✗ | ✓ |
| Ver predicciones | ✓ | ✓ |
| Ver reportes | ✗ | ✓ |
| Gestionar usuarios | ✗ | ✓ |

### Editar usuario

Haga clic en **Editar** para modificar el email, rol o contraseña. El nombre de usuario no puede modificarse.

### Activar / Desactivar usuario

Haga clic en **Desactivar** para inhabilitar el acceso de un usuario sin eliminarlo. El usuario no podrá iniciar sesión pero se preserva su historial. Haga clic en **Activar** para restaurar el acceso.

> No puede desactivar su propia cuenta.

---

## 9. Alertas y notificaciones

### Notificaciones tipo toast

Las acciones exitosas y los errores se muestran como pequeños mensajes en la esquina inferior derecha de la pantalla que desaparecen automáticamente.

- **Verde:** Operación exitosa
- **Rojo:** Error (leer el mensaje para conocer el detalle)
- **Naranja:** Advertencia (datos incompletos, stock máximo, etc.)

### Alerta de stock crítico

Cuando uno o más productos tienen stock por debajo del mínimo configurado, aparece un banner naranja en la parte superior del dashboard con el número de productos afectados y un enlace al módulo de inventario.

---

## 10. Preguntas frecuentes

**¿Por qué no puedo agregar más unidades al carrito?**  
El sistema no permite vender más unidades de las disponibles en stock. Si el botón + no responde, es porque se ha alcanzado el máximo de stock disponible para ese producto.

**¿Por qué no aparece el módulo de Usuarios en el menú?**  
El módulo de Usuarios solo está disponible para usuarios con rol Administrador.

**¿Qué significa "Sin historial de ventas" en las predicciones?**  
El producto no tiene ventas registradas en los últimos 90 días. La predicción se basa en el stock mínimo configurado como estimación conservadora.

**¿Qué pasa si el microservicio de predicciones no está disponible?**  
El módulo de predicciones mostrará un mensaje de error. Los demás módulos del sistema (productos, ventas, inventario) funcionan con normalidad ya que el microservicio Python es independiente.

**¿Se pueden recuperar ventas eliminadas?**  
El sistema no permite eliminar ventas. Solo se pueden cancelar cambiando el estado a CANCELLED, pero esto se hace desde la administración de base de datos directamente.

---

*StockMind v1.0.0 — Manual de Usuario — Proyecto Académico*
