# Health Details Web

Painel estático para o agente interno Health Details.

O painel chama exclusivamente o proxy relativo `/api/relay`. O endereço do agente e sua chave ficam nas variáveis de servidor da Vercel, nunca no navegador. `vercel.json` encaminha todos os subcaminhos para `api/proxy.js`; `/api/agent` permanece como alias compatível.

O proxy funciona em modo de compatibilidade com `APP_AUTH_REQUIRED=false` e `AGENT_AUTH_REQUIRED=false` no agente. A validação de sessão já existe, mas sua ativação exige uma etapa futura. Não altere essas flags durante a migração do proxy. Mudanças nas variáveis de produção da Vercel precisam de novo deploy para chegar às funções.

GET (incluindo SSE), POST e DELETE preservam caminho, parâmetros repetidos e corpo. Cookies não são encaminhados ao agente. O proxy aguarda o término do streaming e tem duração máxima de 300 segundos no Fluid Compute. Coletas além desse limite precisam de outra estratégia antes de ampliar o uso.

Execute os testes com `node --test`. Os testes do proxy usam um agente simulado local; não coletam equipamentos nem alteram o histórico real.

Com autenticação ativa, o botão Sair limpa o cookie; expiração redireciona ao login e encerra o SSE local. Falhas de rede não causam ciclos de redirecionamento. O botão fica oculto no modo de compatibilidade.

Antes de conferir uma senha, o login reserva uma tentativa no endpoint interno do agente (sempre protegido pela chave). O agente mantém contadores SQLite em `.local-state/`, fora do Git: 10 tentativas por IP em 15 minutos e 100 no total. Só um identificador HMAC do IP é enviado, nunca a senha ou o IP em texto. As tentativas válidas também contam. Os contadores sobrevivem a reinícios e são compartilhados entre instâncias da Vercel. Agente indisponível impede novos logins (503); limite atingido retorna 429 e Retry-After. Não depende de Supabase nem de serviços pagos. O agente requer Node.js 24 para o SQLite integrado.

Nunca salve valores de `AGENT_API_KEY`, `APP_PASSWORD_HASH` ou `SESSION_SIGNING_SECRET` em arquivos rastreados pelo Git.
