# rutopia-arch-review

Revisor de arquitectura para PRs de [`MatiasValdes/rutopia_backend`](https://github.com/MatiasValdes/rutopia_backend).

| Qué hace | Detalle |
|----------|---------|
| Trigger | PR opened / reopened / synchronize / ready_for_review (**incluye drafts**) |
| Output | 1 comentario (`@autor`) + check **`rutopia-arch-review`** |
| Idempotencia | Mismo HEAD SHA → no vuelve a comentar |
| Base `master` | `NO CUMPLE` automático (sin modelo) |
| Modelo | **Auto** → `auto-smart` + `optimize_for: balanced` (Cursor Router) |

> **Nota:** Cursor Router (`auto-smart`) suele requerir plan Team/Enterprise.
> Si el deploy o el playground rechazan el modelo, avisá y lo cambiamos a un id fijo.

---

## Forma óptima de usarlo (recomendada)

**No uses** `dev --cursor-events` + `github replay` como flujo diario.
Eso exige login Cursor **y** `gh auth`, y es frágil en local.

### A. Producción = deploy hospedado

Cursor corre el agente y le empuja los eventos de GitHub (misma conexión del dashboard).

1. Conectá GitHub en [cursor.com/dashboard](https://cursor.com/dashboard) e incluí `MatiasValdes/rutopia_backend`.
2. Desde este repo (ya pusheado):

```bash
cd /ruta/a/rutopia-arch-review
npx @grok/agent-sdk@0.4.0 login
npx @grok/agent-sdk@0.4.0 validate --dir .
npx @grok/agent-sdk@0.4.0 deploy --dir . --dry-run --json
npx @grok/agent-sdk@0.4.0 deploy --dir . --cursor-events-repo MatiasValdes/rutopia_backend
```

3. Guardá el **alias token** (primera vez).
4. Abrí o pusheá un PR de prueba en `rutopia_backend` (base ≠ `master`).
5. Esperá comentario + check en el PR.
6. Panel: https://cursor.com/dashboard/deployed-agents

Opcional: en branch protection exigí el check `rutopia-arch-review`.

### B. Local = solo playground / evals (prompt)

Para iterar el prompt **sin** eventos de GitHub:

```bash
cd /ruta/a/rutopia-arch-review
npx @grok/agent-sdk@0.4.0 login
npm run playground
# → http://127.0.0.1:3000/rutopia-arch-review/playground
```

```bash
npm run eval
npm run check
```

En el playground podés pedir un veredicto de ejemplo; el tool `publish_arch_review` en eval/playground **no escribe** en GitHub de verdad (salvo sesión de PR real).

---

## Qué NO hacer (salvo depuración avanzada)

| Evitar | Por qué |
|--------|---------|
| `dev --cursor-events` + `github replay` como flujo principal | Pide `gh auth login` aparte y un server local siempre up |
| Abrir `http://127.0.0.1:3000/playground` | La URL real lleva el slug: `/rutopia-arch-review/playground` |
| Esperar review local sin deploy | Sin hospedaje, Cursor no empuja PRs al proceso de tu laptop |

---

## Actualizar código

```bash
cd /ruta/a/rutopia-arch-review
git pull
npm install
npx @grok/agent-sdk@0.4.0 deploy --dir . --cursor-events-repo MatiasValdes/rutopia_backend
```

---

## Layout

```
bot/instructions.md          # política de review
bot/channels/github.ts       # triggers + gate master + seed diff
bot/tools/publish_arch_review.ts
bot/lib/publish.ts           # comentario + check
evals/smoke.eval.ts
```
