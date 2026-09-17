# Health Details Web

Painel estático para o agente interno Health Details.

Enquanto o modo de compatibilidade estiver ativo, `app-settings.js` define a URL HTTPS pública do agente interno. O painel continua chamando essa URL diretamente.

O projeto também contém rotas do Vercel para sessão por cookie e proxy autenticado do agente. Elas ficam inativas enquanto `APP_AUTH_REQUIRED=false`. Quando essa proteção for ativada em uma etapa futura, configure as variáveis de produção seguindo `.env.example`, mantenha os segredos apenas no Vercel e troque o frontend para usar o proxy relativo `/api/agent`.

Nunca salve valores de `AGENT_API_KEY`, `APP_PASSWORD_HASH` ou `SESSION_SIGNING_SECRET` em arquivos rastreados pelo Git.
