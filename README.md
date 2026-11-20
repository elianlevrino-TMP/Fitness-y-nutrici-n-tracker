# FitLog — entrenamiento + alimentación

App web (PWA) para registrar comidas y entrenos y ver el balance calórico del día.
Sin servidor, sin base de datos en la nube, sin librerías: los datos viven en el teléfono.

## Cómo calcula
- **Basal (BMR)**: fórmula Mifflin-St Jeor con tu peso más reciente.
- **Gasto sin entreno** = BMR × factor de actividad diaria (sin contar el gimnasio).
- **Gasto del entreno** = MET del ejercicio × peso (kg) × horas. Fuerza: 3 min por serie si no indicas duración.
- **Objetivo de comida** = gasto total del día + ajuste (−400 perder grasa / 0 / +300 ganar músculo).
- **Macros**: proteína = g/kg elegido, grasas = 0,8 g/kg, carbohidratos = el resto.
- **Comida**: valores por 100 g × gramos / 100.
- **Fuerza**: 1RM estimado con Epley (kg × (1 + reps/30)).

## De dónde salen los valores de los alimentos
Los 625 alimentos de `data.js` vienen de **USDA FoodData Central, SR Legacy (2018)**, del Departamento de
Agricultura de EE.UU.: valores analizados en laboratorio, por 100 g de porción comestible. Son datos de
dominio público; se cita la fuente en la app. Cada alimento guarda su número de ficha (`fdc`) y la app
lo muestra, para poder buscarlo y verificarlo en https://fdc.nal.usda.gov.

Los nombres están traducidos al español rioplatense. Algunos son equivalentes cercanos porque el USDA no
tiene el alimento local exacto (por ejemplo, "Pescadilla / merluza" usa los valores de *whiting*).
Descarga original: https://fdc.nal.usda.gov/download-datasets

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app |
| `data.js` | Base de alimentos (USDA) y ejercicios |
| `sw.js`, `manifest.webmanifest`, `icon-*` | Instalable y funciona sin internet |
| `serve.ps1` | Servidor local para probar en el PC |

## Publicarla gratis para usarla en el celular
Cualquier hosting estático sirve (necesita HTTPS para instalarse):
- **Netlify Drop**: arrastra la carpeta en app.netlify.com/drop.
- **GitHub Pages**: sube los archivos a un repositorio y activa Pages.

Luego en el celular: abre la URL → menú del navegador → **"Añadir a pantalla de inicio"**.

## Datos
Se guardan primero en el navegador del teléfono (localStorage), así la app funciona sin internet.
**Perfil → Exportar** crea una copia en un archivo; **Importar** la restaura.

### Cuenta y nube (Supabase, opcional)
Si inicias sesión en **Perfil → Cuenta**, `sync.js` copia tus datos a Supabase y los trae en tus otros
dispositivos. Solo sube los días que cambiaron. No usa librerías externas, solo `fetch`.

- `config.js`: URL del proyecto y **publishable key**. Ambas son públicas por diseño.
  **Nunca** pongas ahí la secret key ni la service_role key.
- `supabase/schema.sql`: tablas `days` y `settings`, más las reglas de seguridad (RLS) que hacen que
  cada usuario solo pueda ver y cambiar sus propias filas. Se ejecuta una vez en el SQL Editor de Supabase.
- En Supabase → **Authentication → URL Configuration**: *Site URL* = la dirección de Vercel, y en
  *Redirect URLs* añade esa misma dirección y `http://localhost:8080/` (para los correos de confirmación).
