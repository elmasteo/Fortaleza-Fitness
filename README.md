# FORTALEZA FITNESS — Guía de Instalación Completa

---

## Archivos del proyecto

```
fortaleza-fitness/
├── index.html            # Aplicación principal
├── style.css             # Estilos
├── app.js                # Lógica de la app
├── config.js             # ⚙️ TUS CREDENCIALES (editar)
├── nequi-qr.png          # 📷 TU QR de Nequi (agregar)
├── netlify.toml          # Configuración Netlify
├── supabase-schema.sql   # Esquema de base de datos
└── README.md
```

---

## PASO 1 — Configurar Supabase (base de datos gratuita)

### 1.1 Crear cuenta y proyecto

1. Ve a **https://supabase.com** y crea una cuenta gratuita
2. Haz clic en **"New project"**
3. Elige un nombre (ej: `fortaleza-fitness`), una contraseña segura y la región más cercana (**South America** si está disponible, si no **US East**)
4. Espera ~2 minutos mientras el proyecto se aprovisiona

### 1.2 Crear las tablas

1. En el panel izquierdo de Supabase, ve a **SQL Editor**
2. Haz clic en **"New query"**
3. Copia y pega **todo el contenido** del archivo `supabase-schema.sql`
4. Haz clic en **"Run"** (o Ctrl+Enter)
5. Verifica que aparezca el mensaje `Success. No rows returned`

### 1.3 Obtener tus credenciales

1. En el panel izquierdo, ve a **Settings → API**
2. Copia los dos valores que necesitas:
   - **Project URL**: algo como `https://abcdefghij.supabase.co`
   - **anon public key**: una cadena larga que empieza con `eyJ...`

### 1.4 Pegar las credenciales en el proyecto

Abre el archivo `config.js` y reemplaza los valores:

```javascript
const SUPABASE_URL  = 'https://TU_PROJECT_ID.supabase.co';  // ← tu Project URL
const SUPABASE_ANON = 'TU_ANON_PUBLIC_KEY';                 // ← tu anon key
```

---

## PASO 2 — Agregar tu QR de Nequi

1. Abre la app **Nequi** en tu celular
2. Ve a tu perfil → **Cobrar** (o el ícono de QR)
3. Haz una **captura de pantalla** del código QR
4. Guarda la imagen como **`nequi-qr.png`** en la carpeta del proyecto

> El sistema detecta automáticamente si existe el archivo. Si no lo encuentra, muestra un mensaje de "coloca tu QR aquí".

---

## PASO 3 — Configurar tu número Nequi

En `config.js`, reemplaza el número de teléfono:

```javascript
const NEQUI_NUMBER = '300 000 0000';  // ← tu número real de Nequi
```

Este número aparece tanto en la pestaña de QR como en la de Bre-B para que los clientes puedan hacer la transferencia.

---

## PASO 4 — Deploy en Netlify

### Opción A — Drag & Drop (más fácil, sin cuenta de GitHub)

1. Ve a **https://app.netlify.com/drop**
2. Arrastra la **carpeta completa** `fortaleza-fitness/` a la zona de drop
3. Netlify le asigna una URL automáticamente (ej: `fortaleza-fitness.netlify.app`)
4. Listo — el sistema ya está en línea

### Opción B — GitHub + Netlify CI (recomendado para actualizaciones frecuentes)

1. Crea un repositorio en **https://github.com** y sube los archivos
2. En Netlify, haz clic en **"Add new site → Import an existing project"**
3. Conecta GitHub y selecciona tu repositorio
4. Configura:
   - **Build command**: (vacío)
   - **Publish directory**: `.`
5. Haz clic en **"Deploy site"**

> Con esta opción, cada vez que hagas un `git push`, Netlify actualiza el sitio automáticamente.

---

## PASO 5 — Verificar que todo funciona

Una vez desplegado:

1. Abre la URL de tu sitio
2. El indicador de estado en la barra lateral debe mostrar **"Supabase conectado"** (punto verde)
3. Si muestra **"Modo local"** (punto amarillo), revisa que las credenciales en `config.js` sean correctas
4. Agrega un miembro de prueba y verifica que aparezca en Supabase → **Table Editor → members**

---

## Comportamiento del sistema de persistencia

| Situación | Comportamiento |
|-----------|----------------|
| Supabase configurado y en línea | Lee y escribe en la nube. Los datos se sincronizan entre dispositivos |
| Credenciales no configuradas | Funciona en modo local (localStorage). Los datos solo existen en ese navegador |
| Supabase caído temporalmente | Guarda localmente como backup. Al volver la conexión, los cambios se reflejan en la próxima recarga |

---

## Funcionalidades de Nequi / Bre-B

Cuando un cliente toca **"Pagar con Nequi"** en cualquier plan:

- **Pestaña QR**: Muestra tu código QR para escanearlo desde la app Nequi
- **Pestaña Bre-B**: Muestra tu número de celular y el monto exacto para hacer transferencia desde cualquier banco
- **Pestaña Pasos**: Instrucciones claras para que el cliente tome captura y se la muestre al administrador

El administrador confirma el pago manualmente en el sistema a través del modal de **Renovar Plan**.

---

## Notas de seguridad

- La `anon key` de Supabase es segura para usar en el frontend — está diseñada para eso
- Las políticas RLS del esquema SQL permiten acceso completo para el MVP. En una versión con múltiples roles de usuario, se recomienda agregar autenticación
- Los datos locales (localStorage) se usan solo como caché/fallback y no reemplazan la base de datos en la nube

---

## Limpiar datos demo

Si quieres empezar desde cero sin datos de demostración:

```javascript
// En la consola del navegador (F12):
localStorage.clear();
location.reload();
```

Si usas Supabase, también deberás limpiar las tablas desde el **Table Editor**.
