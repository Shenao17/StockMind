# Base de datos

El esquema ya **no** vive aquí. Lo gestiona Flyway desde el backend:

| Qué | Dónde |
|---|---|
| Esquema y cambios futuros (V1, V2, ...) | `backend/src/main/resources/db/migration/` |
| Datos de ejemplo (solo desarrollo, perfil `dev`) | `backend/src/main/resources/db/dev/seed.sql` |

- Cada cambio de base de datos es un archivo nuevo `V{n}__descripcion.sql`.
- **Nunca se edita una migración ya aplicada**: Flyway lo detecta (checksum) y se niega a arrancar.
- MySQL solo crea la base vacía (`MYSQL_DATABASE`); las tablas las crea el backend al arrancar.
