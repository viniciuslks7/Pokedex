# Navegação, interação e acessibilidade

Validação de 25/10/2026, com Node.js 24.19.0 e Chromium headless. Base: commit `5b741d1`, com as correções desta entrega. Revisão dos arquivos offline: `49fdd62197607bd4`.

## Resultado

- **20 de 20 suítes de navegador passaram.**
- **68 de 68 testes de regras passaram.**
- **12 auditorias automatizadas WCAG 2.1 A/AA sem violações detectadas**, com axe-core 4.11.0: dois temas, duas larguras e três estados da interface.
- Consulta real à PokéAPI para Pikachu retornou o número 25, tipo elétrico e cabeçalho CORS permitindo acesso pelo navegador.

## Cobertura

| Área | Suítes aprovadas |
| --- | --- |
| Busca, navegação e recuperação de falhas | `browser`, `exploration`, `discovery`, `section-navigation` |
| Cenários, toque, teclado, áudio e temas | `visual`, `themes-teams` |
| Evoluções, afinidades e estratégia | `strategy`, `attack-coverage`, `team-advisor` |
| Equipes, compartilhamento, filtros e exportação PNG | `trainer`, `sharing-filters`, `team-image` |
| Favoritos, progresso, notas, histórico e backup | `dex-progress`, `field-notes`, `navigation-memory`, `backup-comparison` |
| Prévias, instalação, cache e atualização offline | `preview`, `offline-preview`, `pwa` |
| Contraste, nomes acessíveis e estrutura dos controles | `accessibility` |

As suítes responsivas percorrem larguras de 320 a 1.440 pixels. O menu inclui verificação de foco, Escape, Tab, retorno ao acionador, onze destinos e interação por toque. As auditorias de acessibilidade usam 375 e 1.440 pixels nos temas claro e escuro, na página inicial, no menu e após favoritar, adicionar à equipe, escrever uma nota e abrir filtros.

## Correções verificadas

- Textos secundários e selos dos 18 tipos receberam cores mais escuras para melhorar o contraste, preservando suas cores de fundo e identificação por texto.
- O exportador voltou a inserir o aviso da coleção offline quando o elemento `main` tem atributos. Também passa a interromper a geração se esse elemento estiver ausente.
- Os testes de visualizadores isolados usam um iframe do tamanho da janela, mantendo o sandbox e o bloqueio de armazenamento; cliques continuam sujeitos às verificações normais de visibilidade e obstrução.
- Uma nova suíte de acessibilidade permite repetir a auditoria e registra verificações inconclusivas para avaliação manual.

## Alcance da validação

Os testes foram executados nos arquivos locais da aplicação e nas prévias geradas. O teste PWA serviu o pacote real de `dist/` em um subdiretório, com service worker verdadeiro, recarga sem rede e preservação de dados pessoais. As respostas da maioria das consultas são controladas pelos testes ou vêm da coleção pública já baixada; isso permite testar erros e cancelamentos de forma reproduzível.

O acesso direto a `viniciuslks7.github.io` foi bloqueado pela rede do ambiente (HTTP 403 no proxy). A consulta real à PokéAPI foi verificada separadamente; esta rodada não valida todos os recursos externos no site publicado. Não foram testados Safari/Firefox, aparelhos físicos ou instalação no sistema operacional.

As auditorias automatizadas não substituem avaliação com leitores de tela e pessoas com deficiência. Os resultados incluem verificações inconclusivas de contraste e referências ARIA, que exigem avaliação manual.

## Repetir

Os comandos para preparar as prévias, instalar as ferramentas e executar cada suíte estão em [README.md](README.md#verificar). A auditoria adicional usa:

```sh
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/accessibility.cjs
```

O relatório detalhado dessa auditoria é gravado em `/tmp/pokedex-accessibility-results.json`.
