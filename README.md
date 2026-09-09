# Controle de Outorga e Irrigação — SAKUMA Agronegócios

Sistema para gerar e imprimir, em A4:

- **Outorga** — fichas de horímetro, hidrômetro e leitura de equipamento, por local e ponto de controle, frente e verso, com as linhas ajustadas aos dias do mês.
- **Irrigação** — controle mensal de irrigação por fazenda e produtor (G8 e SAKUMA), com impressão por bloco: cada combinação fazenda + produtor + mês sai em uma página.

Locais e pontos de controle são cadastrados na própria tela ("Gerenciar locais") e ficam salvos no banco (Supabase). Sem banco configurado, o cadastro fica salvo no navegador.

## Arquivos

- `index.html` — estrutura e estilo
- `app.js` — lógica, cadastro e acesso ao banco
- `logo-sakuma.png` — marca SAKUMA
- `banco.sql` — estrutura das tabelas para rodar uma vez no SQL Editor do Supabase

## Banco

Preencher no topo de `app.js`:

```js
const DB = { url: "https://SEU-PROJETO.supabase.co", key: "CHAVE_ANON" };
```
