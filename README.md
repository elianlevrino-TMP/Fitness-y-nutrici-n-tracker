# FitLog — entrenamiento + alimentación

App web (PWA) para registrar comidas y entrenos y ver el balance calórico del día.
Sin servidor, sin base de datos en la nube, sin librerías: los datos viven en el teléfono.

## Cómo calcula
- **Basal (BMR)**: Mifflin-St Jeor (1990) con tu peso más reciente. Es la ecuación que más veces acierta
  dentro de ±10% del valor medido (revisión sistemática de Frankenfield et al., J Am Diet Assoc 2005).
- **Gasto sin entreno** = BMR × factor de actividad diaria (1,2 / 1,375 / 1,55 / 1,725, sin contar el gimnasio;
  dentro de los rangos de nivel de actividad de las Dietary Reference Intakes, IOM 2005).
- **Gasto del entreno** (solo lo que suma por encima del reposo, como en las DRI del IOM 2005):
  kcal = (MET − 1) × (1,15 / 0,9) × minutos / 1440 × BMR. MET del Compendium of Physical Activities.
  Fuerza: 3 min por serie si no indicas duración.
- **Objetivo de comida** = gasto total del día + ajuste (−400 perder grasa / 0 / +300 ganar músculo).
  −400 kcal da ≈ 0,5% del peso por semana en una persona promedio, el ritmo que recomiendan las revisiones para
  conservar masa muscular (Helms et al. 2014). Para ganar músculo no hay un superávit exacto establecido
  (Slater et al. 2019); +300 es una opción moderada para limitar la ganancia de grasa.
- **Macros**: proteína = 1,6–2,2 g/kg (Morton et al., Br J Sports Med 2018: el beneficio se estabiliza
  alrededor de 1,6 g/kg); grasas = 25% de las calorías (rango aceptable 20–35%, IOM 2005); carbohidratos = el resto.
- **Ajuste según tu peso real**: con 3 semanas de datos (≥10 días completos y ≥4 pesajes separados por ≥14 días),
  gasto real = lo que comiste en promedio − (tendencia del peso en kg/día × energía por kg). Es el método de
  balance de ingesta (validado con agua doblemente marcada en CALERIE, de Jonge et al. 2007).
  La energía por kg no es un 7700 fijo: 1 kg de grasa ≈ 9441 kcal y 1 kg de masa magra ≈ 1816 kcal
  (Hall et al., Lancet 2011), y la proporción sale de la ecuación de Forbes (Hall, Br J Nutr 2007) con tu
  grasa corporal estimada por IMC, edad y sexo (Deurenberg et al., Br J Nutr 1991).
  La diferencia con la fórmula se propone como corrección del gasto (de a ±250 kcal por semana, máximo ±600)
  y solo se aplica si aceptas. Si registras menos de lo que comes, el ajuste también lo compensa.
- **Plan de comidas automático** (pestaña Comida): arma desayuno, almuerzo, merienda y cena (o las comidas
  que elijas, mínimo 3) con alimentos comunes del USDA y calcula las cantidades para llegar a tu objetivo de
  calorías y macros del día (mínimos cuadrados con límites razonables por alimento, redondeado a unidades
  enteras, de a 50 ml o de a 5–10 g). La proteína se reparte pareja entre las comidas principales
  (≈0,4–0,55 g/kg por comida: Schoenfeld & Aragon, J Int Soc Sports Nutr 2018); las calorías, 25/35/15/25 %
  (un reparto habitual: lo que más importa es el total del día). Se puede cambiar cualquier alimento,
  marcar los que no te gustan, elegir vegetariano y cargar cada comida al día con un toque.
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

### Foto de la etiqueta (IA)
En "Nuevo alimento", **Completar con una foto de la etiqueta** manda la foto (achicada) a la función
`api/etiqueta.js` de Vercel, que la pasa a un modelo de OpenAI y devuelve los valores por 100 g / 100 ml
(si la etiqueta los da por porción, la función los convierte). Siempre se revisan antes de guardar.
- La función solo responde a usuarios con sesión iniciada en FitLog (lo verifica con Supabase).
- **La clave de OpenAI no está en el código**: va en Vercel → Settings → Environment Variables como
  `OPENAI_API_KEY`. Opcional: `OPENAI_MODEL` para cambiar el modelo (por defecto `gpt-5.6-luna`).
- Conviene poner un tope de gasto mensual en el panel de OpenAI (Settings → Limits).

### Productos envasados (código de barras)
El botón de escanear lee el código con la cámara y busca el producto en **Open Food Facts**
(https://world.openfoodfacts.org), una base pública y gratuita con los valores de las etiquetas, cargados
por usuarios (licencia ODbL; se cita la fuente en la app). Solo se envía el número del código. Los valores
se muestran para revisarlos contra el paquete antes de guardar, y el producto queda guardado como alimento
propio: la próxima vez se encuentra sin internet. Si el navegador no trae lector de códigos (iPhone), se usa
la librería libre `barcode-detector` (versión fija, desde cdn.jsdelivr.net).

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
