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

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app |
| `data.js` | Base de alimentos y ejercicios (edítala para añadir los tuyos) |
| `sw.js`, `manifest.webmanifest`, `icon-*` | Instalable y funciona sin internet |
| `serve.ps1` | Servidor local para probar en el PC |

## Publicarla gratis para usarla en el celular
Cualquier hosting estático sirve (necesita HTTPS para instalarse):
- **Netlify Drop**: arrastra la carpeta en app.netlify.com/drop.
- **GitHub Pages**: sube los archivos a un repositorio y activa Pages.

Luego en el celular: abre la URL → menú del navegador → **"Añadir a pantalla de inicio"**.

## Datos
Se guardan en el navegador del teléfono (localStorage). Usa **Perfil → Exportar** de vez en cuando
para tener una copia de seguridad; **Importar** la restaura (o la pasa a otro teléfono).
