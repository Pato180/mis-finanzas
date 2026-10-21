# Mis Finanzas

Aplicación web progresiva (PWA) para organizar finanzas personales desde el navegador. Permite registrar ingresos, gastos y ahorros, consultar el historial y los reportes, definir metas y presupuestos, y programar movimientos recurrentes.

## Funciones principales

- **Movimientos:** ingresos, egresos y dinero apartado para ahorro; categorías y subcategorías; búsqueda y filtros por tipo, fecha y monto.
- **Movimientos recurrentes:** reglas semanales o mensuales, edición de reglas y conservación del historial ya registrado.
- **Próximos pagos y cobros:** vista informativa de las ocurrencias fijas previstas para los siguientes 30 días. No registra movimientos futuros ni los descuenta del saldo antes de tiempo.
- **Presupuestos por categoría:** seguimiento mensual con avisos al alcanzar el 80 % y al llegar o superar el límite. Los avisos nunca bloquean un gasto.
- **Metas de ahorro:** objetivos y aportes vinculados a cada meta, además de ahorro general.
- **Reportes y exportación:** resumen visual, estado de cuenta, descarga en formatos disponibles desde la aplicación y respaldo/restauración de datos.
- **Perfiles:** cada perfil mantiene sus propios datos en el navegador.
- **Uso sin conexión:** la PWA guarda los recursos principales para abrirse sin internet después de haber cargado la aplicación correctamente al menos una vez.

## Cómo usarla

1. Abre la versión publicada mediante HTTPS.
2. Crea un perfil o recupera uno importando un archivo de respaldo.
3. Registra tus ingresos, egresos y ahorros con el botón **+**.
4. Para programar un movimiento, selecciona **Fijo** y elige si se repite semanal o mensualmente.
5. Consulta los presupuestos en la pestaña **Presupuestos** y las próximas ocurrencias en **Resumen**.
6. Descarga periódicamente un respaldo desde **Perfil → Descargar respaldo** y guárdalo en un lugar seguro.

Los movimientos fijos son reglas para generar registros cuando corresponda; la sección de próximos pagos y cobros es una previsión informativa. Los presupuestos se calculan con los gastos registrados en la aplicación, no con compras o pagos que todavía no se hayan anotado.

## Datos y privacidad

Los datos financieros se guardan localmente en el navegador del dispositivo. No existe una sincronización automática entre dispositivos ni un servidor de base de datos configurado por este proyecto. Si borras los datos del navegador, cambias de dispositivo o desinstalas el navegador, podrías perder la información si no tienes un respaldo.

El PIN sirve para bloquear el acceso a la interfaz, **pero no cifra los datos almacenados en el navegador**. No uses el PIN como sustituto de una copia de seguridad ni compartas los archivos de respaldo: contienen información financiera personal. En un dispositivo compartido, cierra o bloquea la aplicación cuando termines.

## Desarrollo y validación

El proyecto está hecho con HTML, CSS y JavaScript, sin un proceso de compilación. Para probarlo localmente, sirve la carpeta mediante un servidor local o HTTPS; abrir directamente `index.html` como archivo no permite probar el service worker.

Con Node.js instalado, ejecuta desde la raíz del repositorio:

```bash
node scripts/validate.js
node scripts/financial-tests.js
```

La validación comprueba la sintaxis del JavaScript, el manifiesto, los iconos, los recursos precargados y las reglas de caché. Las pruebas financieras cubren consistencia de saldos, respaldos y escenarios de recurrencia. GitHub Actions ejecuta ambos comandos en los cambios dirigidos a `main`.

## Versionado

La versión funcional documentada está en el archivo `VERSION`; el historial de cambios se mantiene en [CHANGELOG.md](CHANGELOG.md). El nombre de caché del service worker (por ejemplo, `mis-finanzas-v7`) es independiente de la versión de la aplicación: se incrementa cuando es necesario renovar los recursos guardados para uso sin conexión.

## Repositorio

Código fuente: [Pato180/mis-finanzas](https://github.com/Pato180/mis-finanzas).
